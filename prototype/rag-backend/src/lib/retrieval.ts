import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "../config.js";
import { getActiveIndexRecord } from "./ops.js";
import type { RetrievalResult } from "../shared/types.js";

let qdrantClient: QdrantClient | null = null;
let qdrantReady = false;
let localCorpus: string[] | null = null;

function hasQdrantConfig(): boolean {
  return Boolean(config.qdrantUrl && config.qdrantCollection);
}

async function resolveActiveCollectionName(): Promise<string> {
  const active = await getActiveIndexRecord();
  return active?.collectionName || config.qdrantCollection;
}

function getQdrantClient(): QdrantClient | null {
  if (!hasQdrantConfig()) {
    return null;
  }

  if (!qdrantClient) {
    const parsed = new URL(config.qdrantUrl);
    const isHttps = parsed.protocol === "https:";
    const port = parsed.port ? Number(parsed.port) : isHttps ? 443 : 80;
    const prefix = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : undefined;

    qdrantClient = new QdrantClient({
      host: parsed.hostname,
      https: isHttps,
      port,
      prefix,
      apiKey: config.qdrantApiKey || undefined,
      checkCompatibility: false,
    });
  }

  return qdrantClient;
}

function l2Normalize(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((acc, v) => acc + v * v, 0));
  if (norm === 0) {
    return values;
  }

  return values.map((v) => v / norm);
}

function meanPool(rows: number[][]): number[] {
  if (rows.length === 0) {
    return [];
  }

  const size = rows[0]?.length ?? 0;
  if (size === 0) {
    return [];
  }

  const acc = new Array<number>(size).fill(0);
  for (const row of rows) {
    for (let i = 0; i < size; i += 1) {
      acc[i] += row[i] ?? 0;
    }
  }

  return acc.map((v) => v / rows.length);
}

function parseEmbeddingResponse(raw: unknown): number[] {
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (typeof first === "number") {
      return l2Normalize(raw.filter((v): v is number => typeof v === "number"));
    }

    if (Array.isArray(first) && first.length > 0 && typeof first[0] === "number") {
      return l2Normalize(meanPool(raw as number[][]));
    }
  }

  throw new Error("Unexpected Hugging Face embedding response shape");
}

