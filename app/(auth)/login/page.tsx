"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { safeNextPath } from "@/lib/auth/safe-next";
import { Mail, Lock, Eye, EyeOff, ArrowRight, ArrowLeft, ShieldCheck, Sparkles, Fingerprint } from "lucide-react";
import { MerchivaLogo } from "@/components/logo";
import { BrandPanel } from "@/components/brand-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/lib/i18n/context";
import { useAuth, addAccountToStorage } from "@/lib/auth/context";
import { apiUrl } from "@/lib/api-client";
import { isCapacitorNative } from "@/lib/capacitor";
import {
  openCapacitorAuth,
  subscribeCapacitorAuthCallback,
} from "@/lib/capacitor-auth";
import { getNativeShell, isNativeShell, type AuthCallbackParams } from "@/lib/native-shell";
import { Spinner } from "@/components/ui/loaders/geometric";

function LoginForm() {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const isAddAccount = searchParams.get("addAccount") === "1";
  const { isLoaded, isSignedIn, signIn, getToken } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || isAddAccount) return;
    let cancelled = false;
    getToken()
      .then((token) => {
        if (!cancelled && token) {
          router.replace(next);
        }
      })
      // A rejected token read leaves the user on the form, which is the same
      // as no token — but without this it is also an unhandled rejection.
      .catch((err: unknown) => console.error("[login] token read failed", err));
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, isAddAccount, router, next, getToken]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // 2FA state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [code, setCode] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [challengeId, setChallengeId] = useState("");

  // Email verification state (in case user signs in with unverified email)
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");

  // Magic auth state (passwordless email code)
  const [magicMode, setMagicMode] = useState(false);
  const [magicCodeSent, setMagicCodeSent] = useState(false);
  const [magicCode, setMagicCode] = useState("");

  const completeNativeAuth = useCallback((params: AuthCallbackParams) => {
    if (params.error) {
      setError(params.error);
      return;
    }
    const { access_token, refresh_token, user, redirect_to } = params;
    if (!access_token || !refresh_token || !user) {
      setError(t("login.oauthFailed"));
      return;
    }
    try {
      const parsedUser = JSON.parse(user);
      addAccountToStorage(access_token, refresh_token, parsedUser);
      window.location.href = safeNextPath(redirect_to);
    } catch {
      setError(t("login.oauthFailed"));
    }
  }, [t]);

  // Native 3rd-party OAuth: the external/in-app browser hits our API and we
  // redirect to merchiva://auth-callback. The native shell forwards the params
  // here so we can complete sign-in like the web /auth-callback page.
  useEffect(() => {
    const bridge = getNativeShell();
    if (!bridge) return;
    const unsubscribe = bridge.onAuthCallback(completeNativeAuth);
    return unsubscribe;
  }, [completeNativeAuth]);

  useEffect(() => {
    return subscribeCapacitorAuthCallback(completeNativeAuth);
  }, [completeNativeAuth]);

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
        setError(data.error ?? t("login.authFailed"));
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
        setError(data.error ?? t("login.invalidCode"));
        setLoading(false);
        return;
      }

      signIn(data.accessToken, data.refreshToken, data.user);
      router.push(next);
    } catch {
      setError(t("login.invalidCode"));
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
        setError(data.error ?? t("login.verificationFailed"));
        setLoading(false);
        return;
      }

      signIn(data.accessToken, data.refreshToken, data.user);
      router.push(next);
    } catch {
      setError(t("login.verificationFailed") + ". " + t("login.genericError"));
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    try {
      const desktopNative = isNativeShell();
      const capacitorNative = isCapacitorNative();
      const res = await fetch(apiUrl("/api/auth/oauth"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Native clients tell the callback to bounce back via the
        // merchiva:// custom protocol instead of staying inside the web app.
        body: JSON.stringify({
          provider,
          redirectTo: next,
          client: capacitorNative ? "capacitor" : desktopNative ? "electron" : "web",
        }),
      });
      const data = await res.json();
      if (!data.url) {
        setError(data.error ?? t("login.oauthFailed"));
        return;
      }
      if (desktopNative) {
        // Open the provider's auth page in the user's system browser; Google
        // and Apple reject embedded webviews. The result comes back via IPC.
        await getNativeShell()?.openExternalAuth(data.url);
      } else if (capacitorNative) {
        await openCapacitorAuth(data.url);
      } else {
        window.location.href = data.url;
      }
    } catch {
      setError(t("login.oauthFailed"));
    }
  };

  const handlePasskey = async () => {
    setError("");
    try {
      const desktopNative = isNativeShell();
      const capacitorNative = isCapacitorNative();
      const res = await fetch(apiUrl("/api/auth/oauth"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "passkey",
          redirectTo: next,
          client: capacitorNative ? "capacitor" : desktopNative ? "electron" : "web",
          ...(email ? { loginHint: email } : {}),
          screenHint: "sign-in",
        }),
      });
      const data = await res.json();
      if (!data.url) {
        setError(data.error ?? t("login.passkeyFailed"));
        return;
      }
      if (desktopNative) {
        await getNativeShell()?.openExternalAuth(data.url);
      } else if (capacitorNative) {
        await openCapacitorAuth(data.url);
      } else {
        window.location.href = data.url;
      }
    } catch {
      setError(t("login.passkeyFailed"));
    }
  };

  const handleSendMagicCode = async () => {
    setError("");
    if (!email) {
      setError(t("login.enterEmailFirst"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/magic-auth/send"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("login.magicSendFailed"));
        setLoading(false);
        return;
      }
      setMagicCodeSent(true);
      setLoading(false);
    } catch {
      setError(t("login.magicSendFailed"));
      setLoading(false);
    }
  };

  const handleVerifyMagicCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/magic-auth/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: magicCode }),
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
        setError(data.error ?? t("login.invalidCode"));
        setLoading(false);
        return;
      }

      signIn(data.accessToken, data.refreshToken, data.user);
      router.push(next);
    } catch {
      setError(t("login.invalidCode"));
      setLoading(false);
    }
  };

  /* ── Email verification screen ──────────────────── */

  if (needsVerification) {
    return (
      <div className="flex h-screen w-full overflow-hidden">
        <BrandPanel />
        <div className="w-full lg:w-[480px] shrink-0 h-full bg-background flex flex-col p-7 lg:p-10">
          <div className="flex items-center justify-between gap-2.5 mb-8">
            <div className="flex items-center gap-2.5 lg:hidden">
              <MerchivaLogo size={24} className="text-foreground" />
              <span className="text-[14px] font-semibold tracking-tight text-foreground">
                Merchiva
              </span>
            </div>
            <div className="hidden lg:block" />
            <LanguageSwitcher variant="inline" />
          </div>
          <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground mb-1">
              {t("login.verifyTitle")}
            </h1>
            <p className="text-[13px] text-muted-foreground mb-7">
              {t("login.verifySubtitle")} <span className="font-medium text-foreground">{email}</span>
            </p>
            <form onSubmit={handleEmailVerify} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="verify-code" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("login.verificationCode")}
                </Label>
                <div className="flex items-center h-11 rounded border border-border px-3 gap-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
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
                    className="h-auto border-0 rounded-none bg-transparent p-0 text-[16px] text-foreground placeholder:text-muted-foreground/50 shadow-none focus-visible:ring-0 focus-visible:border-transparent font-mono text-center tracking-[0.3em]"
                  />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="h-11 w-full rounded bg-primary text-primary-foreground text-[14px] font-medium gap-2 hover:bg-primary/90">
                {loading ? <Spinner size={16} /> : <>{t("login.verify")} <ArrowRight className="h-4 w-4" /></>}
              </Button>
            </form>
            <Button type="button" variant="ghost" onClick={() => { setNeedsVerification(false); setError(""); setCode(""); }} className="mt-4 h-auto p-0 text-[12px] text-muted-foreground/70 hover:text-foreground hover:bg-transparent gap-1.5 font-normal self-start">
              <ArrowLeft className="h-3 w-3" /> {t("login.backToSignIn")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Magic Auth code entry screen ───────────────── */

  if (magicMode && magicCodeSent) {
    return (
      <div className="flex h-screen w-full overflow-hidden">
        <BrandPanel />
        <div className="w-full lg:w-[480px] shrink-0 h-full bg-background flex flex-col p-7 lg:p-10">
          <div className="flex items-center justify-between gap-2.5 mb-8">
            <div className="flex items-center gap-2.5 lg:hidden">
              <MerchivaLogo size={24} className="text-foreground" />
              <span className="text-[14px] font-semibold tracking-tight text-foreground">
                Merchiva
              </span>
            </div>
            <div className="hidden lg:block" />
            <LanguageSwitcher variant="inline" />
          </div>
          <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground mb-1">
              {t("login.magicCodeTitle")}
            </h1>
            <p className="text-[13px] text-muted-foreground mb-7">
              {t("login.magicCodeSubtitle")} <span className="font-medium text-foreground">{email}</span>
            </p>
            <form onSubmit={handleVerifyMagicCode} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="magic-code" className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("login.verificationCode")}
                </Label>
                <div className="flex items-center h-11 rounded border border-border px-3 gap-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
                  <Sparkles className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                  <Input
                    id="magic-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={magicCode}
                    onChange={(e) => setMagicCode(e.target.value)}
                    required
                    autoFocus
                    placeholder="000000"
                    className="h-auto border-0 rounded-none bg-transparent p-0 text-[16px] text-foreground placeholder:text-muted-foreground/50 shadow-none focus-visible:ring-0 focus-visible:border-transparent font-mono text-center tracking-[0.3em]"
                  />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="h-11 w-full rounded bg-primary text-primary-foreground text-[14px] font-medium gap-2 hover:bg-primary/90">
                {loading ? <Spinner size={16} /> : <>{t("common.signIn")} <ArrowRight className="h-4 w-4" /></>}
              </Button>
              <Button type="button" variant="ghost" onClick={handleSendMagicCode} disabled={loading} className="h-auto p-0 text-[12px] text-muted-foreground hover:text-foreground hover:bg-transparent font-normal">
                {t("login.resendCode")}
              </Button>
            </form>
            <Button type="button" variant="ghost" onClick={() => { setMagicMode(false); setMagicCodeSent(false); setMagicCode(""); setError(""); }} className="mt-4 h-auto p-0 text-[12px] text-muted-foreground/70 hover:text-foreground hover:bg-transparent gap-1.5 font-normal self-start">
              <ArrowLeft className="h-3 w-3" /> {t("login.backToSignIn")}
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
        <div className="w-full lg:w-[480px] shrink-0 h-full bg-background flex flex-col p-7 lg:p-10">
          <div className="flex items-center justify-between gap-2.5 mb-8">
            <div className="flex items-center gap-2.5 lg:hidden">
              <MerchivaLogo size={24} className="text-foreground" />
              <span className="text-[14px] font-semibold tracking-tight text-foreground">
                Merchiva
              </span>
            </div>
            <div className="hidden lg:block" />
            <LanguageSwitcher variant="inline" />
          </div>

          <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground mb-1">
              {t("login.twoFactorTitle")}
            </h1>
            <p className="text-[13px] text-muted-foreground mb-7">
              {t("login.twoFactorSubtitle")}
            </p>

            <form onSubmit={handle2FA} className="space-y-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="2fa-code"
                  className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  {t("login.verificationCode")}
                </Label>
                <div className="flex items-center h-11 rounded border border-border px-3 gap-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground/70 shrink-0" />
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
                    className="h-auto border-0 rounded-none bg-transparent p-0 text-[16px] text-foreground placeholder:text-muted-foreground/50 shadow-none focus-visible:ring-0 focus-visible:border-transparent font-mono text-center tracking-[0.3em]"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full rounded bg-primary text-primary-foreground text-[14px] font-medium gap-2 hover:bg-primary/90"
              >
                {loading ? (
                  <Spinner size={16} />
                ) : (
                  <>
                    {t("login.verify")}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <Button
              type="button"
              variant="ghost"
              onClick={() => { setNeeds2FA(false); setError(""); setCode(""); }}
              className="mt-4 h-auto p-0 text-[12px] text-muted-foreground/70 hover:text-foreground hover:bg-transparent gap-1.5 font-normal self-start"
            >
              <ArrowLeft className="h-3 w-3" />
              {t("login.backToSignIn")}
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
      <div className="w-full lg:w-[480px] shrink-0 h-full bg-background flex flex-col p-7 lg:p-10">
        {/* Top bar: logo (mobile) + language switcher */}
        <div className="flex items-center justify-between gap-2.5 mb-8">
          <div className="flex items-center gap-2.5 lg:hidden">
            <MerchivaLogo size={24} className="text-foreground" />
            <span className="text-[14px] font-semibold tracking-tight text-foreground">
              Merchiva
            </span>
          </div>
          <div className="hidden lg:block" />
          <LanguageSwitcher variant="inline" />
        </div>

        <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground mb-1">
            {isAddAccount ? t("login.addAccountTitle") : t("login.title")}
          </h1>
          <p className="text-[13px] text-muted-foreground mb-7">
            {isAddAccount ? t("login.addAccountSubtitle") : t("login.subtitle")}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <Label
                htmlFor="email"
                className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
              >
                {t("common.email")}
              </Label>
              <div className="flex items-center h-11 rounded border border-border px-3 gap-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
                <Mail className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder={t("login.emailPlaceholder")}
                  className="h-auto border-0 rounded-none bg-transparent p-0 text-[15px] text-foreground placeholder:text-muted-foreground/50 shadow-none focus-visible:ring-0 focus-visible:border-transparent"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="password"
                  className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  {t("common.password")}
                </Label>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-[11px] font-medium text-muted-foreground hover:text-foreground no-underline hover:no-underline"
                >
                  {t("login.forgot")}
                </Button>
              </div>
              <div className="flex items-center h-11 rounded border border-border px-3 gap-2 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
                <Lock className="h-4 w-4 text-muted-foreground/70 shrink-0" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder={t("login.passwordPlaceholder")}
                  className="h-auto border-0 rounded-none bg-transparent p-0 text-[15px] text-foreground placeholder:text-muted-foreground/50 shadow-none focus-visible:ring-0 focus-visible:border-transparent"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-muted-foreground/70 hover:text-foreground hover:bg-transparent shrink-0"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded bg-primary text-primary-foreground text-[14px] font-medium gap-2 hover:bg-primary/90"
            >
              {loading ? (
                <Spinner size={16} />
              ) : (
                <>
                  {t("common.signIn")}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium">
              {t("login.continueWith")}
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* OAuth buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuth("google")}
              className="h-11 rounded border-border bg-background text-foreground text-[14px] font-medium hover:bg-accent gap-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
              Google
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOAuth("apple")}
              className="h-11 rounded border-border bg-background text-foreground text-[14px] font-medium hover:bg-accent gap-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              Apple
            </Button>
          </div>

          {/* Passkey + Magic auth */}
          <div className="grid grid-cols-2 gap-2.5 mt-2.5">
            <Button
              type="button"
              variant="outline"
              onClick={handlePasskey}
              className="h-11 rounded border-border bg-background text-foreground text-[14px] font-medium hover:bg-accent gap-2"
            >
              <Fingerprint className="h-4 w-4" />
              {t("login.passkey")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => { setMagicMode(true); setError(""); handleSendMagicCode(); }}
              disabled={loading}
              className="h-11 rounded border-border bg-background text-foreground text-[14px] font-medium hover:bg-accent gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {t("login.emailCode")}
            </Button>
          </div>

          {/* Footer */}
          <div className="mt-7 space-y-3 text-center">
            <p className="text-[12.5px] text-muted-foreground">
              {t("login.noAccount")}{" "}
              <Link
                href={`/signup${next !== "/choose" ? `?next=${encodeURIComponent(next)}` : ""}`}
                className="font-medium text-foreground hover:underline underline-offset-4"
              >
                {t("login.register")}
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
