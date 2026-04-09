"use client";

import { useState, Suspense } from "react";
import { Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "react-oidc-context";
import { hapticLight } from "@/lib/haptics";

function SignupForm() {
  const auth = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSignUp = () => {
    hapticLight();
    setLoading(true);
    auth
      .signinRedirect({ extraQueryParams: { screen_hint: "signup" } })
      .catch(() => setLoading(false));
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

        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Create account</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Set up your SpacetimeDB account to get started
            </p>
          </div>

          {auth.error && (
            <p className="text-sm text-destructive rounded-sm bg-destructive/10 px-3 py-2">
              {auth.error.message}
            </p>
          )}

          <Button
            onClick={handleSignUp}
            disabled={loading || auth.isLoading}
            className="w-full h-11"
          >
            {loading || auth.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Create account"
            )}
          </Button>
        </div>

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
