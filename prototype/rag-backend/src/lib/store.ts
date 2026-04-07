import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "./auth.js";
import { getSqlClient, hasDatabase } from "./db.js";
import type { ChatMessage, ChatSession, User } from "../shared/types.js";

type StoredUser = User & {
  passwordHash: string;
  createdAt: string;
};

const seedUsers: StoredUser[] = [
  {
    id: "u_patient_01",
    email: "patient1@example.com",
    username: "patient1",
    role: "patient",
    displayName: "Patient Demo",
    firstName: "Patient",
    lastName: "Demo",
    birthDate: "1990-01-01",
    gender: "other",
    passwordHash: hashPassword("patient123"),
    createdAt: new Date().toISOString(),
  },
  {
    id: "u_doctor_01",
    email: "doctor1@example.com",
    username: "doctor1",
    role: "doctor",
    displayName: "Doctor Demo",
    firstName: "Doctor",
    lastName: "Demo",
    birthDate: "1980-01-01",
    gender: "other",
    passwordHash: hashPassword("doctor123"),
    createdAt: new Date().toISOString(),
  },
];

const sessions = new Map<string, ChatSession>();
const memoryUsers = new Map<string, StoredUser>(seedUsers.map((user) => [user.username, user]));

function toIsoDate(value: unknown): string {
  return new Date(String(value)).toISOString();
}

function mapMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: String(row.id),
    role: row.role as ChatMessage["role"],
    content: String(row.content),
    createdAt: toIsoDate(row.created_at),
  };
}

function mapSession(
  row: Record<string, unknown>,
  messages: ChatMessage[],
): ChatSession {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    status: row.status as ChatSession["status"],
    createdAt: toIsoDate(row.created_at),
    updatedAt: toIsoDate(row.updated_at),
    messages,
    latestDraft: row.latest_draft ? String(row.latest_draft) : undefined,
    retrievalContext: Array.isArray(row.retrieval_context)
      ? (row.retrieval_context as string[])
      : undefined,
    doctorEdit:
      row.doctor_edit && typeof row.doctor_edit === "object"
        ? (row.doctor_edit as ChatSession["doctorEdit"])
        : undefined,
  };
}

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

async function fetchSessionWithMessages(
  sql: ReturnType<typeof getSqlClient>,
  sessionId: string,
): Promise<ChatSession | undefined> {
  const sessionRows = asRowArray(await sql`
    SELECT *
    FROM chat_sessions
    WHERE id = ${sessionId}
    LIMIT 1
  `);

  const sessionRow = sessionRows[0] as Record<string, unknown> | undefined;
  if (!sessionRow) {
    return undefined;
  }

  const messageRows = asRowArray(await sql`
    SELECT *
    FROM chat_messages
    WHERE session_id = ${sessionId}
    ORDER BY created_at ASC
  `);

  return mapSession(sessionRow, messageRows.map(mapMessage));
}

