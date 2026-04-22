"use client";

import { useEffect } from "react";
import type { User } from "../types";
import { usePatientChat } from "../hooks/usePatientChat";
import ChatMessageList from "./ChatMessageList";

type PatientViewProps = {
  user: User;
  token: string;
  onLogout: () => void;
  onError: (error: string) => void;
};

export default function PatientView({ user, token, onLogout, onError }: PatientViewProps) {
  const {
    patientSessions,
    activeSessionId,
    activeMessages,
    message,
    loadingAction,
    error,
    setMessage,
    loadSessions,
    selectSession,
    refreshChat,
    sendMessage,
    startNewChat,
  } = usePatientChat();

  useEffect(() => {
    if (error) onError(error);
  }, [error, onError]);

  useEffect(() => {
    loadSessions(token);
  }, [token, loadSessions]);

  const isLoadingSend = loadingAction === "send";
  const isLoadingHistory = loadingAction === "refresh-history";
  const isLoadingChat = loadingAction === "refresh-chat";
  const isSelecting = loadingAction === "select-session";

  return (
    <main className="min-h-screen bg-[#f6f9ff] text-[#2a333b]">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-white/80 px-6 py-4 backdrop-blur-xl">
        <div>
          <h1 className="text-xl font-bold text-[#0060ad]">Hua-Mor</h1>
          <p className="text-xs text-[#576069]">Patient: {user.displayName}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="rounded-full bg-[#e1e9f2] px-4 py-2 text-sm"
            disabled={isLoadingHistory}
            onClick={() => loadSessions(token)}
            type="button"
          >
            {isLoadingHistory ? "Refreshing..." : "Refresh History"}
          </button>
          <button
            className="rounded-full bg-[#e1e9f2] px-4 py-2 text-sm"
            disabled={isLoadingChat || !activeSessionId}
            onClick={() => refreshChat(token)}
            type="button"
          >
            {isLoadingChat ? "Refreshing..." : "Refresh Chat"}
          </button>
          <button className="rounded-full bg-[#e1e9f2] px-4 py-2 text-sm" onClick={startNewChat} type="button">
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
                onClick={() => selectSession(s.id, token)}
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
              <ChatMessageList messages={activeMessages} variant="chat-bubbles" />
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
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && message.trim()) {
                    e.preventDefault();
                    sendMessage(token);
                  }
                }}
                placeholder="Type your symptoms or health questions..."
                value={message}
              />
              <button
                className="rounded-full bg-gradient-to-br from-[#0060ad] to-[#68abff] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                disabled={!message.trim() || isLoadingSend}
                onClick={() => sendMessage(token)}
                type="button"
              >
                {isLoadingSend ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        </section>
      </div>

      {error ? (
        <div className="px-4 pb-4">
          <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        </div>
      ) : null}
    </main>
  );
}
