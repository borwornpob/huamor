"use client";

import type { ReactNode } from "react";
import type { ChatMessage, ChatSession, User } from "../types";

type DoctorViewProps = {
  user: User;
  doctorSessions: ChatSession[];
  doctorReviewedSessions: ChatSession[];
  activeDoctorSessionId: string;
  activeDoctorMessages: ChatMessage[];
  doctorViewMode: "pending" | "reviewed";
  setDoctorViewMode: (mode: "pending" | "reviewed") => void;
  reviewQuestion: string;
  setReviewQuestion: (value: string) => void;
  reviewAnswer: string;
  setReviewAnswer: (value: string) => void;
  reviewNote: string;
  setReviewNote: (value: string) => void;
  isEditingAnswer: boolean;
  onToggleEditAnswer: () => void;
  loadingAction: string | null;
  submittingReview: boolean;
  error: string;
  onRefresh: () => void;
  onLogout: () => void;
  onSelectSession: (id: string) => void;
  onSubmitReview: () => void;
};

export default function DoctorView(props: DoctorViewProps) {
  const {
    user,
    doctorSessions,
    doctorReviewedSessions,
    activeDoctorSessionId,
    activeDoctorMessages,
    doctorViewMode,
    setDoctorViewMode,
    reviewQuestion,
    reviewAnswer,
    setReviewAnswer,
    reviewNote,
    setReviewNote,
    isEditingAnswer,
    onToggleEditAnswer,
    loadingAction,
    submittingReview,
    error,
    onRefresh,
    onLogout,
    onSelectSession,
    onSubmitReview,
  } = props;

  const visibleDoctorSessions = doctorViewMode === "pending" ? doctorSessions : doctorReviewedSessions;
  const isLoadingList = loadingAction === "refresh-doctor";
  const isLoadingHistory = loadingAction === "select-doctor-session";

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

  function renderDoctorHistoryBlocks() {
    const blocks: ReactNode[] = [];
    for (let index = 0; index < activeDoctorMessages.length; index += 1) {
      const item = activeDoctorMessages[index];
      const next = activeDoctorMessages[index + 1];
      const isExpertPair = item.role === "doctor" && next?.role === "assistant";

      if (isExpertPair) {
        blocks.push(
          <article className="rounded-2xl bg-[#dff5e9] p-3 shadow-sm text-[#195c4a]" key={`expert-pair-${item.id}-${next.id}`}>
            <p className="text-xs font-semibold uppercase">Review by expert</p>
            <p className="mt-2 text-xs font-semibold">Question</p>
            {renderFormattedContent(item.content)}
            <div className="my-2 h-px bg-[#195c4a]/20" />
            <p className="text-xs font-semibold">Answer</p>
            {renderFormattedContent(next.content)}
          </article>,
        );
        index += 1;
        continue;
      }

      blocks.push(
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
        </article>,
      );
    }
    return blocks;
  }

  return (
    <main className="min-h-screen bg-[#f6f9ff] text-[#2a333b]">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-white/80 px-6 py-4 backdrop-blur-xl">
        <div>
          <h1 className="text-xl font-bold text-[#0060ad]">Doctor Review</h1>
          <p className="text-xs text-[#576069]">ผู้เชี่ยวชาญ: {user.displayName}</p>
        </div>
        <div className="flex gap-2">
          <button className="rounded-full bg-[#e1e9f2] px-4 py-2 text-sm" disabled={isLoadingList} onClick={onRefresh} type="button">
            {isLoadingList ? "Refreshing..." : "Refresh"}
          </button>
          <button className="rounded-full bg-[#e1e9f2] px-4 py-2 text-sm font-semibold" onClick={onLogout} type="button">
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[280px_1fr_360px]">
        <aside className="rounded-3xl bg-[#eff4fb] p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#727c85]">ประวัติการสนทนา</h2>
          <div className="mb-3 flex rounded-full bg-white p-1">
            <button
              className={`flex-1 rounded-full px-3 py-1 text-xs ${doctorViewMode === "pending" ? "bg-[#0060ad] text-white" : ""}`}
              onClick={() => setDoctorViewMode("pending")}
              type="button"
            >
              รอรีวิว
            </button>
            <button
              className={`flex-1 rounded-full px-3 py-1 text-xs ${doctorViewMode === "reviewed" ? "bg-[#0060ad] text-white" : ""}`}
              onClick={() => setDoctorViewMode("reviewed")}
              type="button"
            >
              รีวิวแล้ว
            </button>
          </div>
          <div className="space-y-2">
            {visibleDoctorSessions.map((s) => (
              <button
                className={`w-full rounded-2xl px-3 py-3 text-left text-sm ${
                  activeDoctorSessionId === s.id ? "bg-white text-[#0060ad]" : "bg-[#dae4ee] text-[#2a333b]"
                }`}
                key={s.id}
                onClick={() => onSelectSession(s.id)}
                type="button"
              >
                <p className="truncate font-semibold">{s.id}</p>
                <p className="mt-1 text-xs opacity-70">status: {s.status}</p>
              </button>
            ))}
            {visibleDoctorSessions.length === 0 ? (
              <p className="rounded-2xl bg-white px-3 py-2 text-sm text-[#576069]">
                {doctorViewMode === "pending" ? "ไม่มีเคสที่รอรีวิว" : "ยังไม่มีประวัติที่รีวิวแล้ว"}
              </p>
            ) : null}
            {isLoadingHistory ? <p className="rounded-2xl bg-white px-3 py-2 text-xs text-[#576069]">กำลังโหลดประวัติเคส...</p> : null}
          </div>
        </aside>

        <section className="rounded-3xl bg-[#eff4fb] p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#727c85]">การ์ดประวัติการสนทนา</h2>
          <div className="space-y-3">
            {renderDoctorHistoryBlocks()}
            {activeDoctorMessages.length === 0 ? (
              <p className="rounded-2xl bg-white px-3 py-2 text-sm text-[#576069]">เลือกการสนทนาจากด้านซ้าย</p>
            ) : null}
          </div>
        </section>

        <aside className="rounded-3xl bg-[#eff4fb] p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#727c85]">Review Form (POST /review)</h2>
          <div className="space-y-3">
            <textarea
              className="min-h-24 w-full rounded-2xl bg-white px-3 py-2 text-sm text-[#576069] outline-none"
              readOnly
              value={reviewQuestion}
            />
            <button className="rounded-full bg-[#e1e9f2] px-4 py-2 text-xs font-semibold" onClick={onToggleEditAnswer} type="button">
              {isEditingAnswer ? "Lock Edited Answer" : "Edit Answer"}
            </button>
            <textarea
              className="min-h-28 w-full rounded-2xl bg-white px-3 py-2 text-sm outline-none"
              disabled={!isEditingAnswer}
              onChange={(e) => setReviewAnswer(e.target.value)}
              placeholder="Approved/edited answer"
              value={reviewAnswer}
            />
            <textarea
              className="min-h-20 w-full rounded-2xl bg-white px-3 py-2 text-sm outline-none"
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="หมายเหตุเพิ่มเติม (optional)"
              value={reviewNote}
            />
            <button
              className="w-full rounded-full bg-gradient-to-br from-[#0060ad] to-[#68abff] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
              disabled={!activeDoctorSessionId || submittingReview || doctorViewMode === "reviewed"}
              onClick={onSubmitReview}
              type="button"
            >
              {submittingReview ? "Submitting..." : "Submit Review"}
            </button>
            <p className="text-xs text-[#576069]">
              {doctorViewMode === "pending"
                ? "Question ล็อกไว้จากบทสนทนา"
                : "แท็บนี้เป็นประวัติ จึงปิดการ submit"}
            </p>
          </div>
        </aside>
      </div>
      {error ? <p className="mx-4 mb-4 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
    </main>
  );
}