export const usersStore = {
  async findByIdentifier(identifier: string): Promise<StoredUser | undefined> {
    if (hasDatabase()) {
      const sql = getSqlClient();
      const rows = asRowArray(await sql`
        SELECT *
        FROM users
        WHERE username = ${identifier}
           OR email = ${identifier}
        LIMIT 1
      `);

      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) {
        return undefined;
      }

      return {
        id: String(row.id),
        email: String(row.email),
        username: String(row.username),
        role: row.role as User["role"],
        displayName: String(row.display_name),
        firstName: String(row.first_name),
        lastName: String(row.last_name),
        birthDate: String(row.birth_date),
        gender: String(row.gender),
        passwordHash: String(row.password_hash),
        createdAt: String(row.created_at),
      };
    }

    return memoryUsers.get(identifier) ?? Array.from(memoryUsers.values()).find((user) => user.email === identifier);
  },
  async findById(id: string): Promise<StoredUser | undefined> {
    if (hasDatabase()) {
      const sql = getSqlClient();
      const rows = asRowArray(await sql`
        SELECT *
        FROM users
        WHERE id = ${id}
        LIMIT 1
      `);

      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) {
        return undefined;
      }

      return {
        id: String(row.id),
        email: String(row.email),
        username: String(row.username),
        role: row.role as User["role"],
        displayName: String(row.display_name),
        firstName: String(row.first_name),
        lastName: String(row.last_name),
        birthDate: String(row.birth_date),
        gender: String(row.gender),
        passwordHash: String(row.password_hash),
        createdAt: String(row.created_at),
      };
    }

    return Array.from(memoryUsers.values()).find((user) => user.id === id);
  },
  async create(input: {
    email: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    gender: string;
    password: string;
    role?: User["role"];
    displayName?: string;
  }): Promise<StoredUser> {
    const email = input.email.trim().toLowerCase();
    const username = email;
    const role = input.role ?? "patient";
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const birthDate = input.birthDate.trim();
    const gender = input.gender.trim();
    const displayName = input.displayName?.trim() || `${firstName} ${lastName}`.trim() || email;
    const passwordHash = hashPassword(input.password);
    const createdAt = new Date().toISOString();

    if (hasDatabase()) {
      const sql = getSqlClient();
      const id = randomUUID();
      await sql`
        INSERT INTO users (id, email, username, password_hash, role, display_name, first_name, last_name, birth_date, gender, created_at)
        VALUES (${id}, ${email}, ${username}, ${passwordHash}, ${role}, ${displayName}, ${firstName}, ${lastName}, ${birthDate}, ${gender}, ${createdAt})
      `;

      return {
        id,
        email,
        username,
        role,
        displayName,
        firstName,
        lastName,
        birthDate,
        gender,
        passwordHash,
        createdAt,
      };
    }

    const user: StoredUser = {
      id: randomUUID(),
      email,
      username,
      role,
      displayName,
      firstName,
      lastName,
      birthDate,
      gender,
      passwordHash,
      createdAt,
    };
    memoryUsers.set(username, user);
    memoryUsers.set(email, user);
    return user;
  },
  async verifyCredentials(username: string, password: string): Promise<StoredUser | undefined> {
    const user = await this.findByIdentifier(username);
    if (!user) {
      return undefined;
    }

    return verifyPassword(password, user.passwordHash) ? user : undefined;
  },
  publicUser(user: Pick<StoredUser, "id" | "email" | "username" | "role" | "displayName" | "firstName" | "lastName" | "birthDate" | "gender">): User {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
      firstName: user.firstName,
      lastName: user.lastName,
      birthDate: user.birthDate,
      gender: user.gender,
    };
  },
};

