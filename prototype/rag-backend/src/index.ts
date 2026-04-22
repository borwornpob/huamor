import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config, validateRuntimeConfig } from "./config.js";
import { hasDatabase, initDatabase } from "./lib/db.js";
import { getMetricsSnapshot, incrementMetric, renderPrometheusMetrics } from "./lib/metrics.js";
import { ensureRetrievalReady } from "./lib/retrieval.js";
import { authRouter } from "./routes/auth.js";
import { chatRouter } from "./routes/chat.js";
import { docsRouter } from "./routes/docs.js";
import { expertRouter } from "./routes/expert.js";

const app = new Hono();
let bootReady = false;
let bootError: string | null = null;

app.use("*", cors());
app.use("*", async (c, next) => {
  incrementMetric("http_requests_total");
  await next();
});

app.get("/", (c) =>
  c.json({
    service: "rag-backend",
    ok: true,
    env: config.appEnv,
    endpoints: [
      "/health",
      "/ready",
      "/metrics",
      "/api/docs",
      "/api/docs/openapi.json",
      "/api/auth/signup",
      "/api/auth/login",
      "/api/auth/me",
      "/api/chat/start",
      "/api/expert/pending",
    ],
  }),
);
app.get("/health", (c) => c.json({ ok: true, env: config.appEnv }));
app.get("/ready", (c) => {
  if (!bootReady) {
    return c.json({ ok: false, error: bootError ?? "startup_incomplete" }, 503);
  }

  return c.json({
    ok: true,
    database: hasDatabase(),
    indexVersion: config.activeIndexVersion,
    metricsEnabled: config.metricsEnabled,
  });
});
app.get("/metrics", (c) => {
  if (!config.metricsEnabled) {
    return c.json({ error: "Metrics disabled" }, 404);
  }

  incrementMetric("metrics_scrapes_total");
  return c.body(renderPrometheusMetrics(), 200, {
    "content-type": "text/plain; version=0.0.4; charset=utf-8",
  });
});
app.get("/internal/metrics", (c) => c.json(getMetricsSnapshot()));
app.route("/api/docs", docsRouter);
app.route("/api/auth", authRouter);
app.route("/api/chat", chatRouter);
app.route("/api/expert", expertRouter);

try {
  validateRuntimeConfig();
  if (hasDatabase()) {
    await initDatabase();
    if (!hasDatabase()) {
      throw new Error("Database initialization failed");
    }
  }
  await ensureRetrievalReady();
  bootReady = true;
} catch (error) {
  bootError = error instanceof Error ? error.message : String(error);
  console.error("[startup] Failed to initialize runtime", error);
  if (config.strictStartup) {
    throw error;
  }
}

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`RAG backend listening at http://localhost:${info.port}`);
  },
);
