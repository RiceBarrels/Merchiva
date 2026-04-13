"use client";

import { useState } from "react";
import { Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSignUp } from "@clerk/react/legacy";
import { hapticLight, hapticSuccess, hapticError } from "@/lib/haptics";
import { toast } from "sonner";
import Link from "next/link";

interface SignupFormProps {
  onSuccess?: () => void;
}

export function SignupForm({ onSuccess }: SignupFormProps) {
  const { signUp, setActive, isLoaded } = useSignUp();
  const [step, setStep] = useState<"details" | "verify">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getClerkError = (err: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (err as any)?.errors?.[0]?.longMessage ?? (err as any)?.errors?.[0]?.message
      ?? (err instanceof Error ? err.message : "Something went wrong");
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    hapticLight();
    setLoading(true);
    setError(null);

    try {
      const result = await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName: name.trim() || undefined,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        hapticSuccess();
        onSuccess?.();
      } else {
        // Email verification required
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
        setStep("verify");
        setLoading(false);
      }
    } catch (err) {
      hapticError();
      const msg = getClerkError(err);
      toast.error("Sign up failed", { description: msg });
      setError(msg);
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp) return;
    hapticLight();
    setLoading(true);
    setError(null);

    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        hapticSuccess();
        onSuccess?.();
      } else {
        throw new Error("Verification incomplete — please try again.");
      }
    } catch (err) {
      hapticError();
      const msg = getClerkError(err);
      toast.error("Verification failed", { description: msg });
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 flex-col justify-center px-6">
        <div className="mx-auto w-full max-w-sm space-y-8">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-stone-900 text-white">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <p className="font-bold text-lg">BizOps</p>
              <p className="text-xs text-muted-foreground">AI Business Manager</p>
            </div>
          </div>

          {step === "details" ? (
            <form onSubmit={handleSignup} className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold">Create your account</h1>
                <p className="text-muted-foreground text-sm mt-1">Get started with BizOps</p>
              </div>
              <div className="space-y-4">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name (optional)"
                  autoFocus
                  autoComplete="name"
                  className="h-12 text-base"
                />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="h-12 text-base"
                />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  autoComplete="new-password"
                  className="h-12 text-base"
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={loading || !email.trim() || !password} className="w-full h-11">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-6">
              <div>
                <h1 className="text-2xl font-bold">Check your email</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Enter the verification code sent to {email}
                </p>
              </div>
              <div className="space-y-4">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter code"
                  autoFocus
                  autoComplete="one-time-code"
                  className="h-12 text-base tracking-widest"
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={loading || !code} className="w-full h-11">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify email"}
                </Button>
              </div>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/" className="font-medium text-foreground underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
