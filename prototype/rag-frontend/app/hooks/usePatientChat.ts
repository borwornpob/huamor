"use client";

import { useState } from "react";
import type { ChatMessage, ChatSession, SessionHistoryResponse, SessionListResponse, StartChatResponse } from "../types";
import { requestApi } from "../lib/api";

export type UsePatientChatReturn = {
  patientSessions: ChatSession[];
  activeSessionId: string;
  activeMessages: ChatMessage[];
  message: string;
  rawResponse: string;
  loadingAction: string | null;
  error: string;
  setMessage: (value: string) => void;
  loadSessions: (authToken?: string) => Promise<void>;
  selectSession: (sessionId: string, authToken?: string) => Promise<void>;
  refreshChat: (authToken?: string) => Promise<void>;
  sendMessage: (authToken?: string) => Promise<void>;
  startNewChat: () => void;
  setError: (value: string) => void;
  setLoadingAction: (value: string | null) => void;
  setRawResponse: (value: string) => void;
};

export function usePatientChat(): UsePatientChatReturn {
  const [patientSessions, setPatientSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [rawResponse, setRawResponse] = useState("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function loadSessions(authToken?: string) {
    setLoadingAction("refresh-history");
    try {
      const data = (await requestApi("/api/chat/sessions?limit=30", "GET", undefined, authToken)) as SessionListResponse;
      const list = data.sessions ?? [];
      setPatientSessions(list);
      if (!activeSessionId && list.length > 0) {
        await selectSession(list[0].id, authToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load sessions failed");
    } finally {
      setLoadingAction(null);
    }
  }

  async function selectSession(sessionId: string, authToken?: string) {
    setActiveSessionId(sessionId);
    setError("");
    setLoadingAction("select-session");
    try {
      await requestApi(`/api/chat/${sessionId}`, "GET", undefined, authToken);
      const data = (await requestApi(`/api/chat/sessions/${sessionId}/history`, "GET", undefined, authToken)) as SessionHistoryResponse;
      setActiveMessages(data.messages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load session history failed");
    } finally {
      setLoadingAction(null);
    }
  }

  async function refreshChat(authToken?: string) {
    if (!activeSessionId) return;
    setLoadingAction("refresh-chat");
    setError("");
    try {
      const data = (await requestApi(`/api/chat/${activeSessionId}/history`, "GET", undefined, authToken)) as SessionHistoryResponse;
      setActiveMessages(data.messages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh chat failed");
    } finally {
      setLoadingAction(null);
    }
  }

  async function sendMessage(authToken?: string) {
    if (!message.trim()) return;
    setError("");
    setLoadingAction("send");
    try {
      if (!activeSessionId) {
        const start = (await requestApi("/api/chat/start", "POST", { message }, authToken)) as StartChatResponse;
        setActiveSessionId(start.session.id);
        setActiveMessages(start.session.messages ?? []);
      } else {
        const cont = (await requestApi(`/api/chat/${activeSessionId}/message`, "POST", { message }, authToken)) as StartChatResponse;
        setActiveMessages(cont.session.messages ?? []);
      }
      setMessage("");
      await loadSessions(authToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send message failed");
    } finally {
      setLoadingAction(null);
    }
  }

  function startNewChat() {
    setActiveSessionId("");
    setActiveMessages([]);
    setMessage("");
  }

  return {
    patientSessions,
    activeSessionId,
    activeMessages,
    message,
    rawResponse,
    loadingAction,
    error,
    setMessage,
    loadSessions,
    selectSession,
    refreshChat,
    sendMessage,
    startNewChat,
    setError,
    setLoadingAction,
    setRawResponse,
  };
}
