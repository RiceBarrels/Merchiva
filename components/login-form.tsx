"use client";

import { useState, useEffect, useRef } from "react";
import { Zap, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hapticSuccess, hapticError, hapticLight } from "@/lib/haptics";
import { connectToStdb, hashPassword } from "@/lib/spacetimedb/auth";
import { getStoredToken } from "@/lib/spacetimedb/client";

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"email" | "password">("email");
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleContinue = () => {
    if (!email.trim()) return;
    hapticLight();
    setStep("password");
    setTimeout(() => passwordRef.current?.focus(), 100);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === "email") {
      handleContinue();
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const storedToken = getStoredToken();

      if (storedToken) {
        const { conn } = await connectToStdb(storedToken);
        const identity = conn.identity;

        if (identity && email.trim()) {
          await new Promise<void>((resolve) => {
            const sub = conn.subscriptionBuilder().onApplied(() => {
              resolve();
            }).subscribe(["SELECT * FROM user"]);
            setTimeout(resolve, 3000);
            void sub;
          });

          const db = conn as any;
          const rows: any[] = db.db?.user ? [...db.db.user.iter()] : [];
          const userRow = rows.find(
            (r: any) => r.identity?.toString() === identity.toString()
          );

          if (userRow && userRow.email && userRow.email !== email.trim()) {
            hapticError();
            setError("Email doesn't match the saved session. Sign out first or try signing up.");
            setLoading(false);
            return;
          }
        }

        hapticSuccess();
        onSuccess?.();
        return;
      }

      const hash = await hashPassword(password);
      const { conn } = await connectToStdb();

      await new Promise<void>((resolve) => {
        conn.subscriptionBuilder().onApplied(() => resolve()).subscribe(["SELECT * FROM user"]);
        setTimeout(resolve, 3000);
      });

      await conn.reducers.loginWithPassword({ email: email.trim(), passwordHash: hash });
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const identity = conn.identity;
      const db = conn as any;
      const rows: any[] = db.db?.user ? [...db.db.user.iter()] : [];
      const userRow = rows.find(
        (r: any) => r.identity?.toString() === identity?.toString()
      );

      if (!userRow || userRow.email !== email.trim()) {
        hapticError();
        setError("Invalid email or password.");
        setLoading(false);
        return;
      }

      hapticSuccess();
      onSuccess?.();
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
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
