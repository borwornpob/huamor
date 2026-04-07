import dotenv from "dotenv";

dotenv.config();

function toNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  databaseUrl: process.env.DATABASE_URL ?? "",
  trustForwardedUserHeaders: toBool(process.env.TRUST_FORWARDED_USER_HEADERS, false),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret",
  pdfDataDir: process.env.PDF_DATA_DIR ?? "./data/pdfs",
  qdrantUrl: process.env.QDRANT_URL ?? "",
  qdrantApiKey: process.env.QDRANT_API_KEY ?? "",
  qdrantCollection: process.env.QDRANT_COLLECTION ?? "",
  qdrantTextPayloadKey: process.env.QDRANT_TEXT_PAYLOAD_KEY ?? "text",
  qdrantVectorName: process.env.QDRANT_VECTOR_NAME ?? "",
  qdrantScoreThreshold: toNumber(process.env.QDRANT_SCORE_THRESHOLD, 0),
  embeddingProvider: process.env.EMBEDDING_PROVIDER ?? "huggingface",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "BAAI/bge-m3",
  huggingFaceApiKey: process.env.HUGGINGFACE_API_KEY ?? "",
  huggingFaceBaseUrl: process.env.HUGGINGFACE_BASE_URL ?? "https://api-inference.huggingface.co/models",
  pythonExecutable: process.env.PYTHON_EXECUTABLE ?? "python3",
  sentenceTransformersScript: process.env.SENTENCE_TRANSFORMERS_SCRIPT ?? "./scripts/embed_query.py",
  sentenceTransformersTimeoutMs: toNumber(process.env.SENTENCE_TRANSFORMERS_TIMEOUT_MS, 120000),
  llmProvider: process.env.LLM_PROVIDER ?? "sealion",
  llmTemperature: toNumber(process.env.LLM_TEMPERATURE, 0.1),
  sealionApiKey: process.env.SEALION_API_KEY ?? "",
  sealionBaseUrl: process.env.SEALION_BASE_URL ?? "https://api.sea-lion.ai/v1",
  sealionModel: process.env.SEALION_MODEL ?? "aisingapore/Gemma-SEA-LION-v4-27B-IT",
};
