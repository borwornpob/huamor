import { Hono } from "hono";
import { z } from "zod";
import { incrementMetric } from "../lib/metrics.js";
import { recordReviewEvent } from "../lib/ops.js";
import { upsertReviewedContentToQdrant } from "../lib/retrieval.js";
import { chatStore } from "../lib/store.js";
import { authRequired, getAuth } from "../middleware/auth.js";

const approveSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
  note: z.string().optional(),
  approvedContent: z.string().min(1).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  recommendedDepartment: z.string().min(1).optional(),
  requiresEscalation: z.boolean().optional(),
  reviewOutcome: z.enum(["approved", "corrected", "rejected"]).optional(),
});

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  patientId: z.string().min(1).optional(),
});

export const expertRouter = new Hono();

expertRouter.use("*", authRequired);

async function handleReviewRequest(c: any) {
  const auth = getAuth(c);
  if (auth.role !== "doctor") {
    return c.json({ error: "Doctor role required" }, 403);
  }

  const session = await chatStore.get(c.req.param("sessionId"));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const answer = parsed.data.answer || parsed.data.approvedContent || "";
  if (!answer.trim()) {
    return c.json({ error: "Answer is required" }, 400);
  }

  session.doctorEdit = {
    doctorId: auth.userId,
    approvedAt: new Date().toISOString(),
    question: parsed.data.question,
    answer,
    content: answer,
    note: parsed.data.note,
    severity: parsed.data.severity,
    recommendedDepartment: parsed.data.recommendedDepartment,
    requiresEscalation: parsed.data.requiresEscalation,
    reviewOutcome: parsed.data.reviewOutcome,
  };

  session.status = "completed";
  await chatStore.appendMessage(session.id, {
    role: "doctor",
    content: parsed.data.question,
  });
  await chatStore.appendMessage(session.id, {
    role: "assistant",
    content: answer,
  });

  const upsertResult = await upsertReviewedContentToQdrant({
    sessionId: session.id,
    patientId: session.patientId,
    reviewedBy: auth.userId,
    content: answer,
    note: parsed.data.note,
  });

  const updated = await chatStore.update(session);
  await recordReviewEvent({
    sessionId: session.id,
    patientId: session.patientId,
    doctorId: auth.userId,
    severity: parsed.data.severity,
    recommendedDepartment: parsed.data.recommendedDepartment,
    requiresEscalation: parsed.data.requiresEscalation,
    reviewOutcome: parsed.data.reviewOutcome,
    note: parsed.data.note,
  });
  incrementMetric("api_expert_reviews_total");
  if (parsed.data.requiresEscalation) {
    incrementMetric("api_expert_escalations_total");
  }

  return c.json({ session: updated, qdrant: upsertResult });
}

expertRouter.get("/pending", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "doctor") {
    return c.json({ error: "Doctor role required" }, 403);
  }

  const sessions = await chatStore.pendingDoctorReview();
  return c.json({ sessions });
});

expertRouter.get("/sessions", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "doctor") {
    return c.json({ error: "Doctor role required" }, 403);
  }

  const parsed = listSchema.safeParse({
    limit: c.req.query("limit"),
    patientId: c.req.query("patientId"),
  });
  if (!parsed.success) {
    return c.json({ error: "Invalid query params" }, 400);
  }

  const sessions = await chatStore.listAll(parsed.data.limit ?? 100, parsed.data.patientId);
  return c.json({ sessions });
});

expertRouter.get("/sessions/:sessionId/history", async (c) => {
  const auth = getAuth(c);
  if (auth.role !== "doctor") {
    return c.json({ error: "Doctor role required" }, 403);
  }

  const session = await chatStore.get(c.req.param("sessionId"));
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const messages = await chatStore.getHistory(session.id);
  return c.json({ session, messages: messages ?? [] });
});

expertRouter.post("/sessions/:sessionId/review", async (c) => {
  return handleReviewRequest(c);
});

expertRouter.post("/:sessionId/approve", async (c) => {
  return handleReviewRequest(c);
});
