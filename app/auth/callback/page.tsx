"use client";

import { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const auth = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.isAuthenticated && auth.user?.id_token) {
      localStorage.setItem("stdb_token", auth.user.id_token);
      router.replace("/dashboard");
      return;
    }

    if (auth.error) {
      setError(auth.error.message || "Authentication failed");
      return;
    }

    const timer = setTimeout(() => {
      if (!auth.isAuthenticated) {
        setError("Authentication timed out. Please try again.");
      }
    }, 10000);

    return () => clearTimeout(timer);
  }, [auth.isAuthenticated, auth.user, auth.error, router]);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-destructive">{error}</p>
        <button
          onClick={() => {
            localStorage.removeItem("stdb_token");
            window.location.href = "/";
          }}
          className="px-4 py-2 text-sm border border-stone-300 rounded-sm hover:bg-stone-100"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Signing in...</p>
    </div>
  );
}
