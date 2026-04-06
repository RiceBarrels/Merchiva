"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LoginForm } from "@/components/login-form";

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.replace("/dashboard");
      } else {
        setNeedsLogin(true);
      }
    }).catch(() => {
      setNeedsLogin(true);
    }).finally(() => setChecking(false));
  }, [router]);

  if (checking) return null;
  if (needsLogin) {
    return <LoginForm onSuccess={() => router.replace("/dashboard")} />;
  }
  return null;
}
