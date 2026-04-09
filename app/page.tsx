"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "react-oidc-context";
import { LoginForm } from "@/components/login-form";

export default function Home() {
  const router = useRouter();
  const auth = useAuth();
  const [checking, setChecking] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    // Handle OIDC callback in progress — don't redirect yet
    if (auth.isLoading) return;

    const params = new URLSearchParams(window.location.search);
    if (params.get("logout") === "1") {
      localStorage.removeItem("stdb_token");
      window.history.replaceState({}, "", "/");
      auth.removeUser().catch(() => null);
      setNeedsLogin(true);
      setChecking(false);
      return;
    }

    // Prefer OIDC id_token — store it so SpacetimeDB can use it
    if (auth.isAuthenticated && auth.user?.id_token) {
      localStorage.setItem("stdb_token", auth.user.id_token);
      router.replace("/dashboard");
      return;
    }

    const token = localStorage.getItem("stdb_token");
    if (token) {
      router.replace("/dashboard");
    } else {
      setNeedsLogin(true);
      setChecking(false);
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.user, router]);

  if (checking && !needsLogin) return null;
  if (needsLogin) {
    return <LoginForm onSuccess={() => router.replace("/dashboard")} />;
  }
  return null;
}
