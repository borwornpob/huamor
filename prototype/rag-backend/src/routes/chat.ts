import { Hono } from "hono";
import { z } from "zod";
import { runChatGraph } from "../graph/chatGraph.js";
import type { SupportedLlmProvider } from "../lib/llm.js";
import { chatStore } from "../lib/store.js";
import { authRequired, getAuth } from "../middleware/auth.js";

const startSchema = z.object({
  message: z.string().min(1),
  provider: z.enum(["sealion"]).optional(),
});

const continueSchema = z.object({
  message: z.string().min(1),
  provider: z.enum(["sealion"]).optional(),
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const chatRouter = new Hono();

chatRouter.use("*", authRequired);

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
  const graphResult = await runChatGraph(parsed.data.message, parsed.data.provider as SupportedLlmProvider | undefined);

  await chatStore.appendMessage(session.id, {
    role: "assistant",
    content: graphResult.draftReply,
  });

  session.latestDraft = graphResult.draftReply;
  session.retrievalContext = graphResult.retrieved;
  session.status = "active";
  const updated = await chatStore.update(session);

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
  const graphResult = await runChatGraph(parsed.data.message, parsed.data.provider as SupportedLlmProvider | undefined);

  await chatStore.appendMessage(session.id, {
    role: "assistant",
    content: graphResult.draftReply,
  });

  session.latestDraft = graphResult.draftReply;
  session.retrievalContext = graphResult.retrieved;
  session.status = "active";
  const updated = await chatStore.update(session);

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
