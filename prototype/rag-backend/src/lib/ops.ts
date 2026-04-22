import { randomUUID } from "node:crypto";
import { getSqlClient, hasDatabase } from "./db.js";
import type { SessionRuntimeMetadata } from "../shared/types.js";

type IndexVersionState = "candidate" | "active" | "rolled_back" | "failed";
type EvalRunStatus = "passed" | "failed" | "running";
type DriftStatus = "ok" | "warn" | "critical";

function asRowArray(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) {
    return result as Record<string, unknown>[];
  }

  if (result && typeof result === "object" && "rows" in (result as Record<string, unknown>)) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) {
      return rows as Record<string, unknown>[];
    }
  }

  return [];
}

export async function ensureDefaultIndexVersion(indexVersion: string): Promise<void> {
  if (!hasDatabase()) {
    return;
  }

  const sql = getSqlClient();
  await sql`
    INSERT INTO index_versions (id, index_version, state, model_version, prompt_version, collection_name, created_at, updated_at)
    VALUES (${randomUUID()}, ${indexVersion}, ${"active"}, ${"bootstrap"}, ${"bootstrap"}, ${indexVersion}, ${new Date().toISOString()}, ${new Date().toISOString()})
    ON CONFLICT (index_version) DO NOTHING
  `;
}

export async function recordInferenceEvent(input: {
  sessionId: string;
  patientId: string;
  userMessage: string;
  runtime: SessionRuntimeMetadata;
}): Promise<void> {
  if (!hasDatabase()) {
    return;
  }

  const sql = getSqlClient();
  await sql`
    INSERT INTO inference_events (
      id,
      session_id,
      patient_id,
      user_message,
      provider,
      model_version,
      prompt_version,
      index_version,
      retrieval_source,
      retrieval_count,
      fallback_reason,
      latency_ms,
      generated_at
    )
    VALUES (
      ${randomUUID()},
      ${input.sessionId},
      ${input.patientId},
      ${input.userMessage},
      ${input.runtime.provider},
      ${input.runtime.modelVersion},
      ${input.runtime.promptVersion},
      ${input.runtime.indexVersion},
      ${input.runtime.retrievalSource},
      ${input.runtime.retrievalCount},
      ${input.runtime.fallbackReason ?? null},
      ${input.runtime.latencyMs},
      ${input.runtime.generatedAt}
    )
  `;
}

export async function recordReviewEvent(input: {
  sessionId: string;
  patientId: string;
  doctorId: string;
  severity?: string;
  recommendedDepartment?: string;
  requiresEscalation?: boolean;
  reviewOutcome?: string;
  note?: string;
}): Promise<void> {
  if (!hasDatabase()) {
    return;
  }

  const sql = getSqlClient();
  await sql`
    INSERT INTO review_events (
      id,
      session_id,
      patient_id,
      doctor_id,
      severity,
      recommended_department,
      requires_escalation,
      review_outcome,
      note,
      created_at
    )
    VALUES (
      ${randomUUID()},
      ${input.sessionId},
      ${input.patientId},
      ${input.doctorId},
      ${input.severity ?? null},
      ${input.recommendedDepartment ?? null},
      ${input.requiresEscalation ?? null},
      ${input.reviewOutcome ?? null},
      ${input.note ?? null},
      ${new Date().toISOString()}
    )
  `;
}

export async function recordIndexVersion(input: {
  indexVersion: string;
  state: IndexVersionState;
  modelVersion: string;
  promptVersion: string;
  collectionName: string;
  notes?: string;
}): Promise<void> {
  if (!hasDatabase()) {
    return;
  }

  const sql = getSqlClient();
  const now = new Date().toISOString();
  await sql`
    INSERT INTO index_versions (id, index_version, state, model_version, prompt_version, collection_name, notes, created_at, updated_at)
    VALUES (${randomUUID()}, ${input.indexVersion}, ${input.state}, ${input.modelVersion}, ${input.promptVersion}, ${input.collectionName}, ${input.notes ?? null}, ${now}, ${now})
    ON CONFLICT (index_version)
    DO UPDATE SET
      state = EXCLUDED.state,
      model_version = EXCLUDED.model_version,
      prompt_version = EXCLUDED.prompt_version,
      collection_name = EXCLUDED.collection_name,
      notes = EXCLUDED.notes,
      updated_at = EXCLUDED.updated_at
  `;
}

export async function recordEvalRun(input: {
  indexVersion: string;
  status: EvalRunStatus;
  metrics: Record<string, number>;
  notes?: string;
}): Promise<void> {
  if (!hasDatabase()) {
    return;
  }

  const sql = getSqlClient();
  await sql`
    INSERT INTO eval_runs (id, index_version, status, metrics, notes, created_at)
    VALUES (${randomUUID()}, ${input.indexVersion}, ${input.status}, ${JSON.stringify(input.metrics)}::jsonb, ${input.notes ?? null}, ${new Date().toISOString()})
  `;
}

export async function recordDriftReport(input: {
  indexVersion: string;
  status: DriftStatus;
  metrics: Record<string, number>;
  notes?: string;
}): Promise<void> {
  if (!hasDatabase()) {
    return;
  }

  const sql = getSqlClient();
  await sql`
    INSERT INTO drift_reports (id, index_version, status, metrics, notes, created_at)
    VALUES (${randomUUID()}, ${input.indexVersion}, ${input.status}, ${JSON.stringify(input.metrics)}::jsonb, ${input.notes ?? null}, ${new Date().toISOString()})
  `;
}

export async function listPendingPromotions(): Promise<Array<Record<string, unknown>>> {
  if (!hasDatabase()) {
    return [];
  }

  const sql = getSqlClient();
  return asRowArray(await sql`
    SELECT iv.*
    FROM index_versions iv
    WHERE iv.state = ${"candidate"}
    ORDER BY iv.updated_at DESC
  `);
}

export async function getActiveIndexRecord(): Promise<{ indexVersion: string; collectionName: string } | null> {
  if (!hasDatabase()) {
    return null;
  }

  const sql = getSqlClient();
  const rows = asRowArray(await sql`
    SELECT index_version, collection_name
    FROM index_versions
    WHERE state = ${"active"}
    ORDER BY updated_at DESC
    LIMIT 1
  `);
  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    indexVersion: String(row.index_version),
    collectionName: String(row.collection_name),
  };
}
