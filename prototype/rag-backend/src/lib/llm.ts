import OpenAI from "openai";
import { config } from "../config.js";

export type SupportedLlmProvider = "sealion" | "gemini" | "openrouter";

interface TriageGenerationInput {
  provider?: SupportedLlmProvider;
  userMessage: string;
  contexts: string[];
  temperature?: number;
}

export interface TriageGenerationResult {
  content: string;
  fallbackReason?: string;
}

function buildMessages(userMessage: string, contexts: string[]) {
  const contextBlock = contexts.length > 0 ? contexts.join("\n\n---\n\n") : "ไม่มีข้อมูลอ้างอิง";

  return [
    {
      role: "system" as const,
      content: [
        "คุณคือผู้ช่วยคัดกรองอาการผู้ป่วย",
        "ใช้เฉพาะข้อมูลอ้างอิงที่ให้",
        "ต้องตอบเป็น 3 ส่วน:",
        "1. การประเมินอาการ",
        "2. ระดับความรุนแรง",
        "3. แผนกที่ควรไป",
        "สรุปการแนะนำ",
        "ตอบภาษาเดียวกับคำถาม",
        "ห้ามทวนคำสั่ง",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: ["ข้อมูลอ้างอิง:", contextBlock, "", "คำถาม:", userMessage].join("\n"),
    },
  ];
}

function generateFallbackDraft(userMessage: string, contexts: string[]): string {
  const contextBlock = contexts.length > 0 ? contexts.join("\n\n---\n\n") : "ไม่มีข้อมูลอ้างอิง";
  return [
    "การประเมินอาการเบื้องต้น:",
    `จากคำถามของผู้ป่วย: ${userMessage}`,
    "",
    "ข้อมูลอ้างอิงที่ค้นคืนได้:",
    contextBlock,
    "",
    "คำแนะนำเบื้องต้น:",
    "- หากมีอาการรุนแรง เช่น หายใจลำบาก เจ็บหน้าอกมาก ให้พบแพทย์ฉุกเฉินทันที",
    "- คำตอบนี้ต้องรอแพทย์ตรวจสอบก่อนส่งกลับผู้ป่วย",
  ].join("\n");
}

async function callSealion(input: TriageGenerationInput): Promise<string> {
  if (!config.sealionApiKey) {
    throw new Error("SEALION_API_KEY is missing");
  }

  const client = new OpenAI({
    apiKey: config.sealionApiKey,
    baseURL: config.sealionBaseUrl,
  });

  const response = await client.chat.completions.create({
    model: config.sealionModel,
    messages: buildMessages(input.userMessage, input.contexts),
    temperature: input.temperature ?? config.llmTemperature,
    max_tokens: 1024,
  });

  const answer = response.choices[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error("SEA-LION returned empty content");
  }

  return answer;
}

async function callOpenRouter(input: TriageGenerationInput): Promise<string> {
  if (!config.openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is missing");
  }

  const client = new OpenAI({
    apiKey: config.openRouterApiKey,
    baseURL: config.openRouterBaseUrl,
  });

  const response = await client.chat.completions.create({
    model: config.openRouterModel,
    messages: buildMessages(input.userMessage, input.contexts),
    temperature: input.temperature ?? config.llmTemperature,
    max_tokens: 1024,
  }, {
    headers: {
      "HTTP-Referer": config.publicBaseUrl || "http://localhost:8787",
      "X-Title": "huamor-rag-backend",
    },
  });

  const answer = response.choices[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error("OpenRouter returned empty content");
  }

  return answer;
}

async function callGemini(input: TriageGenerationInput): Promise<string> {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    config.geminiModel,
  )}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: [
                "คุณคือผู้ช่วยคัดกรองอาการผู้ป่วย",
                "ใช้เฉพาะข้อมูลอ้างอิงที่ให้",
                "ต้องตอบเป็น 3 ส่วน: การประเมินอาการ, ระดับความรุนแรง, แผนกที่ควรไป, แล้วสรุปการแนะนำ",
                "ตอบภาษาเดียวกับคำถาม",
                "",
                "ข้อมูลอ้างอิง:",
                input.contexts.length > 0 ? input.contexts.join("\n\n---\n\n") : "ไม่มีข้อมูลอ้างอิง",
                "",
                "คำถาม:",
                input.userMessage,
              ].join("\n"),
            },
          ],
        },
      ],
      generationConfig: {
        temperature: input.temperature ?? config.llmTemperature,
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
        }>;
      };
    }>;
  };

  const answer = payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!answer) {
    throw new Error("Gemini returned empty content");
  }

  return answer;
}

export async function generateTriageDraft(input: TriageGenerationInput): Promise<TriageGenerationResult> {
  const provider = input.provider ?? (config.llmProvider as SupportedLlmProvider);

  try {
    if (provider === "sealion") {
      return { content: await callSealion(input) };
    }
    if (provider === "openrouter") {
      return { content: await callOpenRouter(input) };
    }
    if (provider === "gemini") {
      return { content: await callGemini(input) };
    }

    throw new Error(`Unsupported LLM provider: ${provider}`);
  } catch (error) {
    console.warn(
      `LLM generation failed, using local fallback draft: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {
      content: generateFallbackDraft(input.userMessage, input.contexts),
      fallbackReason: error instanceof Error ? error.message : "llm_call_failed",
    };
  }
}
