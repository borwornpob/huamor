export type User = {
  id: string;
  displayName: string;
  email: string;
  role: "patient" | "doctor";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "doctor";
  content: string;
  createdAt: string;
};

export type ChatSession = {
  id: string;
  status: "active" | "pending_doctor_review" | "completed";
  messages: ChatMessage[];
};

export type LoginResponse = {
  token: string;
  user: User;
};

export type ApiError = { error?: string };

export type StartChatResponse = {
  session: ChatSession;
};

export type SessionListResponse = {
  sessions: ChatSession[];
};

export type SessionHistoryResponse = {
  sessionId?: string;
  session?: ChatSession;
  messages: ChatMessage[];
};
