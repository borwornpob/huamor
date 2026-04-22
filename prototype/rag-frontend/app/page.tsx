"use client";

import { useCallback } from "react";
import DoctorView from "./components/DoctorView";
import PatientView from "./components/PatientView";
import AuthForm from "./components/AuthForm";
import { useAuth } from "./hooks/useAuth";

export default function Home() {
  const {
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
  } = useAuth();

  const handleError = useCallback((err: string) => {
    console.error(err);
  }, []);

  if (!isAuthed) {
    return (
      <AuthForm
        authState={authState}
        error={error}
        loadingAction={loadingAction}
        onAuthChange={setAuthState}
        onLogin={async (e) => {
          try {
            await handleLogin(e);
          } catch {
            // error is already set in hook
          }
        }}
        onSignup={async (e) => {
          try {
            await handleSignup(e);
          } catch {
            // error is already set in hook
          }
        }}
      />
    );
  }

  if (user!.role === "doctor") {
    return (
      <DoctorView
        token={token}
        user={user!}
        onLogout={logout}
        onError={handleError}
      />
    );
  }

  return (
    <PatientView
      token={token}
      user={user!}
      onLogout={logout}
      onError={handleError}
    />
  );
}
