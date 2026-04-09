"use client";

import { useState } from "react";
import { Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "react-oidc-context";
import { hapticSuccess, hapticLight } from "@/lib/haptics";
import Link from "next/link";

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignin = async () => {
    setLoading(true);
    setError(null);
    hapticLight();
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
          <Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
