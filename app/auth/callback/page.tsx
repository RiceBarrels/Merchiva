"use client";

import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { useRouter } from "next/navigation";

export default function AuthCallback() {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (auth.isAuthenticated && auth.user?.id_token) {
      localStorage.setItem("stdb_token", auth.user.id_token);
      router.replace("/dashboard");
    }
  }, [auth.isAuthenticated, auth.user, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-muted-foreground">Signing in...</p>
    </div>
  );
}
