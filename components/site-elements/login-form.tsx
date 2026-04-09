"use client";

import { useState } from "react";
import type { SiteTheme } from "@/lib/types";

interface Props {
  theme: SiteTheme;
  onSuccess?: (userId: string) => void;
  title?: string;
}

export function LoginForm({ theme, onSuccess, title = "Customer Login" }: Props) {
  const r = theme.borderRadius;
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: theme.background,
    border: `1px solid ${theme.secondary}40`,
    borderRadius: r,
    padding: "9px 11px",
    fontSize: 14,
    color: theme.text,
    fontFamily: theme.bodyFont,
    outline: "none",
    boxSizing: "border-box",
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const supabase = createClient();
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.user) onSuccess?.(data.user.id);
        setSuccess("Signed in successfully!");
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccess("Check your email to confirm your account.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: theme.background,
        border: `1px solid ${theme.secondary}30`,
        borderRadius: r,
        padding: "20px",
        fontFamily: theme.bodyFont,
        color: theme.text,
        maxWidth: 360,
        margin: "0 auto",
      }}
    >
      <h3
        style={{
          fontFamily: theme.headingFont,
          fontWeight: 700,
          fontSize: 18,
          margin: "0 0 4px",
          color: theme.text,
        }}
      >
        {title}
      </h3>
      <p style={{ fontSize: 13, color: theme.secondary, margin: "0 0 16px" }}>
        {mode === "login" ? "Sign in to your account" : "Create a new account"}
      </p>

      {success ? (
        <div
          style={{
            padding: "12px",
            background: `${theme.accent}12`,
            border: `1px solid ${theme.accent}40`,
            borderRadius: r,
            fontSize: 14,
            color: theme.accent,
            fontWeight: 500,
          }}
        >
          {success}
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: theme.secondary, display: "block", marginBottom: 4 }}>
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: theme.secondary, display: "block", marginBottom: 4 }}>
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ fontSize: 13, color: "#dc2626", margin: 0 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              background: theme.accent,
              color: "#fff",
              border: "none",
              borderRadius: r,
              padding: "10px 0",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: theme.bodyFont,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Please wait…" : mode === "login" ? "Sign In" : "Create Account"}
          </button>

          <button
            type="button"
            onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
            style={{
              background: "none",
              border: "none",
              color: theme.accent,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: theme.bodyFont,
              textDecoration: "underline",
            }}
          >
            {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </form>
      )}
    </div>
  );
}
