"use client";

import { useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Zap, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "react-oidc-context";
import { hapticLight, hapticSuccess, hapticError } from "@/lib/haptics";

function SignupForm() {
  const router = useRouter();
  const auth = useAuth();

  const [step, setStep] = useState(1); // 1=name, 2=email, 3=password
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNext = () => {
    hapticLight();
    setError(null);
    setStep((s) => s + 1);
  };

  const handleBack = (to: number) => {
    hapticLight();
    setError(null);
    setStep(to);
  };

  const handleSignup = async () => {
    setError(null);
    setLoading(true);

    // Try ROPC first — SpacetimeAuth may support account creation via
    // the password grant if the account doesn't exist yet.
    // If that fails, fall back to a popup so the user can register
    // on SpacetimeAuth's hosted page without losing the current page context.
    try {
      const user = await auth.signinResourceOwnerCredentials({
        username: email.trim(),
        password,
        extraTokenParams: {
          display_name: name.trim() || email.split("@")[0],
        },
      });

      if (user?.id_token) {
        localStorage.setItem("stdb_token", user.id_token);
      }

      hapticSuccess();
      router.replace("/dashboard");
    } catch {
      // ROPC failed — open the hosted SpacetimeAuth signup in a popup.
      // The popup will complete OIDC and return a user object.
      try {
        const user = await auth.signinPopup({
          extraQueryParams: {
            screen_hint: "signup",
            login_hint: email.trim(),
          },
        });

        if (user?.id_token) {
          localStorage.setItem("stdb_token", user.id_token);
        }

        hapticSuccess();
        router.replace("/dashboard");
      } catch (popupErr) {
        hapticError();
        setError(
          popupErr instanceof Error ? popupErr.message : "Sign-up failed. Please try again."
        );
        setLoading(false);
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-12 bg-background">
      <div className="mx-auto w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mb-8">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-stone-900 text-white">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <p className="font-bold text-lg leading-none">BizOps</p>
            <p className="text-xs text-muted-foreground">AI Business Manager</p>
          </div>
        </div>

        {/* Step progress */}
        <div className="flex gap-1.5 mb-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? "bg-stone-900" : "bg-stone-200"}`}
            />
          ))}
        </div>

        {/* Step 1 — Name */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold">What&apos;s your name?</h1>
              <p className="text-muted-foreground text-sm mt-1">Let&apos;s get you set up</p>
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
              autoComplete="name"
              className="text-lg h-12"
              onKeyDown={(e) => e.key === "Enter" && name.trim() && handleNext()}
            />
            <Button onClick={handleNext} disabled={!name.trim()} className="w-full h-11">
              Continue
            </Button>
          </div>
        )}

        {/* Step 2 — Email */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <button
                onClick={() => handleBack(1)}
                className="text-muted-foreground mb-2 flex items-center gap-1 text-sm"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <h1 className="text-2xl font-bold">What&apos;s your email?</h1>
            </div>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              autoComplete="email"
              className="text-lg h-12"
              onKeyDown={(e) => e.key === "Enter" && email.trim() && handleNext()}
            />
            <Button onClick={handleNext} disabled={!email.trim()} className="w-full h-11">
              Continue
            </Button>
          </div>
        )}

        {/* Step 3 — Password */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <button
                onClick={() => handleBack(2)}
                className="text-muted-foreground mb-2 flex items-center gap-1 text-sm"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <h1 className="text-2xl font-bold">Create a password</h1>
              <p className="text-muted-foreground text-sm mt-1">At least 6 characters</p>
            </div>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              autoComplete="new-password"
              className="text-lg h-12"
              onKeyDown={(e) => e.key === "Enter" && password.length >= 6 && handleSignup()}
            />
            {error && (
              <p className="text-sm text-destructive rounded-sm bg-destructive/10 px-3 py-2">
                {error}
              </p>
            )}
            <Button
              onClick={handleSignup}
              disabled={password.length < 6 || loading}
              className="w-full h-11"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
            </Button>
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground mt-8">
          Already have an account?{" "}
          <a href="/" className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </a>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
