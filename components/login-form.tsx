"use client";

import { useState } from "react";
import { Zap, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSignIn } from "@clerk/react";
import { hapticSuccess, hapticError, hapticLight } from "@/lib/haptics";
import Link from "next/link";

export function LoginForm({ onSuccess, onSignup }: { onSuccess?: () => void; onSignup?: () => void }) {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === "email") {
      if (!email.trim()) return;
      hapticLight();
      setStep("password");
      return;
    }

    if (!isLoaded || !signIn) return;
    setLoading(true);
    setError(null);

    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        hapticSuccess();
        onSuccess?.();
      } else {
        throw new Error("Sign in incomplete — please try again.");
      }
    } catch (err) {
      hapticError();
      const msg = err instanceof Error ? err.message : "Invalid email or password";
      // Clerk error objects have a `errors` array
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clerkMsg = (err as any)?.errors?.[0]?.longMessage ?? (err as any)?.errors?.[0]?.message;
      setError(clerkMsg ?? msg);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 bg-background">
      <div className="mx-auto w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-stone-900 text-white">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <p className="font-bold text-lg">BizOps</p>
            <p className="text-xs text-muted-foreground">AI Business Manager</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1.5">
          <div className="h-1 flex-1 rounded-full bg-stone-900" />
          <div className={`h-1 flex-1 rounded-full transition-colors ${step === "password" ? "bg-stone-900" : "bg-stone-200"}`} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {step === "email" ? (
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold">Welcome back</h1>
                <p className="text-muted-foreground text-sm mt-1">Enter your email to continue</p>
              </div>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                autoComplete="email"
                className="h-12 text-base"
              />
              <Button type="submit" disabled={!email.trim()} className="w-full h-11">
                Continue
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => { hapticLight(); setStep("email"); setError(null); }}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              <div>
                <h1 className="text-2xl font-bold">Enter your password</h1>
                <p className="text-muted-foreground text-sm mt-1">{email}</p>
              </div>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoFocus
                autoComplete="current-password"
                className="h-12 text-base"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading || !password} className="w-full h-11">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
              </Button>
            </div>
          )}
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          {onSignup ? (
            <button onClick={onSignup} className="font-medium text-foreground underline underline-offset-4">
              Create one
            </button>
          ) : (
            <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
              Create one
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}
