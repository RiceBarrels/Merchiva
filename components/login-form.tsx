"use client";

import { useState, useEffect } from "react";
import { Zap, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "react-oidc-context";
import { hapticSuccess, hapticLight } from "@/lib/haptics";
export function LoginForm({ onSuccess, onSignup }: { onSuccess?: () => void; onSignup?: () => void }) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [authUrl, setAuthUrl] = useState("");

  useEffect(() => {
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    setIsMobile(isTouch);
  }, []);

  // Poll localStorage for token after sheet opens
  useEffect(() => {
    if (!showSheet) return;
    const interval = setInterval(() => {
      const token = localStorage.getItem("stdb_token");
      if (token) {
        clearInterval(interval);
        setShowSheet(false);
        hapticSuccess();
        onSuccess?.();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [showSheet, onSuccess]);

  const handleSignin = async () => {
    setLoading(true);
    setError(null);
    hapticLight();

    if (isMobile) {
      const authority =
        process.env.NEXT_PUBLIC_SPACETIMEAUTH_AUTHORITY || "https://auth.spacetimedb.com/oidc";
      const clientId =
        process.env.NEXT_PUBLIC_SPACETIMEAUTH_CLIENT_ID || "client_032wKpr8lE6TZ7Kik2g0VE";
      const redirectUri = window.location.origin + "/auth/callback";
      const hint = email.trim();
      const url =
        `${authority}/auth?response_type=code&client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid+profile+email` +
        (hint ? `&login_hint=${encodeURIComponent(hint)}` : "");
      setAuthUrl(url);
      setShowSheet(true);
      setLoading(false);
    } else {
      try {
        const user = await auth.signinPopup({
          extraQueryParams: email.trim() ? { login_hint: email.trim() } : {},
        });
        if (user?.id_token) {
          localStorage.setItem("stdb_token", user.id_token);
        }
        hapticSuccess();
        onSuccess?.();
      } catch {
        try {
          await auth.signinRedirect({
            extraQueryParams: email.trim() ? { login_hint: email.trim() } : {},
          });
        } catch (err) {
          setError("Failed to connect. Please try again.");
          setLoading(false);
        }
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 bg-background">
      <div className="mx-auto w-full max-w-sm space-y-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-stone-900 text-white">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <p className="font-bold text-lg">BizOps</p>
            <p className="text-xs text-muted-foreground">AI Business Manager</p>
          </div>
        </div>

        <div>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-muted-foreground text-sm mt-1">Sign in to continue</p>
        </div>

        <div className="space-y-4">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="h-12 text-base"
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSignin()}
          />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button onClick={handleSignin} disabled={loading} className="w-full h-11">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </Button>
        </div>

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
            <a href="/signup" className="font-medium text-foreground underline underline-offset-4">
              Create one
            </a>
          )}
        </p>
      </div>

      {/* Mobile bottom sheet with iframe */}
      {showSheet && (
        <div className="fixed inset-0 z-50 flex flex-col">
          {/* Backdrop */}
          <div
            className="flex-none h-16 bg-black/20"
            onClick={() => setShowSheet(false)}
          />
          {/* Sheet */}
          <div className="flex-1 bg-background rounded-t-xl overflow-hidden flex flex-col animate-slideUp">
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <p className="text-sm font-medium">Sign in</p>
              <button onClick={() => setShowSheet(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <iframe
              src={authUrl}
              className="flex-1 w-full border-0"
              allow="publickey-credentials-get"
            />
          </div>
        </div>
      )}
    </div>
  );
}
