"use client";

import { useState, useRef } from "react";
import { Zap, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "react-oidc-context";
import { hapticSuccess, hapticError, hapticLight } from "@/lib/haptics";

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const auth = useAuth();
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === "email") {
      if (!email.trim()) return;
      hapticLight();
      setError(null);
      setStep("password");
      setTimeout(() => passwordRef.current?.focus(), 100);
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const user = await auth.signinResourceOwnerCredentials({
        username: email.trim(),
        password,
      });

      if (user?.id_token) {
        localStorage.setItem("stdb_token", user.id_token);
      }

      hapticSuccess();
      onSuccess?.();
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : "Invalid email or password.");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-12 bg-background">
      <div className="mx-auto w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-stone-900 text-white">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <p className="font-bold text-lg leading-none">BizOps</p>
            <p className="text-xs text-muted-foreground">AI Business Manager</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1.5 mb-6">
          {(["email", "password"] as const).map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${
                s === "email" || step === "password" ? "bg-stone-900" : "bg-stone-200"
              }`}
            />
          ))}
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {step === "email" ? (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold">Sign in</h1>
                <p className="text-muted-foreground text-sm mt-1">Enter your email to continue</p>
              </div>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                autoComplete="email"
                className="text-lg h-12"
              />
              {error && (
                <p className="text-sm text-destructive rounded-sm bg-destructive/10 px-3 py-2">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={!email.trim()} className="w-full h-11">
                Continue
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <button
                  type="button"
                  onClick={() => { hapticLight(); setStep("email"); setError(null); }}
                  className="text-muted-foreground mb-2 flex items-center gap-1 text-sm"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> {email}
                </button>
                <h1 className="text-2xl font-bold">Enter your password</h1>
              </div>
              <Input
                ref={passwordRef}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="text-lg h-12"
              />
              {error && (
                <p className="text-sm text-destructive rounded-sm bg-destructive/10 px-3 py-2">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={loading || !password} className="w-full h-11">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
              </Button>
            </div>
          )}
        </form>

        <p className="text-center text-sm text-muted-foreground mt-8">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="font-medium text-foreground underline underline-offset-4">
            Create one
          </a>
        </p>
      </div>
    </div>
  );
}
