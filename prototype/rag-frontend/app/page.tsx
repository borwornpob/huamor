"use client";

import { FormEvent, useState } from "react";
import DoctorView from "./components/DoctorView";
import PatientView from "./components/PatientView";
import type {
  ApiError,
  ChatMessage,
  ChatSession,
  LoginResponse,
  SessionHistoryResponse,
  SessionListResponse,
  StartChatResponse,
  User,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8787";

export default function Home() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [identifier, setIdentifier] = useState("patient1");
  const [password, setPassword] = useState("patient123");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupFirstName, setSignupFirstName] = useState("");
  const [signupLastName, setSignupLastName] = useState("");
  const [signupBirthDate, setSignupBirthDate] = useState("1998-01-15");
  const [signupGender, setSignupGender] = useState("female");
  const [signupPassword, setSignupPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [message, setMessage] = useState("");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);

  const [patientSessions, setPatientSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);

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
  const [rawResponse, setRawResponse] = useState("");

  const isAuthed = token.length > 0 && user !== null;

  async function requestApi(path: string, method: "GET" | "POST", body?: unknown, authToken?: string) {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...((authToken ?? token) ? { Authorization: `Bearer ${authToken ?? token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const apiError = typeof (data as ApiError)?.error === "string" ? (data as ApiError).error : "Request failed";
      throw new Error(`${response.status} ${apiError}`);
    }
    setRawResponse(JSON.stringify(data, null, 2));
    return data;
  }

  async function loadPatientSessions(authToken?: string) {
    setLoadingAction("refresh-history");
    try {
      const data = (await requestApi("/api/chat/sessions?limit=30", "GET", undefined, authToken)) as SessionListResponse;
      const list = data.sessions ?? [];
      setPatientSessions(list);
      if (!activeSessionId && list.length > 0) {
        await selectPatientSession(list[0].id, authToken);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load sessions failed");
    } finally {
      setLoadingAction(null);
    }
  }

  async function selectPatientSession(sessionId: string, authToken?: string) {
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

  async function refreshSelectedByAltHistoryRoute(authToken?: string) {
    if (!activeSessionId) return;
    setLoadingAction("refresh-chat");
    setError("");
    try {
      const data = (await requestApi(`/api/chat/${activeSessionId}/history`, "GET", undefined, authToken)) as SessionHistoryResponse;
      setActiveMessages(data.messages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh alt history failed");
    } finally {
      setLoadingAction(null);
    }
  }

  async function loadDoctorPendingSessions(authToken?: string) {
    setLoadingAction("refresh-doctor");
    try {
      await requestApi("/api/expert/pending", "GET", undefined, authToken);
      const allData = (await requestApi("/api/expert/sessions?limit=100", "GET", undefined, authToken)) as SessionListResponse;
      const list = (allData.sessions ?? []).filter((s) => s.status !== "completed");
      const reviewed = (allData.sessions ?? []).filter((s) => s.status === "completed");
      setDoctorSessions(list);
      setDoctorReviewedSessions(reviewed);
      if (list.length > 0) {
        await selectDoctorSession(list[0].id, authToken);
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

  async function selectDoctorSession(sessionId: string, authToken?: string) {
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

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoadingAction("auth");
    try {
      const data = (await requestApi("/api/auth/login", "POST", {
        username: identifier,
        password,
      })) as LoginResponse;
      const me = (await requestApi("/api/auth/me", "GET", undefined, data.token)) as { user: User };
      setToken(data.token);
      setUser(me.user);
      if (me.user.role === "patient") {
        await loadPatientSessions(data.token);
      } else {
        await loadDoctorPendingSessions(data.token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!agreeTerms) {
      setError("กรุณายอมรับเงื่อนไขก่อนสมัคร");
      return;
    }
    setLoadingAction("auth");
    try {
      const data = (await requestApi("/api/auth/signup", "POST", {
        email: signupEmail,
        firstName: signupFirstName,
        lastName: signupLastName,
        birthDate: signupBirthDate,
        gender: signupGender,
        password: signupPassword,
      })) as LoginResponse;
      const me = (await requestApi("/api/auth/me", "GET", undefined, data.token)) as { user: User };
      setToken(data.token);
      setUser(me.user);
      await loadPatientSessions(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoadingAction(null);
    }
  }

  async function sendMessage() {
    if (!message.trim()) return;
    setError("");
    setLoadingAction("send");
    try {
      if (!activeSessionId) {
        const start = (await requestApi("/api/chat/start", "POST", { message })) as StartChatResponse;
        setActiveSessionId(start.session.id);
        setActiveMessages(start.session.messages ?? []);
      } else {
        const cont = (await requestApi(`/api/chat/${activeSessionId}/message`, "POST", { message })) as StartChatResponse;
        setActiveMessages(cont.session.messages ?? []);
      }
      setMessage("");
      await loadPatientSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send message failed");
    } finally {
      setLoadingAction(null);
    }
  }

  async function submitDoctorReview() {
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
      });
      setDoctorSessions((prev) => prev.filter((s) => s.id !== activeDoctorSessionId));
      setActiveDoctorSessionId("");
      setActiveDoctorMessages([]);
      setReviewQuestion("Please review this consultation");
      setReviewAnswer("");
      setReviewNote("");
      setIsEditingAnswer(false);
      await loadDoctorPendingSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit review failed");
    } finally {
      setSubmittingReview(false);
    }
  }

  function startNewChat() {
    setActiveSessionId("");
    setActiveMessages([]);
    setMessage("");
  }

  function logout() {
    setToken("");
    setUser(null);
    setPatientSessions([]);
    setActiveSessionId("");
    setActiveMessages([]);
    setDoctorSessions([]);
    setDoctorReviewedSessions([]);
    setActiveDoctorSessionId("");
    setActiveDoctorMessages([]);
    setRawResponse("");
    setError("");
    setLoadingAction(null);
  }

  if (!isAuthed) {
    const authLoading = loadingAction === "auth";
    return (
      <main className="min-h-screen bg-[#f6f9ff] text-[#2a333b]">
        <div className="mx-auto grid min-h-screen max-w-7xl lg:grid-cols-2">
          <section className="hidden p-12 lg:flex lg:flex-col lg:justify-between">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#0060ad]">Hua-Mor</h1>
              <p className="mt-6 max-w-md text-4xl font-bold leading-tight">
                Your compassionate medical companion, simplified.
              </p>
            </div>
            <div className="rounded-3xl bg-white/80 p-6 shadow-[0_8px_32px_rgba(42,51,59,0.06)]">
              <p className="font-semibold">Demo account</p>
              <p className="mt-2 text-sm text-[#576069]">patient: patient1 / patient123</p>
              <p className="text-sm text-[#576069]">doctor: doctor1 / doctor123</p>
            </div>
          </section>

          <section className="flex items-center justify-center px-6 py-10">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-[0_8px_32px_rgba(42,51,59,0.06)]">
              <div className="mb-6 flex rounded-full bg-[#eff4fb] p-1">
                <button
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    mode === "signin" ? "bg-white text-[#0060ad]" : "text-[#576069]"
                  }`}
                  onClick={() => setMode("signin")}
                  type="button"
                >
                  Sign In
                </button>
                <button
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    mode === "signup" ? "bg-white text-[#0060ad]" : "text-[#576069]"
                  }`}
                  onClick={() => setMode("signup")}
                  type="button"
                >
                  Sign Up
                </button>
              </div>

              {mode === "signin" ? (
                <form className="space-y-4" onSubmit={handleLogin}>
                  <h2 className="text-2xl font-bold">Welcome Back</h2>
                  <input
                    className="w-full rounded-2xl bg-[#eff4fb] px-4 py-3 outline-none ring-2 ring-transparent focus:ring-[#0060ad]/30"
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Username or email"
                    value={identifier}
                  />
                  <input
                    className="w-full rounded-2xl bg-[#eff4fb] px-4 py-3 outline-none ring-2 ring-transparent focus:ring-[#0060ad]/30"
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    type="password"
                    value={password}
                  />
                  <button
                    className="w-full rounded-full bg-gradient-to-br from-[#0060ad] to-[#68abff] px-4 py-3 font-bold text-white disabled:opacity-50"
                    disabled={authLoading}
                    type="submit"
                  >
                    {authLoading ? "Loading..." : "Sign In"}
                  </button>
                </form>
              ) : (
                <form className="space-y-3" onSubmit={handleSignup}>
                  <h2 className="text-2xl font-bold">Create Account</h2>
                  <input
                    className="w-full rounded-2xl bg-[#eff4fb] px-4 py-3 outline-none ring-2 ring-transparent focus:ring-[#0060ad]/30"
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="Email"
                    type="email"
                    value={signupEmail}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      className="w-full rounded-2xl bg-[#eff4fb] px-4 py-3 outline-none ring-2 ring-transparent focus:ring-[#0060ad]/30"
                      onChange={(e) => setSignupFirstName(e.target.value)}
                      placeholder="First name"
                      value={signupFirstName}
                    />
                    <input
                      className="w-full rounded-2xl bg-[#eff4fb] px-4 py-3 outline-none ring-2 ring-transparent focus:ring-[#0060ad]/30"
                      onChange={(e) => setSignupLastName(e.target.value)}
                      placeholder="Last name"
                      value={signupLastName}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      className="w-full rounded-2xl bg-[#eff4fb] px-4 py-3 outline-none ring-2 ring-transparent focus:ring-[#0060ad]/30"
                      onChange={(e) => setSignupBirthDate(e.target.value)}
                      type="date"
                      value={signupBirthDate}
                    />
                    <select
                      className="w-full rounded-2xl bg-[#eff4fb] px-4 py-3 outline-none ring-2 ring-transparent focus:ring-[#0060ad]/30"
                      onChange={(e) => setSignupGender(e.target.value)}
                      value={signupGender}
                    >
                      <option value="female">female</option>
                      <option value="male">male</option>
                      <option value="other">other</option>
                    </select>
                  </div>
                  <input
                    className="w-full rounded-2xl bg-[#eff4fb] px-4 py-3 outline-none ring-2 ring-transparent focus:ring-[#0060ad]/30"
                    onChange={(e) => setSignupPassword(e.target.value)}
                    placeholder="Password"
                    type="password"
                    value={signupPassword}
                  />
                  <label className="flex items-center gap-2 text-sm text-[#576069]">
                    <input checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} type="checkbox" />
                    ยอมรับเงื่อนไขการใช้งาน
                  </label>
                  <button
                    className="w-full rounded-full bg-gradient-to-br from-[#0060ad] to-[#68abff] px-4 py-3 font-bold text-white disabled:opacity-50"
                    disabled={authLoading}
                    type="submit"
                  >
                    {authLoading ? "Loading..." : "Create Account"}
                  </button>
                </form>
              )}
              {error ? <p className="mt-4 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (user.role === "doctor") {
    return (
      <DoctorView
        activeDoctorMessages={activeDoctorMessages}
        activeDoctorSessionId={activeDoctorSessionId}
        doctorReviewedSessions={doctorReviewedSessions}
        doctorSessions={doctorSessions}
        doctorViewMode={doctorViewMode}
        error={error}
        loadingAction={loadingAction}
        onLogout={logout}
        onRefresh={loadDoctorPendingSessions}
        onSelectSession={selectDoctorSession}
        onSubmitReview={submitDoctorReview}
        reviewAnswer={reviewAnswer}
        reviewNote={reviewNote}
        reviewQuestion={reviewQuestion}
        setDoctorViewMode={setDoctorViewMode}
        setReviewAnswer={setReviewAnswer}
        setReviewNote={setReviewNote}
        setReviewQuestion={setReviewQuestion}
        isEditingAnswer={isEditingAnswer}
        onToggleEditAnswer={() => setIsEditingAnswer((prev) => !prev)}
        submittingReview={submittingReview}
        user={user}
      />
    );
  }

  return (
    <PatientView
      activeMessages={activeMessages}
      activeSessionId={activeSessionId}
      error={error}
      loadingAction={loadingAction}
      message={message}
      onLogout={logout}
      onNewChat={startNewChat}
      onRefreshChat={refreshSelectedByAltHistoryRoute}
      onRefreshHistory={loadPatientSessions}
      onSelectSession={selectPatientSession}
      onSendMessage={sendMessage}
      patientSessions={patientSessions}
      rawResponse={rawResponse}
      setMessage={setMessage}
      user={user}
    />
  );
}
