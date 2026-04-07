import { neon } from "@neondatabase/serverless";
import { config } from "../config.js";
import { hashPassword } from "./auth.js";

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
        doctor_edit JSONB
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

    const now = new Date().toISOString();
    await sql`
      INSERT INTO users (id, email, username, password_hash, role, display_name, first_name, last_name, birth_date, gender, created_at)
      VALUES
        (${"u_patient_01"}, ${"patient1@example.com"}, ${"patient1"}, ${hashPassword("patient123")}, ${"patient"}, ${"Patient Demo"}, ${"Patient"}, ${"Demo"}, ${"1990-01-01"}, ${"other"}, ${now}),
        (${"u_doctor_01"}, ${"doctor1@example.com"}, ${"doctor1"}, ${hashPassword("doctor123")}, ${"doctor"}, ${"Doctor Demo"}, ${"Doctor"}, ${"Demo"}, ${"1980-01-01"}, ${"other"}, ${now})
      ON CONFLICT (username) DO NOTHING;
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    disableDatabase(message);
  }
}
