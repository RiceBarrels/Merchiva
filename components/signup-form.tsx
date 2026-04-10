"use client";

import { useState } from "react";
import { Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { generatePKCE, savePKCE } from "@/lib/pkce";
import {
  SPACETIMEAUTH_AUTHORITY,
  SPACETIMEAUTH_CLIENT_ID,
  SPACETIMEAUTH_REDIRECT_URI,
} from "@/lib/spacetimedb/auth-config";
import Link from "next/link";

interface SignupFormProps {
  onSuccess?: () => void;
}

export function SignupForm({ onSuccess: _onSuccess }: SignupFormProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    hapticLight();
    setLoading(true);
    setRedirecting(true);

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
        screen_hint: "signup",
        login_hint: email.trim(),
      });

      hapticSuccess();
      window.location.href = `${SPACETIMEAUTH_AUTHORITY}/auth?${params.toString()}`;
    } catch {
      setLoading(false);
      setRedirecting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 flex-col justify-center px-6">
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

        {redirecting ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Redirecting to sign up…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">Create your account</h1>
              <p className="text-muted-foreground text-sm mt-1">Get started with BizOps</p>
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
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
              </Button>
            </div>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </div>
      </div>
    </div>
  );
}
