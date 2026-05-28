"use client";

import { Suspense, useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, ArrowRight, ArrowLeft } from "lucide-react";
import { MerchivaLogo } from "@/components/logo";
import { BrandPanel } from "@/components/brand-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/lib/i18n/context";
import { useAuth, addAccountToStorage } from "@/lib/auth/context";
import { apiUrl } from "@/lib/api-client";
import { getNativeShell, isNativeShell } from "@/lib/native-shell";
import { Spinner } from "@/components/ui/loaders/geometric";

/* ── Password strength ─────────────────────────────── */

type StrengthKey = "" | "strengthWeak" | "strengthFair" | "strengthStrong" | "strengthExcellent";

function getPasswordStrength(pw: string): { score: number; key: StrengthKey } {
  if (!pw) return { score: 0, key: "" };
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { score: 1, key: "strengthWeak" };
  if (s === 2) return { score: 2, key: "strengthFair" };
  if (s === 3) return { score: 3, key: "strengthStrong" };
  return { score: 4, key: "strengthExcellent" };
}

const strengthColors: Record<number, string> = {
  0: "bg-stone-100 dark:bg-stone-800",
  1: "bg-stone-400",
  2: "bg-amber-600",
  3: "bg-emerald-600",
  4: "bg-emerald-600",
};

/* ── Signup form ───────────────────────────────────── */

