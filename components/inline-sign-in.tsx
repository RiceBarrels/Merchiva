"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ShieldCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { storeAuthTokens } from "@/lib/auth/context";
import { apiUrl } from "@/lib/api-client";

export function InlineSignIn({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [code, setCode] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [challengeId, setChallengeId] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/sign-in"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.mfaRequired) {
          setPendingToken(data.pendingAuthenticationToken);
          const factors = data.authenticationFactors ?? [];
          const totp = factors.find((f: { type: string }) => f.type === "totp");
          if (totp) setChallengeId(totp.id);
          setNeeds2FA(true);
          setLoading(false);
          return;
        }
        setError(data.error ?? "Authentication failed");
        setLoading(false);
        return;
      }

      storeAuthTokens(data.accessToken, data.refreshToken, data.user);
      window.location.href = redirectTo;
    } catch {
      setError("Something went wrong.");
      setLoading(false);
    }
  };

  const handle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/verify-mfa"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          pendingAuthenticationToken: pendingToken,
          authenticationChallengeId: challengeId,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Invalid code. Please try again.");
        setLoading(false);
        return;
      }

      storeAuthTokens(data.accessToken, data.refreshToken, data.user);
      window.location.href = redirectTo;
    } catch {
      setError("Invalid code. Please try again.");
      setLoading(false);
    }
  };

  if (needs2FA) {
    return (
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Two-factor authentication</h1>
          <p className="text-sm text-muted-foreground">Enter the code from your authenticator app</p>
        </div>

        <form onSubmit={handle2FA} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inline-2fa">Verification code</Label>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                id="inline-2fa"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
                placeholder="000000"
                className="font-mono text-center tracking-[0.3em]"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
          </Button>
        </form>

        <Button
          type="button"
          variant="ghost"
          onClick={() => { setNeeds2FA(false); setError(""); setCode(""); }}
          className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground hover:bg-transparent gap-1.5 font-normal"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">Enter your credentials to continue</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="inline-email">Email</Label>
          <Input
            id="inline-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="inline-password">Password</Label>
          <Input
            id="inline-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
          Sign up
        </Link>
      </p>
    </div>
  );
}
