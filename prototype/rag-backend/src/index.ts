import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.js";
import { hasDatabase, initDatabase } from "./lib/db.js";
import { ensureRetrievalReady } from "./lib/retrieval.js";
import { authRouter } from "./routes/auth.js";
import { chatRouter } from "./routes/chat.js";
import { docsRouter } from "./routes/docs.js";
import { expertRouter } from "./routes/expert.js";

const app = new Hono();

app.use("*", cors());

app.get("/", (c) =>
  c.json({
    service: "rag-backend",
    ok: true,
    endpoints: ["/health", "/api/docs", "/api/docs/openapi.json", "/api/auth/signup", "/api/auth/login", "/api/auth/me", "/api/chat/start", "/api/expert/pending"],
  }),
);
app.get("/health", (c) => c.json({ ok: true }));
app.route("/api/docs", docsRouter);
app.route("/api/auth", authRouter);
app.route("/api/chat", chatRouter);
app.route("/api/expert", expertRouter);

if (hasDatabase()) {
  await initDatabase();
  if (!hasDatabase()) {
    console.warn("[startup] Running with in-memory chat store (Neon unavailable)");
  }
}
await ensureRetrievalReady();

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`RAG backend listening at http://localhost:${info.port}`);
  },
);
