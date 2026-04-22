"use client";

import type { AuthState } from "../hooks/useAuth";

type AuthFormProps = {
  authState: AuthState;
  loadingAction: string | null;
  error: string;
  onAuthChange: <K extends keyof AuthState>(key: K, value: AuthState[K]) => void;
  onLogin: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onSignup: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
};

export default function AuthForm({
  authState,
  loadingAction,
  error,
  onAuthChange,
  onLogin,
  onSignup,
}: AuthFormProps) {
  const authLoading = loadingAction === "auth";

  const inputClassName =
    "w-full rounded-2xl bg-[#eff4fb] px-4 py-3 outline-none ring-2 ring-transparent focus:ring-[#0060ad]/30";

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
                  authState.mode === "signin" ? "bg-white text-[#0060ad]" : "text-[#576069]"
                }`}
                onClick={() => onAuthChange("mode", "signin")}
                type="button"
              >
                Sign In
              </button>
              <button
                className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  authState.mode === "signup" ? "bg-white text-[#0060ad]" : "text-[#576069]"
                }`}
                onClick={() => onAuthChange("mode", "signup")}
                type="button"
              >
                Sign Up
              </button>
            </div>

            {authState.mode === "signin" ? (
              <form className="space-y-4" onSubmit={onLogin}>
                <h2 className="text-2xl font-bold">Welcome Back</h2>
                <input
                  className={inputClassName}
                  onChange={(e) => onAuthChange("identifier", e.target.value)}
                  placeholder="Username or email"
                  value={authState.identifier}
                />
                <input
                  className={inputClassName}
                  onChange={(e) => onAuthChange("password", e.target.value)}
                  placeholder="Password"
                  type="password"
                  value={authState.password}
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
              <form className="space-y-3" onSubmit={onSignup}>
                <h2 className="text-2xl font-bold">Create Account</h2>
                <input
                  className={inputClassName}
                  onChange={(e) => onAuthChange("signupEmail", e.target.value)}
                  placeholder="Email"
                  type="email"
                  value={authState.signupEmail}
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className={inputClassName}
                    onChange={(e) => onAuthChange("signupFirstName", e.target.value)}
                    placeholder="First name"
                    value={authState.signupFirstName}
                  />
                  <input
                    className={inputClassName}
                    onChange={(e) => onAuthChange("signupLastName", e.target.value)}
                    placeholder="Last name"
                    value={authState.signupLastName}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className={inputClassName}
                    onChange={(e) => onAuthChange("signupBirthDate", e.target.value)}
                    type="date"
                    value={authState.signupBirthDate}
                  />
                  <select
                    className={inputClassName}
                    onChange={(e) => onAuthChange("signupGender", e.target.value)}
                    value={authState.signupGender}
                  >
                    <option value="female">female</option>
                    <option value="male">male</option>
                    <option value="other">other</option>
                  </select>
                </div>
                <input
                  className={inputClassName}
                  onChange={(e) => onAuthChange("signupPassword", e.target.value)}
                  placeholder="Password"
                  type="password"
                  value={authState.signupPassword}
                />
                <label className="flex items-center gap-2 text-sm text-[#576069]">
                  <input
                    checked={authState.agreeTerms}
                    onChange={(e) => onAuthChange("agreeTerms", e.target.checked)}
                    type="checkbox"
                  />
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
