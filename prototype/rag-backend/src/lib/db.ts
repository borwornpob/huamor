import { neon } from "@neondatabase/serverless";
import { config } from "../config.js";
import { hashPassword } from "./auth.js";
import { ensureDefaultIndexVersion } from "./ops.js";

let sqlClient: ReturnType<typeof neon> | null = null;
let dbEnabled = Boolean(config.databaseUrl);

export function hasDatabase(): boolean {
  return dbEnabled;
}

export function disableDatabase(reason?: string): void {
  dbEnabled = false;
  sqlClient = null;
  if (reason) {
    console.warn(`[db] Disabled Neon persistence: ${reason}`);
  }
}

export function getSqlClient(): ReturnType<typeof neon> {
  if (!dbEnabled || !config.databaseUrl) {
    throw new Error("DATABASE_URL is required for Neon persistence");
  }

  if (!sqlClient) {
    sqlClient = neon(config.databaseUrl);
  }

  return sqlClient;
}

export async function initDatabase(): Promise<void> {
  if (!hasDatabase()) {
    return;
  }

  try {
    const sql = getSqlClient();

    await sql`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        latest_draft TEXT,
        retrieval_context JSONB,
        doctor_edit JSONB,
        runtime_metadata JSONB
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        display_name TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        birth_date TEXT NOT NULL,
        gender TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL
      );
    `;

    await sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_patient_id ON chat_sessions(patient_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`;
    await sql`
      CREATE TABLE IF NOT EXISTS inference_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        user_message TEXT NOT NULL,
        provider TEXT NOT NULL,
        model_version TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        index_version TEXT NOT NULL,
        retrieval_source TEXT NOT NULL,
        retrieval_count INTEGER NOT NULL,
        fallback_reason TEXT,
        latency_ms INTEGER NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS review_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        doctor_id TEXT NOT NULL,
        severity TEXT,
        recommended_department TEXT,
        requires_escalation BOOLEAN,
        review_outcome TEXT,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS index_versions (
        id TEXT PRIMARY KEY,
        index_version TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL,
        model_version TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        collection_name TEXT NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS eval_runs (
        id TEXT PRIMARY KEY,
        index_version TEXT NOT NULL,
        status TEXT NOT NULL,
        metrics JSONB NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS drift_reports (
        id TEXT PRIMARY KEY,
        index_version TEXT NOT NULL,
        status TEXT NOT NULL,
        metrics JSONB NOT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_inference_events_session_id ON inference_events(session_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_inference_events_generated_at ON inference_events(generated_at);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_review_events_session_id ON review_events(session_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_index_versions_state ON index_versions(state);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_eval_runs_index_version ON eval_runs(index_version);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_drift_reports_index_version ON drift_reports(index_version);`;

    if (config.allowDemoUsers) {
      const now = new Date().toISOString();
      await sql`
        INSERT INTO users (id, email, username, password_hash, role, display_name, first_name, last_name, birth_date, gender, created_at)
        VALUES
          (${"u_patient_01"}, ${"patient1@example.com"}, ${"patient1"}, ${hashPassword("patient123")}, ${"patient"}, ${"Patient Demo"}, ${"Patient"}, ${"Demo"}, ${"1990-01-01"}, ${"other"}, ${now}),
          (${"u_doctor_01"}, ${"doctor1@example.com"}, ${"doctor1"}, ${hashPassword("doctor123")}, ${"doctor"}, ${"Doctor Demo"}, ${"Doctor"}, ${"Demo"}, ${"1980-01-01"}, ${"other"}, ${now})
        ON CONFLICT (username) DO NOTHING;
      `;
    }
    await ensureDefaultIndexVersion(config.qdrantCollection || config.activeIndexVersion);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    disableDatabase(message);
  }
}