export const chatStore = {
  async create(patientId: string, firstUserMessage: string): Promise<ChatSession> {
    if (hasDatabase()) {
      const sql = getSqlClient();
      const now = new Date().toISOString();
      const sessionId = randomUUID();
      const messageId = randomUUID();

      await sql`
        INSERT INTO chat_sessions (id, patient_id, status, created_at, updated_at)
        VALUES (${sessionId}, ${patientId}, ${"active"}, ${now}, ${now})
      `;

      await sql`
        INSERT INTO chat_messages (id, session_id, role, content, created_at)
        VALUES (${messageId}, ${sessionId}, ${"user"}, ${firstUserMessage}, ${now})
      `;

      const session = await fetchSessionWithMessages(sql, sessionId);
      if (!session) {
        throw new Error("Failed to create chat session");
      }
      return session;
    }

    const now = new Date().toISOString();
    const session: ChatSession = {
      id: randomUUID(),
      patientId,
      status: "active",
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: randomUUID(),
          role: "user",
          content: firstUserMessage,
          createdAt: now,
        },
      ],
    };
    sessions.set(session.id, session);
    return session;
  },

  async appendMessage(
    sessionId: string,
    message: Omit<ChatMessage, "id" | "createdAt">,
  ): Promise<ChatSession | undefined> {
    if (hasDatabase()) {
      const sql = getSqlClient();
      const session = await fetchSessionWithMessages(sql, sessionId);
      if (!session) {
        return undefined;
      }

      const now = new Date().toISOString();
      await sql`
        INSERT INTO chat_messages (id, session_id, role, content, created_at)
        VALUES (${randomUUID()}, ${sessionId}, ${message.role}, ${message.content}, ${now})
      `;

      await sql`
        UPDATE chat_sessions
        SET updated_at = ${now}
        WHERE id = ${sessionId}
      `;

      return await fetchSessionWithMessages(sql, sessionId);
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    session.messages.push({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...message,
    });
    session.updatedAt = new Date().toISOString();
    sessions.set(session.id, session);
    return session;
  },

  async get(sessionId: string): Promise<ChatSession | undefined> {
    if (hasDatabase()) {
      const sql = getSqlClient();
      return await fetchSessionWithMessages(sql, sessionId);
    }

    return sessions.get(sessionId);
  },

  async getHistory(sessionId: string): Promise<ChatMessage[] | undefined> {
    const session = await chatStore.get(sessionId);
    return session?.messages;
  },

  async listByPatient(patientId: string, limit = 20): Promise<ChatSession[]> {
    if (hasDatabase()) {
      const sql = getSqlClient();
      const rows = asRowArray(await sql`
        SELECT id
        FROM chat_sessions
        WHERE patient_id = ${patientId}
        ORDER BY updated_at DESC
        LIMIT ${Math.max(1, Math.min(limit, 100))}
      `);

      const result: ChatSession[] = [];
      for (const row of rows as Array<{ id: string }>) {
        const session = await fetchSessionWithMessages(sql, row.id);
        if (session) {
          result.push(session);
        }
      }
      return result;
    }

    return Array.from(sessions.values())
      .filter((s) => s.patientId === patientId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.max(1, Math.min(limit, 100)));
  },

  async listAll(limit = 100, patientId?: string): Promise<ChatSession[]> {
    if (hasDatabase()) {
      const sql = getSqlClient();
      const safeLimit = Math.max(1, Math.min(limit, 200));
      const rows = patientId
        ? asRowArray(await sql`
            SELECT id
            FROM chat_sessions
            WHERE patient_id = ${patientId}
            ORDER BY updated_at DESC
            LIMIT ${safeLimit}
          `)
        : asRowArray(await sql`
            SELECT id
            FROM chat_sessions
            ORDER BY updated_at DESC
            LIMIT ${safeLimit}
          `);

      const result: ChatSession[] = [];
      for (const row of rows as Array<{ id: string }>) {
        const session = await fetchSessionWithMessages(sql, row.id);
        if (session) {
          result.push(session);
        }
      }
      return result;
    }

    let arr = Array.from(sessions.values());
    if (patientId) {
      arr = arr.filter((s) => s.patientId === patientId);
    }
    return arr
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.max(1, Math.min(limit, 200)));
  },

  async listAllPatients(limit = 100): Promise<ChatSession[]> {
    return chatStore.listAll(limit);
  },

  async update(session: ChatSession): Promise<ChatSession> {
    if (hasDatabase()) {
      const sql = getSqlClient();
      const now = new Date().toISOString();

      await sql`
        UPDATE chat_sessions
        SET
          status = ${session.status},
          updated_at = ${now},
          latest_draft = ${session.latestDraft ?? null},
          retrieval_context = ${session.retrievalContext ? JSON.stringify(session.retrievalContext) : null}::jsonb,
          doctor_edit = ${session.doctorEdit ? JSON.stringify(session.doctorEdit) : null}::jsonb
        WHERE id = ${session.id}
      `;

      const updated = await fetchSessionWithMessages(sql, session.id);
      if (!updated) {
        throw new Error("Failed to update chat session");
      }
      return updated;
    }

    session.updatedAt = new Date().toISOString();
    sessions.set(session.id, session);
    return session;
  },

  async pendingDoctorReview(): Promise<ChatSession[]> {
    if (hasDatabase()) {
      const sql = getSqlClient();
      const rows = asRowArray(await sql`
        SELECT id
        FROM chat_sessions
        WHERE status = ${"pending_doctor_review"}
        ORDER BY updated_at DESC
      `);

      const result: ChatSession[] = [];
      for (const row of rows as Array<{ id: string }>) {
        const session = await fetchSessionWithMessages(sql, row.id);
        if (session) {
          result.push(session);
        }
      }
      return result;
    }

    return Array.from(sessions.values()).filter((s) => s.status === "pending_doctor_review");
  },
};
