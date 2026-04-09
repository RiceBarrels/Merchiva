"use client";

import { useState } from "react";
import { Zap, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hapticSuccess, hapticLight } from "@/lib/haptics";
import { generatePKCE, savePKCE } from "@/lib/pkce";
import {
  SPACETIMEAUTH_AUTHORITY,
  SPACETIMEAUTH_CLIENT_ID,
  SPACETIMEAUTH_REDIRECT_URI,
} from "@/lib/spacetimedb/auth-config";
import Link from "next/link";

// onSuccess is kept for cases where login-form is embedded and token already exists,
// but the primary auth path is a redirect — onSuccess is not called mid-redirect.
export function LoginForm({ onSuccess: _onSuccess, onSignup }: { onSuccess?: () => void; onSignup?: () => void }) {
  const [step, setStep] = useState<"email" | "redirecting">("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    hapticLight();
    setLoading(true);
    setStep("redirecting");

    try {
      const { verifier, challenge } = await generatePKCE();
      const nonce = crypto.randomUUID();
      savePKCE(verifier, nonce);

      const params = new URLSearchParams({
        response_type: "code",
        client_id: SPACETIMEAUTH_CLIENT_ID,
        redirect_uri: SPACETIMEAUTH_REDIRECT_URI,
        scope: "openid profile email",
        code_challenge: challenge,
        code_challenge_method: "S256",
        nonce,
        login_hint: email.trim(),
      });

      hapticSuccess();
      window.location.href = `${SPACETIMEAUTH_AUTHORITY}/auth?${params.toString()}`;
    } catch {
      setLoading(false);
      setStep("email");
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
          <div className={`h-1 flex-1 rounded-full transition-colors ${step === "redirecting" ? "bg-stone-900" : "bg-stone-200"}`} />
        </div>

        {step === "redirecting" ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Redirecting to sign in…</p>
          </div>
        ) : (
          <form onSubmit={handleContinue} className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Welcome back</h1>
              <p className="text-muted-foreground text-sm mt-1">Enter your email to continue</p>
            </div>

            <div className="space-y-4">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                autoComplete="email"
                className="h-12 text-base"
              />

              <Button type="submit" disabled={loading || !email.trim()} className="w-full h-11">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
              </Button>
            </div>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          {onSignup ? (
            <button
              onClick={onSignup}
              className="font-medium text-foreground underline underline-offset-4"
            >
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
