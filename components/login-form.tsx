"use client";

import { useState } from "react";
import { Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "react-oidc-context";
import { hapticLight } from "@/lib/haptics";

export function LoginForm({ onSuccess: _onSuccess }: { onSuccess?: () => void }) {
  const auth = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSignIn = () => {
    hapticLight();
    setLoading(true);
    auth.signinRedirect().catch(() => setLoading(false));
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
            <h1 className="text-2xl font-bold">Sign in</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Continue with your SpacetimeDB account
            </p>
          </div>

          {auth.error && (
            <p className="text-sm text-destructive rounded-sm bg-destructive/10 px-3 py-2">
              {auth.error.message}
            </p>
          )}

          <Button
            onClick={handleSignIn}
            disabled={loading || auth.isLoading}
            className="w-full h-11"
          >
            {loading || auth.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Sign in"
            )}
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          Don&apos;t have an account?{" "}
          <a href="/signup" className="font-medium text-foreground underline underline-offset-4">
            Create one
          </a>
        </p>
      </div>
    </div>
  );
}
