export type UserRole = "patient" | "doctor";

export interface User {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  displayName: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
}

export interface LoginRequest {
  email?: string;
  username?: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface SignupRequest {
  email: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  password: string;
  displayName?: string;
  role?: UserRole;
}

export interface SignupResponse {
  token: string;
  user: User;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "doctor";
  content: string;
  createdAt: string;
}

export interface RetrievalResult {
  text: string;
  score?: number;
  source: "qdrant" | "local";
}

export interface SessionRuntimeMetadata {
  provider: string;
  modelVersion: string;
  promptVersion: string;
  indexVersion: string;
  retrievalSource: "qdrant" | "local" | "mixed" | "none";
  retrievalCount: number;
  fallbackReason?: string;
  latencyMs: number;
  generatedAt: string;
}

export interface ChatSession {
  id: string;
  patientId: string;
  status: "active" | "pending_doctor_review" | "completed";
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  latestDraft?: string;
  retrievalContext?: string[];
  lastRuntimeMetadata?: SessionRuntimeMetadata;
  doctorEdit?: {
    doctorId: string;
    approvedAt: string;
    question: string;
    answer: string;
    content: string;
    note?: string;
    severity?: "low" | "medium" | "high" | "critical";
    recommendedDepartment?: string;
    requiresEscalation?: boolean;
    reviewOutcome?: "approved" | "corrected" | "rejected";
  };
}

export interface StartChatRequest {
  message: string;
}

export interface StartChatResponse {
  session: ChatSession;
  checkpointRequired: boolean;
}

export interface ContinueChatRequest {
  message: string;
}

export interface ExpertReviewRequest {
  question: string;
  answer: string;
  note?: string;
  approvedContent?: string;
  severity?: "low" | "medium" | "high" | "critical";
  recommendedDepartment?: string;
  requiresEscalation?: boolean;
  reviewOutcome?: "approved" | "corrected" | "rejected";
}

export interface ApiError {
  error: string;
}
