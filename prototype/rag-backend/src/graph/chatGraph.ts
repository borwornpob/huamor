import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { generateTriageDraft, type SupportedLlmProvider } from "../lib/llm.js";
import { retrieveContext } from "../lib/retrieval.js";

const ChatGraphState = Annotation.Root({
  userMessage: Annotation<string>(),
  provider: Annotation<SupportedLlmProvider | undefined>(),
  retrieved: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  draftReply: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
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
  const draftReply = await generateTriageDraft({
    provider: state.provider,
    userMessage: state.userMessage,
    contexts: state.retrieved,
  });

  return {
    draftReply,
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
): Promise<{ draftReply: string; retrieved: string[]; checkpointReason: string }> {
  const result = await compiled.invoke({ userMessage, provider });
  return {
    draftReply: result.draftReply,
    retrieved: result.retrieved,
    checkpointReason: result.checkpointReason,
  };
}
