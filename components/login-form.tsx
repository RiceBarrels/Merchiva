"use client";

import { useState, useEffect, useRef } from "react";
import { Zap, Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { hapticSuccess, hapticError } from "@/lib/haptics";

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [step, setStep] = useState<"email" | "password">("email");
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsMobile(window.innerWidth < 640);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // On mobile email step, advance to password
    if (isMobile && step === "email") {
      if (!email.trim()) return;
      setStep("password");
      setTimeout(() => passwordRef.current?.focus(), 100);
      return;
    }

    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      hapticError();
      if (error.message.toLowerCase().includes("email not confirmed")) {
        setError("Your email isn't verified yet. Please check your inbox for a verification code and complete sign-up.");
      } else {
        setError(error.message);
      }
      setLoading(false);
      return;
    }

    hapticSuccess();
    onSuccess?.();
  };

  // Mobile: one field at a time
  if (isMobile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="space-y-3 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-stone-900 text-white">
                <Zap className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="font-bold text-base leading-none">BizOps</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">AI Business Manager</p>
              </div>
            </div>
            <div>
              <CardTitle className="text-xl">Sign in</CardTitle>
              <CardDescription>
                {step === "email" ? "Enter your email to continue" : "Enter your password"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {step === "email" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { setStep("email"); setError(null); }}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors -mt-1"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    {email}
                  </button>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      ref={passwordRef}
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      autoFocus
                    />
                  </div>
                </>
              )}

              {error && (
                <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={loading || (step === "email" && !email.trim())}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : step === "email" ? (
                  <>
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Desktop: all fields at once
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-stone-900 text-white">
              <Zap className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="font-bold text-base leading-none">BizOps</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">AI Business Manager</p>
            </div>
          </div>
          <div>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>Enter your email and password to continue</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
