"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/components/login-form";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("stdb_token");
    if (token) {
      router.replace("/dashboard");
    } else {
      setNeedsLogin(true);
      setChecking(false);
    }
  }, [router]);

  if (checking) return null;
  if (needsLogin) {
    return <LoginForm onSuccess={() => router.replace("/dashboard")} />;
  }
  return null;
}
