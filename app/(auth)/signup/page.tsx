"use client";

import { useState, useEffect } from "react";
import { Zap, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "react-oidc-context";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import Link from "next/link";

export default function SignupPage() {
  const auth = useAuth();
  const [showSheet, setShowSheet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
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
        window.location.href = "/dashboard";
      }
    }, 500);
    return () => clearInterval(interval);
  }, [showSheet]);

  const handleSignup = async () => {
    hapticLight();
    setLoading(true);

    if (isMobile) {
      const authority =
        process.env.NEXT_PUBLIC_SPACETIMEAUTH_AUTHORITY || "https://auth.spacetimedb.com/oidc";
      const clientId =
        process.env.NEXT_PUBLIC_SPACETIMEAUTH_CLIENT_ID || "client_032wKpr8lE6TZ7Kik2g0VE";
      const redirectUri = window.location.origin + "/auth/callback";
      const url =
        `${authority}/auth?response_type=code&client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid+profile+email&screen_hint=signup`;
      setAuthUrl(url);
      setShowSheet(true);
      setLoading(false);
    } else {
      try {
        const user = await auth.signinPopup({
          extraQueryParams: { screen_hint: "signup" },
        });
        if (user?.id_token) {
          localStorage.setItem("stdb_token", user.id_token);
        }
        hapticSuccess();
        window.location.href = "/dashboard";
      } catch {
        try {
          await auth.signinRedirect({
            extraQueryParams: { screen_hint: "signup" },
          });
        } catch {
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
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-muted-foreground text-sm mt-1">Get started with BizOps</p>
        </div>

        <Button onClick={handleSignup} disabled={loading} className="w-full h-11">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
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
