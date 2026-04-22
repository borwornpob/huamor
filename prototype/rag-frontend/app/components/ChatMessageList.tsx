import type { ReactNode } from "react";
import type { ChatMessage } from "../types";
import { renderFormattedContent } from "../lib/formatContent";

type Variant = "chat-bubbles" | "flat-cards";

type ChatMessageListProps = {
  messages: ChatMessage[];
  variant?: Variant;
};

function renderExpertPairBlock(item: ChatMessage, next: ChatMessage, variant: Variant) {
  if (variant === "chat-bubbles") {
    return (
      <div className="flex justify-start" key={`expert-pair-${item.id}-${next.id}`}>
        <div className="max-w-[85%] rounded-3xl bg-[#dff5e9] px-4 py-3 text-sm text-[#195c4a]">
          <p className="mb-2 text-xs font-semibold uppercase">Review by expert</p>
          <p className="mb-1 text-xs font-semibold">Question</p>
          {renderFormattedContent(item.content)}
          <div className="my-2 h-px bg-[#195c4a]/20" />
          <p className="mb-1 text-xs font-semibold">Answer</p>
          {renderFormattedContent(next.content)}
        </div>
      </div>
    );
  }

  return (
    <article
      className="rounded-2xl bg-[#dff5e9] p-3 shadow-sm text-[#195c4a]"
      key={`expert-pair-${item.id}-${next.id}`}
    >
      <p className="text-xs font-semibold uppercase">Review by expert</p>
      <p className="mt-2 text-xs font-semibold">Question</p>
      {renderFormattedContent(item.content)}
      <div className="my-2 h-px bg-[#195c4a]/20" />
      <p className="text-xs font-semibold">Answer</p>
      {renderFormattedContent(next.content)}
    </article>
  );
}

function renderSingleMessage(item: ChatMessage, variant: Variant) {
  if (variant === "chat-bubbles") {
    return (
      <div
        className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}
        key={item.id}
      >
        <div className="max-w-[85%]">
          <div
            className={`rounded-3xl px-4 py-3 text-sm ${
              item.role === "user"
                ? "bg-[#2a6a57] text-[#e4fff3]"
                : item.role === "doctor"
                  ? "bg-[#dff5e9] text-[#195c4a]"
                  : "bg-[#dae4ee] text-[#2a333b]"
            }`}
          >
            {renderFormattedContent(item.content)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <article
      className={`rounded-2xl p-3 shadow-sm ${
        item.role === "user"
          ? "bg-[#2a6a57] text-[#e4fff3]"
          : item.role === "doctor"
            ? "bg-[#dff5e9] text-[#195c4a]"
            : "bg-[#dae4ee] text-[#2a333b]"
      }`}
      key={item.id}
    >
      <p className="text-xs font-semibold uppercase opacity-75">{item.role}</p>
      <div className="mt-1">{renderFormattedContent(item.content)}</div>
    </article>
  );
}

export default function ChatMessageList({ messages, variant = "chat-bubbles" }: ChatMessageListProps) {
  const blocks: ReactNode[] = [];

  for (let index = 0; index < messages.length; index += 1) {
    const item = messages[index];
    const next = messages[index + 1];
    const isExpertPair = item.role === "doctor" && next?.role === "assistant";

    if (isExpertPair) {
      blocks.push(renderExpertPairBlock(item, next, variant));
      index += 1;
      continue;
    }

    blocks.push(renderSingleMessage(item, variant));
  }

  return <>{blocks}</>;
}
