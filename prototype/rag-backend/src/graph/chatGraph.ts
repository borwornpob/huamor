import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { generateTriageDraft, type SupportedLlmProvider } from "../lib/llm.js";
import { retrieveContext } from "../lib/retrieval.js";
import type { RetrievalResult } from "../shared/types.js";

const ChatGraphState = Annotation.Root({
  userMessage: Annotation<string>(),
  provider: Annotation<SupportedLlmProvider | undefined>(),
  retrieved: Annotation<RetrievalResult[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  draftReply: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  fallbackReason: Annotation<string | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  checkpointReason: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
});

const retrievalNode = async (state: typeof ChatGraphState.State) => {
  const retrieved = await retrieveContext(state.userMessage, 3);
  return { retrieved };
};

const draftNode = async (state: typeof ChatGraphState.State) => {
  const generated = await generateTriageDraft({
    provider: state.provider,
    userMessage: state.userMessage,
    contexts: state.retrieved.map((item) => item.text),
  });

  return {
    draftReply: generated.content,
    fallbackReason: generated.fallbackReason,
    checkpointReason: "response_generated",
  };
};

const workflow = new StateGraph(ChatGraphState)
  .addNode("retrieve", retrievalNode)
  .addNode("draft", draftNode)
  .addEdge(START, "retrieve")
  .addEdge("retrieve", "draft")
  .addEdge("draft", END);

const compiled = workflow.compile();

export async function runChatGraph(
  userMessage: string,
  provider?: SupportedLlmProvider,
): Promise<{ draftReply: string; retrieved: RetrievalResult[]; checkpointReason: string; fallbackReason?: string }> {
  const result = await compiled.invoke({ userMessage, provider });
  return {
    draftReply: result.draftReply,
    retrieved: result.retrieved,
    checkpointReason: result.checkpointReason,
    fallbackReason: result.fallbackReason,
  };
}
