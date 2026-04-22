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
  appEnv: process.env.APP_ENV ?? "dev",
  port: Number(process.env.PORT ?? 8787),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  trustForwardedUserHeaders: toBool(process.env.TRUST_FORWARDED_USER_HEADERS, false),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret",
  allowDemoUsers: toBool(process.env.ALLOW_DEMO_USERS, true),
  pdfDataDir: process.env.PDF_DATA_DIR ?? "./data/pdfs",
  qdrantUrl: process.env.QDRANT_URL ?? "",
  qdrantApiKey: process.env.QDRANT_API_KEY ?? "",
  qdrantCollection: process.env.QDRANT_COLLECTION ?? "",
  qdrantTextPayloadKey: process.env.QDRANT_TEXT_PAYLOAD_KEY ?? "text",
  qdrantVectorName: process.env.QDRANT_VECTOR_NAME ?? "",
  qdrantScoreThreshold: toNumber(process.env.QDRANT_SCORE_THRESHOLD, 0),
  activeIndexVersion: process.env.ACTIVE_INDEX_VERSION ?? "bootstrap",
  promptVersion: process.env.PROMPT_VERSION ?? "triage-v1",
  embeddingProvider: process.env.EMBEDDING_PROVIDER ?? "huggingface",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "BAAI/bge-m3",
  huggingFaceApiKey: process.env.HUGGINGFACE_API_KEY ?? "",
  huggingFaceBaseUrl: process.env.HUGGINGFACE_BASE_URL ?? "https://api-inference.huggingface.co/models",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  pythonExecutable: process.env.PYTHON_EXECUTABLE ?? "python3",
  sentenceTransformersScript: process.env.SENTENCE_TRANSFORMERS_SCRIPT ?? "./scripts/embed_query.py",
  sentenceTransformersTimeoutMs: toNumber(process.env.SENTENCE_TRANSFORMERS_TIMEOUT_MS, 120000),
  llmProvider: process.env.LLM_PROVIDER ?? "sealion",
  llmTemperature: toNumber(process.env.LLM_TEMPERATURE, 0.1),
  sealionApiKey: process.env.SEALION_API_KEY ?? "",
  sealionBaseUrl: process.env.SEALION_BASE_URL ?? "https://api.sea-lion.ai/v1",
  sealionModel: process.env.SEALION_MODEL ?? "aisingapore/Gemma-SEA-LION-v4-27B-IT",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
  openRouterBaseUrl: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  openRouterModel: process.env.OPENROUTER_MODEL ?? "moonshotai/kimi-k2",
  metricsEnabled: toBool(process.env.METRICS_ENABLED, true),
  strictStartup: toBool(process.env.STRICT_STARTUP, process.env.APP_ENV === "prod"),
};

export function isProductionLike(): boolean {
  return config.appEnv === "prod" || config.appEnv === "production";
}

export function validateRuntimeConfig(): void {
  const missing: string[] = [];
  if (!config.jwtSecret) {
    missing.push("JWT_SECRET");
  }

  if (config.strictStartup || isProductionLike()) {
    if (!config.databaseUrl) {
      missing.push("DATABASE_URL");
    }
    if (!config.qdrantUrl) {
      missing.push("QDRANT_URL");
    }
    if (!config.qdrantCollection) {
      missing.push("QDRANT_COLLECTION");
    }
    if (config.llmProvider === "sealion" && !config.sealionApiKey) {
      missing.push("SEALION_API_KEY");
    }
    if (config.llmProvider === "gemini" && !config.geminiApiKey) {
      missing.push("GEMINI_API_KEY");
    }
    if (config.llmProvider === "openrouter" && !config.openRouterApiKey) {
      missing.push("OPENROUTER_API_KEY");
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(", ")}`);
  }
}