function SignupForm() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/~/dashboard";
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [pendingToken, setPendingToken] = useState("");

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const strengthLabel = strength.key ? t(`signup.${strength.key}`) : "";

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/sign-up"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t("signup.registrationFailed"));
        setLoading(false);
        return;
      }

      if (data.pendingVerification) {
        setPendingToken(data.pendingAuthenticationToken);
        setVerifying(true);
        setLoading(false);
        return;
      }

      // No verification needed — directly authenticated
      signIn(data.accessToken, data.refreshToken, data.user);
      router.push(next);
    } catch {
      setError(t("login.genericError"));
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/verify-email"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          pendingAuthenticationToken: pendingToken,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t("login.verificationFailed"));
        setLoading(false);
        return;
      }

      signIn(data.accessToken, data.refreshToken, data.user);
      router.push(next);
    } catch {
      setError(t("login.genericError"));
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    try {
      const native = isNativeShell();
      const res = await fetch(apiUrl("/api/auth/oauth"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          redirectTo: next,
          client: native ? "electron" : "web",
        }),
      });
      const data = await res.json();
      if (!data.url) {
        setError(data.error ?? t("login.oauthFailed"));
        return;
      }
      if (native) {
        await getNativeShell()?.openExternalAuth(data.url);
      } else {
        window.location.href = data.url;
      }
    } catch {
      setError(t("login.oauthFailed"));
    }
  };

  // Receive the merchiva:// callback from the Electron main process and
  // complete the sign-in flow client-side, same as the web /auth-callback.
  useEffect(() => {
    const bridge = getNativeShell();
    if (!bridge) return;
    const unsubscribe = bridge.onAuthCallback((params) => {
      if (params.error) { setError(params.error); return; }
      const { access_token, refresh_token, user, redirect_to } = params;
      if (!access_token || !refresh_token || !user) {
        setError(t("login.oauthFailed"));
        return;
      }
      try {
        const parsedUser = JSON.parse(user);
        addAccountToStorage(access_token, refresh_token, parsedUser);
        window.location.href = redirect_to || "/~/dashboard";
      } catch {
        setError(t("login.oauthFailed"));
      }
    });
    return unsubscribe;
  }, [t]);

  const loginHref = `/login${next !== "/~/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`;

  /* ── Verify screen ──────────────────────────────── */

  if (verifying) {
    return (
      <div className="flex h-screen w-full overflow-hidden bg-white dark:bg-stone-900">
        <BrandPanel />

        <div className="w-full lg:w-[480px] shrink-0 h-full bg-white dark:bg-stone-900 flex flex-col p-7 lg:p-10">
          {/* Top bar */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 lg:hidden">
              <MerchivaLogo size={20} fg="#292524" />
              <span className="text-[13px] font-semibold text-stone-800 dark:text-stone-200 tracking-tight">
                Merchiva
              </span>
            </div>
            <div className="hidden lg:block" />
            <div className="flex items-center gap-3">
              <LanguageSwitcher variant="inline" />
              <Link
                href={loginHref}
                className="text-[12px] font-medium text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:text-stone-200 transition-colors"
              >
                {t("common.signIn")}
              </Link>
            </div>
          </div>

          {/* Center content */}
          <div className="flex-1 flex flex-col justify-center max-w-[340px] w-full mx-auto">
            <h1 className="text-[22px] font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
              {t("signup.verifyTitle")}
            </h1>
            <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1.5 mb-7">
              {t("signup.verifySubtitle")}{" "}
              <span className="font-medium text-stone-700 dark:text-stone-300">{email}</span>
            </p>

            <form onSubmit={handleVerify} className="space-y-5">
              {/* Code field */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="code"
                  className="text-[11px] font-semibold text-stone-600 dark:text-stone-300 uppercase tracking-wider"
                >
                  {t("signup.code")}
                </Label>
                <div className="flex items-center h-11 rounded border border-stone-200 dark:border-stone-700 px-3 gap-2 focus-within:border-stone-400 focus-within:ring-3 focus-within:ring-stone-200/60">
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    autoFocus
                    placeholder="000000"
                    className="h-auto border-0 rounded-none bg-transparent p-0 text-[16px] text-stone-900 dark:text-stone-100 placeholder:text-stone-300 dark:text-stone-700 shadow-none focus-visible:ring-0 focus-visible:border-transparent font-mono text-center tracking-[0.3em]"
                  />
                </div>
              </div>

              {error && (
                <p className="text-[12px] text-red-600">{error}</p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded bg-stone-900 text-white text-[14px] font-medium gap-2 hover:bg-stone-800"
              >
                {loading ? (
                  <Spinner size={16} />
                ) : (
                  <>
                    {t("signup.verifyAndContinue")}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* Bottom */}
          <div className="flex items-center justify-between text-[12px] text-stone-400 dark:text-stone-500">
            <Button
              type="button"
              variant="ghost"
              onClick={() => { setVerifying(false); setError(""); setCode(""); }}
              className="h-auto p-0 text-[12px] text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:text-stone-300 hover:bg-transparent gap-1.5 font-normal"
            >
              <ArrowLeft className="h-3 w-3" />
              {t("signup.useDifferentMethod")}
            </Button>
            <span className="font-mono text-[11px]">{t("signup.step")} 2 / 2</span>
          </div>
        </div>
      </div>
    );
  }

  /* ── Register screen ────────────────────────────── */

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white dark:bg-stone-900">
      <BrandPanel />

      <div className="w-full lg:w-[480px] shrink-0 h-full bg-white dark:bg-stone-900 flex flex-col p-7 lg:p-10">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 lg:hidden">
            <MerchivaLogo size={20} fg="#292524" />
            <span className="text-[13px] font-semibold text-stone-800 dark:text-stone-200 tracking-tight">
              Merchiva
            </span>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="inline" />
            <Link
              href={loginHref}
              className="text-[12px] font-medium text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:text-stone-200 transition-colors"
            >
              {t("common.signIn")}
            </Link>
          </div>
        </div>

        {/* Center content */}
        <div className="flex-1 flex flex-col justify-center max-w-[340px] w-full mx-auto">
          <h1 className="text-[22px] font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
            {t("signup.title")}
          </h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1.5 mb-7">
            {t("signup.subtitle")}
          </p>

          <form onSubmit={handleSignUp} className="space-y-5">
            {/* Email */}
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-[11px] font-semibold text-stone-600 dark:text-stone-300 uppercase tracking-wider"
              >
                {t("common.email")}
              </Label>
              <div className="flex items-center h-11 rounded border border-stone-200 dark:border-stone-700 px-3 gap-2 focus-within:border-stone-400 focus-within:ring-3 focus-within:ring-stone-200/60">
                <Mail className="h-4 w-4 text-stone-400 dark:text-stone-500 shrink-0" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder={t("signup.emailPlaceholder")}
                  className="h-auto border-0 rounded-none bg-transparent p-0 text-[15px] text-stone-900 dark:text-stone-100 placeholder:text-stone-300 dark:text-stone-700 shadow-none focus-visible:ring-0 focus-visible:border-transparent"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="password"
                  className="text-[11px] font-semibold text-stone-600 dark:text-stone-300 uppercase tracking-wider"
                >
                  {t("common.password")}
                </Label>
                {strengthLabel && (
                  <span
                    className="font-mono text-[11px]"
                    style={{
                      color:
                        strength.score <= 1
                          ? "#78716c"
                          : strength.score === 2
                          ? "#d97706"
                          : "#059669",
                    }}
                  >
                    {strengthLabel}
                  </span>
                )}
              </div>
              <div className="flex items-center h-11 rounded border border-stone-200 dark:border-stone-700 px-3 gap-2 focus-within:border-stone-400 focus-within:ring-3 focus-within:ring-stone-200/60">
                <Lock className="h-4 w-4 text-stone-400 dark:text-stone-500 shrink-0" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder={t("signup.passwordPlaceholder")}
                  className="h-auto border-0 rounded-none bg-transparent p-0 text-[15px] text-stone-900 dark:text-stone-100 placeholder:text-stone-300 dark:text-stone-700 shadow-none focus-visible:ring-0 focus-visible:border-transparent"
                />
              </div>
              {/* Strength meter */}
              <div className="flex gap-1 pt-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`flex-1 h-[3px] rounded-sm transition-colors ${
                      i <= strength.score
                        ? strengthColors[strength.score]
                        : "bg-stone-100 dark:bg-stone-800"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Terms checkbox */}
            <Label className="flex items-start gap-2.5 cursor-pointer select-none font-normal">
              <Checkbox
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
                className="mt-0.5 h-3.5 w-3.5"
              />
              <span className="text-[12px] text-stone-500 dark:text-stone-400 leading-relaxed">
                {t("signup.agreePrefix")}{" "}
                <a href="#" className="text-stone-700 dark:text-stone-300 underline underline-offset-2">
                  {t("signup.terms")}
                </a>{" "}
                {t("signup.and")}{" "}
                <a href="#" className="text-stone-700 dark:text-stone-300 underline underline-offset-2">
                  {t("signup.privacy")}
                </a>
              </span>
            </Label>

            {error && (
              <p className="text-[12px] text-red-600">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading || !agreed}
              className="h-11 w-full rounded bg-stone-900 text-white text-[14px] font-medium gap-2 hover:bg-stone-800"
            >
              {loading ? (
                <Spinner size={16} />
              ) : (
                <>
                  {t("common.continue")}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {/* OAuth divider + buttons */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-stone-200 dark:bg-stone-700" />
            <span className="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500 font-medium">{t("signup.signUpWith")}</span>
            <div className="flex-1 h-px bg-stone-200 dark:bg-stone-700" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuth("google")}
              className="h-11 rounded border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-[14px] font-medium hover:bg-stone-50 dark:bg-stone-950 gap-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Google
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuth("apple")}
              className="h-11 rounded border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 text-[14px] font-medium hover:bg-stone-50 dark:bg-stone-950 gap-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              Apple
            </Button>
          </div>
        </div>

        {/* Bottom */}
        <div className="flex items-center justify-between text-[12px] text-stone-400 dark:text-stone-500">
          <span>
            {t("signup.hasAccount")}{" "}
            <Link
              href={loginHref}
              className="text-stone-700 dark:text-stone-300 font-medium hover:text-stone-900 dark:text-stone-100 transition-colors"
            >
              {t("common.signIn")}
            </Link>
          </span>
          <span className="font-mono text-[11px]">{t("signup.step")} 1 / 2</span>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
