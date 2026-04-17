"use client";

import type { ReactNode } from "react";
import type { ChatMessage, ChatSession, User } from "../types";

type PatientViewProps = {
  user: User;
  patientSessions: ChatSession[];
  activeSessionId: string;
  activeMessages: ChatMessage[];
  message: string;
  setMessage: (value: string) => void;
  error: string;
  rawResponse: string;
  loadingAction: string | null;
  onRefreshHistory: () => void;
  onRefreshChat: () => void;
  onNewChat: () => void;
  onLogout: () => void;
  onSelectSession: (sessionId: string) => void;
  onSendMessage: () => void;
};

export default function PatientView(props: PatientViewProps) {
  const {
    user,
    patientSessions,
    activeSessionId,
    activeMessages,
    message,
    setMessage,
    error,
    rawResponse,
    loadingAction,
    onRefreshHistory,
    onRefreshChat,
    onNewChat,
    onLogout,
    onSelectSession,
    onSendMessage,
  } = props;

  const isLoadingSend = loadingAction === "send";
  const isLoadingHistory = loadingAction === "refresh-history";
  const isLoadingChat = loadingAction === "refresh-chat";
  const isSelecting = loadingAction === "select-session";

  function renderFormattedContent(content: string) {
    const lines = content.split("\n");

    return (
      <div className="space-y-1">
        {lines.map((line, lineIndex) => {
          if (!line.trim()) {
            return <div className="h-1" key={`empty-${lineIndex}`} />;
          }
          const parts = line.split(/(\*\*[^*]+\*\*)/g);
          return (
            <p className="leading-relaxed" key={`line-${lineIndex}`}>
              {parts.map((part, partIndex) => {
                if (part.startsWith("**") && part.endsWith("**")) {
                  return <strong key={`part-${lineIndex}-${partIndex}`}>{part.slice(2, -2)}</strong>;
                }
                return <span key={`part-${lineIndex}-${partIndex}`}>{part}</span>;
              })}
            </p>
          );
        })}
      </div>
    );
  }

  function renderChatMessages() {
    const items: ReactNode[] = [];

    for (let index = 0; index < activeMessages.length; index += 1) {
      const item = activeMessages[index];
      const next = activeMessages[index + 1];
      const isExpertPair = item.role === "doctor" && next?.role === "assistant";

      if (isExpertPair) {
        items.push(
          <div className="flex justify-start" key={`expert-pair-${item.id}-${next.id}`}>
            <div className="max-w-[85%] rounded-3xl bg-[#dff5e9] px-4 py-3 text-sm text-[#195c4a]">
              <p className="mb-2 text-xs font-semibold uppercase">Review by expert</p>
              <p className="mb-1 text-xs font-semibold">Question</p>
              {renderFormattedContent(item.content)}
              <div className="my-2 h-px bg-[#195c4a]/20" />
              <p className="mb-1 text-xs font-semibold">Answer</p>
              {renderFormattedContent(next.content)}
            </div>
          </div>,
        );
        index += 1;
        continue;
      }

      items.push(
        <div className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`} key={item.id}>
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
        </div>,
      );
    }

    return items;
  }

  return (
    <main className="min-h-screen bg-[#f6f9ff] text-[#2a333b]">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-white/80 px-6 py-4 backdrop-blur-xl">
        <div>
          <h1 className="text-xl font-bold text-[#0060ad]">Hua-Mor</h1>
          <p className="text-xs text-[#576069]">Patient: {user.displayName}</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="rounded-full bg-[#e1e9f2] px-4 py-2 text-sm" disabled={isLoadingHistory} onClick={onRefreshHistory} type="button">
            {isLoadingHistory ? "Refreshing..." : "Refresh History"}
          </button>
          <button className="rounded-full bg-[#e1e9f2] px-4 py-2 text-sm" disabled={isLoadingChat || !activeSessionId} onClick={onRefreshChat} type="button">
            {isLoadingChat ? "Refreshing..." : "Refresh Chat"}
          </button>
          <button className="rounded-full bg-[#e1e9f2] px-4 py-2 text-sm" onClick={onNewChat} type="button">
            New Chat
          </button>
          <button className="rounded-full bg-[#e1e9f2] px-4 py-2 text-sm font-semibold" onClick={onLogout} type="button">
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-3xl bg-[#eff4fb] p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#727c85]">ประวัติการสนทนา</h2>
          <div className="space-y-2">
            {patientSessions.map((s) => (
              <button
                className={`w-full rounded-2xl px-3 py-3 text-left text-sm ${
                  activeSessionId === s.id ? "bg-white text-[#0060ad]" : "bg-[#dae4ee] text-[#2a333b]"
                }`}
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                type="button"
              >
                <p className="truncate font-semibold">{s.id}</p>
                <p className="mt-1 text-xs opacity-70">{s.status}</p>
              </button>
            ))}
            {patientSessions.length === 0 ? <p className="rounded-2xl bg-white px-3 py-2 text-sm text-[#576069]">ยังไม่มีประวัติ</p> : null}
            {isSelecting ? <p className="rounded-2xl bg-white px-3 py-2 text-xs text-[#576069]">กำลังโหลดบทสนทนา...</p> : null}
          </div>
        </aside>

        <section className="flex min-h-[70vh] flex-col rounded-3xl bg-[#eff4fb] p-4">
          <div className="flex-1 space-y-4 overflow-y-auto pb-4">
            {activeMessages.length ? (
              renderChatMessages()
            ) : (
              <div className="rounded-3xl bg-[#dae4ee] px-4 py-3 text-sm text-[#576069]">
                พิมพ์อาการและกด Send เพื่อเริ่มการสนทนาใหม่
              </div>
            )}
          </div>
          <div className="rounded-3xl bg-white p-2 shadow-[0_8px_32px_rgba(42,51,59,0.04)]">
            <div className="flex items-center gap-2">
              <input
                className="flex-1 rounded-2xl bg-transparent px-4 py-3 outline-none"
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your symptoms or health questions..."
                value={message}
              />
              <button
                className="rounded-full bg-gradient-to-br from-[#0060ad] to-[#68abff] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                disabled={!message.trim() || isLoadingSend}
                onClick={onSendMessage}
                type="button"
              >
                {isLoadingSend ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="px-4 pb-4">
        {error ? <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <details className="mt-3 rounded-2xl bg-[#eff4fb] p-3 text-xs">
          <summary className="cursor-pointer font-semibold text-[#576069]">Debug Raw API Response</summary>
          <pre className="mt-2 max-h-60 overflow-auto rounded-xl bg-[#0a0f12] p-3 text-xs text-[#f8f8ff]">
            {rawResponse || "No response yet."}
          </pre>
        </details>
      </div>
    </main>
  );
}
