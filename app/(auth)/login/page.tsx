"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import { MerchivaLogo } from "@/components/logo";
import { BrandPanel } from "@/components/brand-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { storeAuthTokens } from "@/lib/auth/context";
import { apiUrl } from "@/lib/api-client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [code, setCode] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [challengeId, setChallengeId] = useState("");

  // Email verification state (in case user signs in with unverified email)
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");

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
          const totp = factors.find(
            (f: { type: string }) => f.type === "totp",
          );
          if (totp) setChallengeId(totp.id);
          setNeeds2FA(true);
          setLoading(false);
          return;
        }
        if (data.emailVerificationRequired) {
          setVerificationToken(data.pendingAuthenticationToken);
          setNeedsVerification(true);
          setLoading(false);
          return;
        }
        setError(data.error ?? "Authentication failed");
        setLoading(false);
        return;
      }

      storeAuthTokens(data.accessToken, data.refreshToken, data.user);
      window.location.href = next;
    } catch {
      setError("Something went wrong. Please try again.");
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
      window.location.href = next;
    } catch {
      setError("Invalid code. Please try again.");
      setLoading(false);
    }
  };

  const handleEmailVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/verify-email"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          pendingAuthenticationToken: verificationToken,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Verification failed");
        setLoading(false);
        return;
      }

      storeAuthTokens(data.accessToken, data.refreshToken, data.user);
      window.location.href = next;
    } catch {
      setError("Verification failed. Please try again.");
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    try {
      const res = await fetch(apiUrl("/api/auth/oauth"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, redirectTo: next }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Failed to start OAuth");
      }
    } catch {
      setError("Failed to start OAuth");
    }
  };

  /* ── Email verification screen ──────────────────── */

  if (needsVerification) {
    return (
      <div className="flex h-screen w-full overflow-hidden">
        <BrandPanel />
        <div className="w-full lg:w-[480px] shrink-0 h-full bg-white flex flex-col p-7 lg:p-10">
          <div className="flex items-center gap-2.5 lg:hidden mb-8">
            <MerchivaLogo size={24} fg="#1c1917" />
            <span className="text-[14px] font-semibold tracking-tight text-stone-900">
              Merchiva
            </span>
          </div>
          <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
            <h1 className="text-[22px] font-semibold tracking-tight text-stone-900 mb-1">
              Verify your email
            </h1>
            <p className="text-[13px] text-stone-500 mb-7">
              Enter the code sent to <span className="font-medium text-stone-700">{email}</span>
            </p>
            <form onSubmit={handleEmailVerify} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="verify-code" className="text-[10.5px] font-semibold text-stone-600 uppercase tracking-wider">
                  Verification code
                </Label>
                <div className="flex items-center h-[34px] rounded border border-stone-200 px-2.5 gap-2 focus-within:border-stone-400 focus-within:ring-3 focus-within:ring-stone-200/60">
                  <Input
                    id="verify-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    autoFocus
                    placeholder="000000"
                    className="h-auto border-0 rounded-none bg-transparent p-0 text-[13px] text-stone-900 placeholder:text-stone-300 shadow-none focus-visible:ring-0 focus-visible:border-transparent font-mono text-center tracking-[0.3em]"
                  />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="h-[38px] w-full rounded bg-stone-900 text-white text-[13px] font-medium gap-2 hover:bg-stone-800">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Verify <ArrowRight className="h-3.5 w-3.5" /></>}
              </Button>
            </form>
            <Button type="button" variant="ghost" onClick={() => { setNeedsVerification(false); setError(""); setCode(""); }} className="mt-4 h-auto p-0 text-[12px] text-stone-400 hover:text-stone-600 hover:bg-transparent gap-1.5 font-normal self-start">
              <ArrowLeft className="h-3 w-3" /> Back to sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── 2FA screen ─────────────────────────────────── */

  if (needs2FA) {
    return (
      <div className="flex h-screen w-full overflow-hidden">
        <BrandPanel />
        <div className="w-full lg:w-[480px] shrink-0 h-full bg-white flex flex-col p-7 lg:p-10">
          <div className="flex items-center gap-2.5 lg:hidden mb-8">
            <MerchivaLogo size={24} fg="#1c1917" />
            <span className="text-[14px] font-semibold tracking-tight text-stone-900">
              Merchiva
            </span>
          </div>

          <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
            <h1 className="text-[22px] font-semibold tracking-tight text-stone-900 mb-1">
              Two-factor authentication
            </h1>
            <p className="text-[13px] text-stone-500 mb-7">
              Enter the code from your authenticator app
            </p>

            <form onSubmit={handle2FA} className="space-y-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="2fa-code"
                  className="text-[10.5px] font-semibold text-stone-600 uppercase tracking-wider"
                >
                  Verification code
                </Label>
                <div className="flex items-center h-[34px] rounded border border-stone-200 px-2.5 gap-2 focus-within:border-stone-400 focus-within:ring-3 focus-within:ring-stone-200/60">
                  <ShieldCheck className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                  <Input
                    id="2fa-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    autoFocus
                    placeholder="000000"
                    className="h-auto border-0 rounded-none bg-transparent p-0 text-[13px] text-stone-900 placeholder:text-stone-300 shadow-none focus-visible:ring-0 focus-visible:border-transparent font-mono text-center tracking-[0.3em]"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="h-[38px] w-full rounded bg-stone-900 text-white text-[13px] font-medium gap-2 hover:bg-stone-800"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Verify
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </form>

            <Button
              type="button"
              variant="ghost"
              onClick={() => { setNeeds2FA(false); setError(""); setCode(""); }}
              className="mt-4 h-auto p-0 text-[12px] text-stone-400 hover:text-stone-600 hover:bg-transparent gap-1.5 font-normal self-start"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to sign in
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Password screen ────────────────────────────── */

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <BrandPanel />

      {/* Form panel */}
      <div className="w-full lg:w-[480px] shrink-0 h-full bg-white flex flex-col p-7 lg:p-10">
        {/* Mobile logo */}
        <div className="flex items-center gap-2.5 lg:hidden mb-8">
          <MerchivaLogo size={24} fg="#1c1917" />
          <span className="text-[14px] font-semibold tracking-tight text-stone-900">
            Merchiva
          </span>
        </div>

        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
          <h1 className="text-[22px] font-semibold tracking-tight text-stone-900 mb-1">
            Sign in to Merchiva
          </h1>
          <p className="text-[13px] text-stone-500 mb-7">
            Enter your credentials to continue
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-[10.5px] font-semibold text-stone-600 uppercase tracking-wider"
              >
                Email
              </Label>
              <div className="flex items-center h-[34px] rounded border border-stone-200 px-2.5 gap-2 focus-within:border-stone-400 focus-within:ring-3 focus-within:ring-stone-200/60">
                <Mail className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="you@company.com"
                  className="h-auto border-0 rounded-none bg-transparent p-0 text-[13px] text-stone-900 placeholder:text-stone-300 shadow-none focus-visible:ring-0 focus-visible:border-transparent"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="password"
                  className="text-[10.5px] font-semibold text-stone-600 uppercase tracking-wider"
                >
                  Password
                </Label>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-[11px] font-medium text-stone-500 hover:text-stone-900 no-underline hover:no-underline"
                >
                  Forgot?
                </Button>
              </div>
              <div className="flex items-center h-[34px] rounded border border-stone-200 px-2.5 gap-2 focus-within:border-stone-400 focus-within:ring-3 focus-within:ring-stone-200/60">
                <Lock className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="h-auto border-0 rounded-none bg-transparent p-0 text-[13px] text-stone-900 placeholder:text-stone-300 shadow-none focus-visible:ring-0 focus-visible:border-transparent"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-stone-400 hover:text-stone-600 hover:bg-transparent shrink-0"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>

            {/* Keep signed in */}
            <Label className="flex items-center gap-2 cursor-pointer select-none font-normal">
              <Checkbox
                checked={keepSignedIn}
                onCheckedChange={(v) => setKeepSignedIn(v === true)}
                className="h-3.5 w-3.5"
              />
              <span className="text-[12px] text-stone-500">
                Keep me signed in for 30 days
              </span>
            </Label>

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="h-[38px] w-full rounded bg-stone-900 text-white text-[13px] font-medium gap-2 hover:bg-stone-800"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-stone-200" />
            <span className="text-[10px] uppercase tracking-wider text-stone-400 font-medium">
              or continue with
            </span>
            <div className="flex-1 h-px bg-stone-200" />
          </div>

          {/* OAuth buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuth("google")}
              className="h-[34px] rounded border-stone-200 bg-white text-stone-900 text-[13px] font-medium hover:bg-stone-50 gap-2"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Google
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuth("apple")}
              className="h-[34px] rounded border-stone-200 bg-white text-stone-900 text-[13px] font-medium hover:bg-stone-50 gap-2"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              Apple
            </Button>
          </div>

          {/* Footer */}
          <div className="mt-7 space-y-3 text-center">
            <p className="text-[12.5px] text-stone-500">
              No account?{" "}
              <Link
                href={`/signup${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`}
                className="font-medium text-stone-900 hover:underline underline-offset-4"
              >
                Register a workspace
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
