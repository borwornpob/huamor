"use client";

import { useState } from "react";
import type { LoginResponse, User } from "../types";
import { requestApi } from "../lib/api";

export type AuthState = {
  mode: "signin" | "signup";
  identifier: string;
  password: string;
  signupEmail: string;
  signupFirstName: string;
  signupLastName: string;
  signupBirthDate: string;
  signupGender: string;
  signupPassword: string;
  agreeTerms: boolean;
};

const initialAuthState: AuthState = {
  mode: "signin",
  identifier: "patient1",
  password: "patient123",
  signupEmail: "",
  signupFirstName: "",
  signupLastName: "",
  signupBirthDate: "1998-01-15",
  signupGender: "female",
  signupPassword: "",
  agreeTerms: false,
};

export type UseAuthReturn = {
  token: string;
  user: User | null;
  error: string;
  loadingAction: string | null;
  authState: AuthState;
  isAuthed: boolean;
  setAuthState: <K extends keyof AuthState>(key: K, value: AuthState[K]) => void;
  handleLogin: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  handleSignup: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  logout: () => void;
  clearError: () => void;
};

export function useAuth(): UseAuthReturn {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [authState, setAuthStateRaw] = useState<AuthState>(initialAuthState);

  const isAuthed = token.length > 0 && user !== null;

  function setAuthState<K extends keyof AuthState>(key: K, value: AuthState[K]) {
    setAuthStateRaw((prev) => ({ ...prev, [key]: value }));
  }

  function clearError() {
    setError("");
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoadingAction("auth");
    try {
      const data = (await requestApi("/api/auth/login", "POST", {
        username: authState.identifier,
        password: authState.password,
      })) as LoginResponse;
      const me = (await requestApi("/api/auth/me", "GET", undefined, data.token)) as { user: User };
      setToken(data.token);
      setUser(me.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      throw err;
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleSignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!authState.agreeTerms) {
      setError("กรุณายอมรับเงื่อนไขก่อนสมัคร");
      return;
    }
    setLoadingAction("auth");
    try {
      const data = (await requestApi("/api/auth/signup", "POST", {
        email: authState.signupEmail,
        firstName: authState.signupFirstName,
        lastName: authState.signupLastName,
        birthDate: authState.signupBirthDate,
        gender: authState.signupGender,
        password: authState.signupPassword,
      })) as LoginResponse;
      const me = (await requestApi("/api/auth/me", "GET", undefined, data.token)) as { user: User };
      setToken(data.token);
      setUser(me.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
      throw err;
    } finally {
      setLoadingAction(null);
    }
  }

  function logout() {
    setToken("");
    setUser(null);
    setAuthStateRaw(initialAuthState);
    setError("");
    setLoadingAction(null);
  }

  return {
    token,
    user,
    error,
    loadingAction,
    authState,
    isAuthed,
    setAuthState,
    handleLogin,
    handleSignup,
    logout,
    clearError,
  };
}
