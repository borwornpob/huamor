import OpenAI from "openai";
import { config } from "../config.js";

export type SupportedLlmProvider = "sealion";

interface TriageGenerationInput {
  provider?: SupportedLlmProvider;
  userMessage: string;
  contexts: string[];
  temperature?: number;
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

export async function generateTriageDraft(input: TriageGenerationInput): Promise<string> {
  const provider = input.provider ?? (config.llmProvider as SupportedLlmProvider);

  try {
    if (provider === "sealion") {
      return await callSealion(input);
    }

    throw new Error(`Unsupported LLM provider: ${provider}`);
  } catch (error) {
    console.warn("LLM generation failed, using local fallback draft", error);
    return generateFallbackDraft(input.userMessage, input.contexts);
  }
}
