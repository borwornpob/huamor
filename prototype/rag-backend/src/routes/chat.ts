import { Hono } from "hono";
import { z } from "zod";
import { config } from "../config.js";
import { runChatGraph } from "../graph/chatGraph.js";
import type { SupportedLlmProvider } from "../lib/llm.js";
import { incrementMetric } from "../lib/metrics.js";
import { getActiveIndexRecord, recordInferenceEvent } from "../lib/ops.js";
import { chatStore } from "../lib/store.js";
import { authRequired, getAuth } from "../middleware/auth.js";

const startSchema = z.object({
  message: z.string().min(1),
  provider: z.enum(["sealion", "gemini", "openrouter"]).optional(),
});

const continueSchema = z.object({
  message: z.string().min(1),
  provider: z.enum(["sealion", "gemini", "openrouter"]).optional(),
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const chatRouter = new Hono();

chatRouter.use("*", authRequired);

function deriveRetrievalSource(sourceSet: Set<string>): "qdrant" | "local" | "mixed" | "none" {
  if (sourceSet.size === 0) {
    return "none";
  }
  if (sourceSet.size > 1) {
    return "mixed";
  }
  return sourceSet.has("qdrant") ? "qdrant" : "local";
}

async function resolveRuntimeIndexVersion(): Promise<string> {
  const active = await getActiveIndexRecord();
  return active?.indexVersion ?? config.activeIndexVersion;
}

chatRouter.post("/start", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "patient") {
    return c.json({ error: "Only patient can start chat" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const session = await chatStore.create(auth.userId, parsed.data.message);
  const startedAt = Date.now();
  const graphResult = await runChatGraph(parsed.data.message, parsed.data.provider as SupportedLlmProvider | undefined);
  const latencyMs = Date.now() - startedAt;

  await chatStore.appendMessage(session.id, {
    role: "assistant",
    content: graphResult.draftReply,
  });

  const indexVersion = await resolveRuntimeIndexVersion();
  const runtimeMetadata = {
    provider: parsed.data.provider ?? config.llmProvider,
    modelVersion: config.sealionModel,
    promptVersion: config.promptVersion,
    indexVersion,
    retrievalSource: deriveRetrievalSource(new Set(graphResult.retrieved.map((item) => item.source))),
    retrievalCount: graphResult.retrieved.length,
    fallbackReason: graphResult.fallbackReason,
    latencyMs,
    generatedAt: new Date().toISOString(),
  };
  session.latestDraft = graphResult.draftReply;
  session.retrievalContext = graphResult.retrieved.map((item) => item.text);
  session.lastRuntimeMetadata = runtimeMetadata;
  session.status = "active";
  const updated = await chatStore.update(session);
  await recordInferenceEvent({
    sessionId: session.id,
    patientId: session.patientId,
    userMessage: parsed.data.message,
    runtime: runtimeMetadata,
  });
  incrementMetric("api_chat_requests_total");
  incrementMetric("api_chat_retrieval_contexts_total", graphResult.retrieved.length);
  if (graphResult.fallbackReason) {
    incrementMetric("api_chat_fallback_total");
  }

  return c.json({
    session: updated,
    checkpointRequired: false,
  });
});

chatRouter.post("/:sessionId/message", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "patient") {
    return c.json({ error: "Only patient can send message" }, 403);
  }

  const session = await chatStore.get(c.req.param("sessionId"));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  if (session.patientId !== auth.userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = continueSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  await chatStore.appendMessage(session.id, { role: "user", content: parsed.data.message });
  const startedAt = Date.now();
  const graphResult = await runChatGraph(parsed.data.message, parsed.data.provider as SupportedLlmProvider | undefined);
  const latencyMs = Date.now() - startedAt;

  await chatStore.appendMessage(session.id, {
    role: "assistant",
    content: graphResult.draftReply,
  });

  const indexVersion = await resolveRuntimeIndexVersion();
  const runtimeMetadata = {
    provider: parsed.data.provider ?? config.llmProvider,
    modelVersion: config.sealionModel,
    promptVersion: config.promptVersion,
    indexVersion,
    retrievalSource: deriveRetrievalSource(new Set(graphResult.retrieved.map((item) => item.source))),
    retrievalCount: graphResult.retrieved.length,
    fallbackReason: graphResult.fallbackReason,
    latencyMs,
    generatedAt: new Date().toISOString(),
  };
  session.latestDraft = graphResult.draftReply;
  session.retrievalContext = graphResult.retrieved.map((item) => item.text);
  session.lastRuntimeMetadata = runtimeMetadata;
  session.status = "active";
  const updated = await chatStore.update(session);
  await recordInferenceEvent({
    sessionId: session.id,
    patientId: session.patientId,
    userMessage: parsed.data.message,
    runtime: runtimeMetadata,
  });
  incrementMetric("api_chat_requests_total");
  incrementMetric("api_chat_retrieval_contexts_total", graphResult.retrieved.length);
  if (graphResult.fallbackReason) {
    incrementMetric("api_chat_fallback_total");
  }

  return c.json({
    session: updated,
    checkpointRequired: false,
  });
});

chatRouter.get("/sessions", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "patient") {
    return c.json({ error: "Only patient can view own sessions" }, 403);
  }

  const parsed = listSchema.safeParse({
    limit: c.req.query("limit"),
  });
  if (!parsed.success) {
    return c.json({ error: "Invalid query params" }, 400);
  }

  const sessions = await chatStore.listByPatient(auth.userId, parsed.data.limit ?? 20);
  return c.json({ sessions });
});

chatRouter.get("/sessions/:sessionId/history", async (c) => {
  const auth = getAuth(c);
  const session = await chatStore.get(c.req.param("sessionId"));

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  if (auth.role === "patient" && session.patientId !== auth.userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const messages = await chatStore.getHistory(session.id);
  return c.json({ sessionId: session.id, messages: messages ?? [] });
});

chatRouter.get("/:sessionId", async (c) => {
  const auth = getAuth(c);
  const session = await chatStore.get(c.req.param("sessionId"));

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  if (auth.role === "patient" && session.patientId !== auth.userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  return c.json({ session });
});

chatRouter.get("/:sessionId/history", async (c) => {
  const auth = getAuth(c);
  const session = await chatStore.get(c.req.param("sessionId"));

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  if (auth.role === "patient" && session.patientId !== auth.userId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const messages = await chatStore.getHistory(session.id);
  return c.json({ session, messages: messages ?? [] });
});
