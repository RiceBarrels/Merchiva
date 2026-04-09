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
import { hapticSuccess, hapticError } from "@/lib/haptics";
import { connectToStdb, hashPassword } from "@/lib/spacetimedb/auth";
import { getStoredToken } from "@/lib/spacetimedb/client";

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

    try {
      const storedToken = getStoredToken();

      if (storedToken) {
        // Fast path: reconnect with existing token, verify email matches
        const { conn } = await connectToStdb(storedToken);
        const identity = conn.identity;

        if (identity && email.trim()) {
          // Give the subscription a moment to hydrate so we can read user.email
          await new Promise<void>((resolve) => {
            const sub = conn.subscriptionBuilder().onApplied(() => {
              resolve();
              // intentionally not unsubscribing — the connection will be closed by provider
            }).subscribe(["SELECT * FROM user"]);
            setTimeout(resolve, 3000);
            void sub;
          });

          // Verify the stored identity's email matches what the user typed
          const db = conn as any;
          const rows: any[] = db.db?.user
            ? [...db.db.user.iter()]
            : [];
          const userRow = rows.find(
            (r: any) => r.identity?.toString() === identity.toString()
          );

          if (userRow && userRow.email && userRow.email !== email.trim()) {
            hapticError();
            setError("Email doesn't match the saved session. Sign out first or try signing up.");
            setLoading(false);
            return;
          }
        }

        hapticSuccess();
        onSuccess?.();
        return;
      }

      // Slow path: no token — authenticate via email + password hash
      const hash = await hashPassword(password);
      const { conn } = await connectToStdb(); // anonymous new identity

      // Subscribe, then call loginWithPassword to migrate the account to this identity
      await new Promise<void>((resolve) => {
        conn.subscriptionBuilder().onApplied(() => resolve()).subscribe(["SELECT * FROM user"]);
        setTimeout(resolve, 3000);
      });

      // Call reducer — if email/hash is wrong, the reducer throws server-side
      // and a ReducerError event fires; we detect this by checking after 2s
      // whether our identity has the expected email in its user row.
      await conn.reducers.loginWithPassword({ email: email.trim(), passwordHash: hash });

      // Wait for the migration to propagate
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check outcome
      const identity = conn.identity;
      const db = conn as any;
      const rows: any[] = db.db?.user ? [...db.db.user.iter()] : [];
      const userRow = rows.find(
        (r: any) => r.identity?.toString() === identity?.toString()
      );

      if (!userRow || userRow.email !== email.trim()) {
        hapticError();
        setError("Invalid email or password. If you created an account on a different device, your session is stored there.");
        setLoading(false);
        return;
      }

      hapticSuccess();
      onSuccess?.();
    } catch (err) {
      hapticError();
      setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
      setLoading(false);
    }
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
