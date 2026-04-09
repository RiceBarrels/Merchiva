"use client";

import { useState, useEffect } from "react";
import { Zap, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hapticSuccess, hapticLight } from "@/lib/haptics";
import { generatePKCE, savePKCE } from "@/lib/pkce";
import {
  SPACETIMEAUTH_AUTHORITY,
  SPACETIMEAUTH_CLIENT_ID,
  SPACETIMEAUTH_REDIRECT_URI,
} from "@/lib/spacetimedb/auth-config";

export function LoginForm({ onSuccess, onSignup }: { onSuccess?: () => void; onSignup?: () => void }) {
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

  // Poll localStorage for token after sheet opens (mobile)
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

  // Poll for token when new tab is opened (desktop)
  useEffect(() => {
    if (!loading || isMobile) return;
    const interval = setInterval(() => {
      const token = localStorage.getItem("stdb_token");
      if (token) {
        clearInterval(interval);
        setLoading(false);
        hapticSuccess();
        onSuccess?.();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [loading, isMobile, onSuccess]);

  const buildAuthUrl = async (hint?: string) => {
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
    });
    if (hint) params.set("login_hint", hint);

    return `${SPACETIMEAUTH_AUTHORITY}/auth?${params.toString()}`;
  };

  const handleSignin = async () => {
    setLoading(true);
    setError(null);
    hapticLight();

    try {
      const url = await buildAuthUrl(email.trim() || undefined);

      if (isMobile) {
        setAuthUrl(url);
        setShowSheet(true);
        setLoading(false);
      } else {
        // Open in new tab; poll localStorage for the token
        const newTab = window.open(url, "_blank");
        if (!newTab) {
          // Popup blocked — fall back to redirect
          window.location.href = url;
        }
        // loading stays true; polling effect above will clear it
      }
    } catch {
      setError("Failed to start sign in. Please try again.");
      setLoading(false);
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