function runLocalSentenceTransformers(query: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(config.sentenceTransformersScript);
    const child = spawn(config.pythonExecutable, [scriptPath, "--model", config.embeddingModel, "--query", query], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Local sentence-transformers timed out after ${config.sentenceTransformersTimeoutMs}ms`));
    }, config.sentenceTransformersTimeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Local sentence-transformers failed (exit ${code}): ${stderr.trim() || "no stderr"}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as unknown;
        if (!Array.isArray(parsed)) {
          reject(new Error("Local sentence-transformers output is not an array"));
          return;
        }

        const vector = parsed.filter((v): v is number => typeof v === "number");
        if (vector.length === 0) {
          reject(new Error("Local sentence-transformers returned an empty embedding"));
          return;
        }

        resolve(vector);
      } catch (error) {
        reject(new Error(`Failed to parse local sentence-transformers output: ${String(error)}`));
      }
    });
  });
}

async function embedQuery(query: string): Promise<number[]> {
  if (config.embeddingProvider === "sentence-transformers") {
    return await runLocalSentenceTransformers(query);
  }

  if (config.embeddingProvider !== "huggingface") {
    throw new Error(`Unsupported EMBEDDING_PROVIDER: ${config.embeddingProvider}`);
  }

  const endpoint = `${config.huggingFaceBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(config.embeddingModel)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.huggingFaceApiKey ? { Authorization: `Bearer ${config.huggingFaceApiKey}` } : {}),
    },
    body: JSON.stringify({
      inputs: query,
      options: { wait_for_model: true },
      parameters: { normalize: true, truncation: true },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hugging Face embedding request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as unknown;
  if (payload && typeof payload === "object" && "error" in (payload as Record<string, unknown>)) {
    throw new Error(`Hugging Face embedding error: ${String((payload as Record<string, unknown>).error)}`);
  }

  return parseEmbeddingResponse(payload);
}

function payloadToContext(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const value = (payload as Record<string, unknown>)[config.qdrantTextPayloadKey];
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string").join("\n");
  }

  return "";
}

async function readDocumentsFromDisk(): Promise<string[]> {
  const root = path.resolve(config.pdfDataDir);
  if (!fs.existsSync(root)) {
    return [
      "หากผู้ป่วยมีอาการเจ็บหน้าอกเฉียบพลัน หายใจลำบาก หน้ามืด ให้แนะนำพบแพทย์ฉุกเฉินทันที",
      "หากอาการทั่วไปไม่รุนแรง สามารถประเมินเบื้องต้นและแนะนำแผนกอายุรกรรมเพื่อรับการตรวจเพิ่มเติม",
    ];
  }

  const files = fs
    .readdirSync(root)
    .filter((name) => name.toLowerCase().endsWith(".txt") || name.toLowerCase().endsWith(".md"));

  const docs: string[] = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), "utf8").trim();
    if (!text) {
      continue;
    }
    docs.push(text);
  }

  if (docs.length === 0) {
    return [
      "หากผู้ป่วยมีอาการเจ็บหน้าอกเฉียบพลัน หายใจลำบาก หน้ามืด ให้แนะนำพบแพทย์ฉุกเฉินทันที",
      "หากอาการทั่วไปไม่รุนแรง สามารถประเมินเบื้องต้นและแนะนำแผนกอายุรกรรมเพื่อรับการตรวจเพิ่มเติม",
    ];
  }

  return docs;
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function lexicalScore(query: string, text: string): number {
  const qTokens = tokenize(query);
  const tTokens = new Set(tokenize(text));
  if (qTokens.length === 0 || tTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of qTokens) {
    if (tTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / qTokens.length;
}

function retrieveFromLocalCorpus(query: string, topK: number): RetrievalResult[] {
  if (!localCorpus || localCorpus.length === 0) {
    return [];
  }

  return localCorpus
    .map((text) => ({ text, score: lexicalScore(query, text) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .filter((row) => Boolean(row.text))
    .map((row) => ({
      text: row.text,
      score: row.score,
      source: "local" as const,
    }));
}

export async function ensureRetrievalReady(): Promise<void> {
  if (qdrantReady || localCorpus) {
    return;
  }

  const client = getQdrantClient();
  if (client) {
    try {
      await client.getCollection(await resolveActiveCollectionName());
      qdrantReady = true;
      return;
    } catch (error) {
      console.warn(`Qdrant is not ready, using local fallback retrieval: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  localCorpus = await readDocumentsFromDisk();
}

export async function retrieveContext(query: string, topK = 3): Promise<RetrievalResult[]> {
  const client = getQdrantClient();
  if (client) {
    try {
      const collectionName = await resolveActiveCollectionName();
      const vector = await embedQuery(query);
      const vectorInput = config.qdrantVectorName
        ? { name: config.qdrantVectorName, vector }
        : vector;

      const points = await client.search(collectionName, {
        vector: vectorInput,
        limit: topK,
        with_payload: true,
        score_threshold: config.qdrantScoreThreshold > 0 ? config.qdrantScoreThreshold : undefined,
      });

      const contexts = points
        .map((p) => ({
          text: payloadToContext(p.payload),
          score: typeof p.score === "number" ? p.score : undefined,
          source: "qdrant" as const,
        }))
        .filter((row) => Boolean(row.text));
      if (contexts.length > 0) {
        return contexts;
      }
    } catch (error) {
      console.warn(`Qdrant retrieval failed, using local fallback retrieval: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await ensureRetrievalReady();
  return retrieveFromLocalCorpus(query, topK);
}

export async function upsertReviewedContentToQdrant(input: {
  sessionId: string;
  patientId: string;
  reviewedBy: string;
  content: string;
  note?: string;
}): Promise<{ ok: boolean; pointId?: string; reason?: string }> {
  const client = getQdrantClient();
  if (!client) {
    return { ok: false, reason: "qdrant_not_configured" };
  }

  if (!input.content.trim()) {
    return { ok: false, reason: "empty_content" };
  }

  try {
    const collectionName = await resolveActiveCollectionName();
    const vector = await embedQuery(input.content);
    const pointId = randomUUID();
    const vectorPayload = config.qdrantVectorName
      ? { [config.qdrantVectorName]: vector }
      : vector;

    const payload = {
      doc_id: pointId,
      "tenant-id": input.patientId,
      source: "expert_review",
      session_id: input.sessionId,
      reviewed_by: input.reviewedBy,
      review_note: input.note ?? null,
      text: input.content,
      updated_at: new Date().toISOString(),
    };

    await client.upsert(collectionName, {
      wait: true,
      points: [
        {
          id: pointId,
          vector: vectorPayload,
          payload,
        },
      ],
    });

    return { ok: true, pointId };
  } catch (error) {
    console.warn(`Failed to upsert reviewed content to Qdrant: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, reason: "upsert_failed" };
  }
}
