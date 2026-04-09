"use client";

import { useState, useEffect } from "react";
import { Zap, Loader2, X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { generatePKCE, savePKCE } from "@/lib/pkce";
import {
  SPACETIMEAUTH_AUTHORITY,
  SPACETIMEAUTH_CLIENT_ID,
  SPACETIMEAUTH_REDIRECT_URI,
} from "@/lib/spacetimedb/auth-config";

interface SignupFormProps {
  onSuccess?: () => void;
  onBack?: () => void;
}

export function SignupForm({ onSuccess, onBack }: SignupFormProps) {
  const [showSheet, setShowSheet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
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

  const handleSignup = async () => {
    hapticLight();
    setLoading(true);

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
      });
      const url = `${SPACETIMEAUTH_AUTHORITY}/auth?${params.toString()}`;

      if (isMobile) {
        setAuthUrl(url);
        setShowSheet(true);
        setLoading(false);
      } else {
        const newTab = window.open(url, "_blank");
        if (!newTab) {
          window.location.href = url;
        }
        // loading stays true; polling effect above will clear it
      }
    } catch {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 bg-background">
      <div className="mx-auto w-full max-w-sm space-y-8">
        {/* Back button (shown when embedded in slide layout) */}
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}

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
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-muted-foreground text-sm mt-1">Get started with BizOps</p>
        </div>

        <Button onClick={handleSignup} disabled={loading} className="w-full h-11">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          {onBack ? (
            <button
              onClick={onBack}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Sign in
            </button>
          ) : (
            <a href="/" className="font-medium text-foreground underline underline-offset-4">
              Sign in
            </a>
          )}
        </p>
      </div>

      {/* Mobile bottom sheet with iframe */}
      {showSheet && (
        <div className="fixed inset-0 z-50 flex flex-col">
          <div
            className="flex-none h-16 bg-black/20"
            onClick={() => setShowSheet(false)}
          />
          <div className="flex-1 bg-background rounded-t-xl overflow-hidden flex flex-col animate-slideUp">
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
              <p className="text-sm font-medium">Create account</p>
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
