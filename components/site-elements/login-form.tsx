"use client";

import { useState } from "react";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface LoginFormProps {
  mode?: "login" | "register" | "both";
  redirectUrl?: string;
  isEditor?: boolean;
  themeColor?: string;
}

type ActiveTab = "login" | "register";

export function LoginForm({
  mode = "both",
  redirectUrl = "/",
  isEditor = false,
  themeColor = "#0f172a",
}: LoginFormProps) {
  const [tab, setTab] = useState<ActiveTab>(mode === "register" ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEditor) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    try {
      if (tab === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        window.location.href = redirectUrl;
      } else {
        const { error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        setMessage("Check your email to confirm your account.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Enter your email address first.");
      return;
    }
    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (authError) {
      setError(authError.message);
    } else {
      setMessage("Password reset link sent to your email.");
    }
  }

  return (
    <div className="border border-stone-200 bg-white p-5 max-w-sm" style={{ borderRadius: "0.3rem" }}>
      {mode === "both" && (
        <div className="flex border border-stone-200 mb-4 p-0.5 gap-0.5" style={{ borderRadius: "0.3rem" }}>
          {(["login", "register"] as ActiveTab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(null); setMessage(null); }}
              className="flex-1 py-1.5 text-xs font-medium transition-colors capitalize"
              style={{
                borderRadius: "0.2rem",
                backgroundColor: tab === t ? themeColor : "transparent",
                color: tab === t ? "#fff" : "#78716c",
              }}
            >
              {t === "login" ? "Sign In" : "Create Account"}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-stone-700 mb-1">Email</label>
          <input
            type="email"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400"
            style={{ borderRadius: "0.3rem" }}
            disabled={isEditor}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-700 mb-1">Password</label>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              placeholder="••••••••"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-stone-200 bg-stone-50 px-3 py-2 pr-9 text-sm text-stone-900 outline-none focus:border-stone-400"
              style={{ borderRadius: "0.3rem" }}
              disabled={isEditor}
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2" style={{ borderRadius: "0.3rem" }}>
            {error}
          </p>
        )}
        {message && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2" style={{ borderRadius: "0.3rem" }}>
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || isEditor}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: themeColor, borderRadius: "0.3rem" }}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {tab === "login" ? "Sign In" : "Create Account"}
        </button>

        {tab === "login" && (
          <div className="text-center">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-xs text-stone-500 hover:text-stone-800 underline underline-offset-2"
              disabled={isEditor}
            >
              Forgot password?
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
