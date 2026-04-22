"use client";

import { useState } from "react";
import type { ChatMessage, ChatSession, SessionHistoryResponse, SessionListResponse } from "../types";
import { requestApi } from "../lib/api";

export type UseDoctorReviewReturn = {
  doctorSessions: ChatSession[];
  doctorReviewedSessions: ChatSession[];
  activeDoctorSessionId: string;
  activeDoctorMessages: ChatMessage[];
  doctorViewMode: "pending" | "reviewed";
  reviewQuestion: string;
  reviewAnswer: string;
  reviewNote: string;
  isEditingAnswer: boolean;
  loadingAction: string | null;
  submittingReview: boolean;
  error: string;
  setDoctorViewMode: (mode: "pending" | "reviewed") => void;
  setReviewAnswer: (value: string) => void;
  setReviewNote: (value: string) => void;
  setReviewQuestion: (value: string) => void;
  setIsEditingAnswer: (value: boolean) => void;
  loadPendingSessions: (authToken?: string) => Promise<void>;
  selectSession: (sessionId: string, authToken?: string) => Promise<void>;
  submitReview: (authToken?: string) => Promise<void>;
  setError: (value: string) => void;
  setLoadingAction: (value: string | null) => void;
};

export function useDoctorReview(): UseDoctorReviewReturn {
  const [doctorSessions, setDoctorSessions] = useState<ChatSession[]>([]);
  const [doctorReviewedSessions, setDoctorReviewedSessions] = useState<ChatSession[]>([]);
  const [activeDoctorSessionId, setActiveDoctorSessionId] = useState("");
  const [activeDoctorMessages, setActiveDoctorMessages] = useState<ChatMessage[]>([]);
  const [doctorViewMode, setDoctorViewMode] = useState<"pending" | "reviewed">("pending");
  const [reviewQuestion, setReviewQuestion] = useState("Please review this consultation");
  const [reviewAnswer, setReviewAnswer] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [isEditingAnswer, setIsEditingAnswer] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [error, setError] = useState("");

  async function loadPendingSessions(authToken?: string) {
    setLoadingAction("refresh-doctor");
    try {
      await requestApi("/api/expert/pending", "GET", undefined, authToken);
      const allData = (await requestApi("/api/expert/sessions?limit=100", "GET", undefined, authToken)) as SessionListResponse;
      const list = (allData.sessions ?? []).filter((s) => s.status !== "completed");
      const reviewed = (allData.sessions ?? []).filter((s) => s.status === "completed");
      setDoctorSessions(list);
      setDoctorReviewedSessions(reviewed);
      if (list.length > 0) {
        await selectSession(list[0].id, authToken);
      } else {
        setActiveDoctorSessionId("");
        setActiveDoctorMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load doctor sessions failed");
    } finally {
      setLoadingAction(null);
    }
  }

  async function selectSession(sessionId: string, authToken?: string) {
    setActiveDoctorSessionId(sessionId);
    setError("");
    setLoadingAction("select-doctor-session");
    try {
      const data = (await requestApi(`/api/expert/sessions/${sessionId}/history`, "GET", undefined, authToken)) as SessionHistoryResponse;
      setActiveDoctorMessages(data.messages ?? []);
      const latestUserQuestion =
        [...(data.messages ?? [])].reverse().find((m) => m.role === "user")?.content ?? "Doctor review question";
      const latestAssistantDraft =
        [...(data.messages ?? [])].reverse().find((m) => m.role === "assistant")?.content ?? "";
      setReviewQuestion(latestUserQuestion);
      setReviewAnswer(latestAssistantDraft);
      setReviewNote("");
      setIsEditingAnswer(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load expert history failed");
    } finally {
      setLoadingAction(null);
    }
  }

  async function submitReview(authToken?: string) {
    if (!activeDoctorSessionId) return;
    if (!reviewAnswer.trim()) {
      setError("กรุณากรอกคำตอบก่อนส่ง");
      return;
    }
    setError("");
    setSubmittingReview(true);
    try {
      await requestApi(`/api/expert/sessions/${activeDoctorSessionId}/review`, "POST", {
        question: reviewQuestion,
        answer: reviewAnswer,
        note: reviewNote || undefined,
      }, authToken);
      setDoctorSessions((prev) => prev.filter((s) => s.id !== activeDoctorSessionId));
      setActiveDoctorSessionId("");
      setActiveDoctorMessages([]);
      setReviewQuestion("Please review this consultation");
      setReviewAnswer("");
      setReviewNote("");
      setIsEditingAnswer(false);
      await loadPendingSessions(authToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit review failed");
    } finally {
      setSubmittingReview(false);
    }
  }

  return {
    doctorSessions,
    doctorReviewedSessions,
    activeDoctorSessionId,
    activeDoctorMessages,
    doctorViewMode,
    reviewQuestion,
    reviewAnswer,
    reviewNote,
    isEditingAnswer,
    loadingAction,
    submittingReview,
    error,
    setDoctorViewMode,
    setReviewAnswer,
    setReviewNote,
    setReviewQuestion,
    setIsEditingAnswer,
    loadPendingSessions,
    selectSession,
    submitReview,
    setError,
    setLoadingAction,
  };
}
