"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { storeAuthTokens } from "@/lib/auth/context";
import { Loader2 } from "lucide-react";
import { Suspense } from "react";

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const accessToken = searchParams.get("access_token");
    const refreshToken = searchParams.get("refresh_token");
    const userStr = searchParams.get("user");
    const redirectTo = searchParams.get("redirect_to") || "/dashboard";

    if (!accessToken || !refreshToken || !userStr) {
      router.replace("/login?error=missing_tokens");
      return;
    }

    try {
      const user = JSON.parse(userStr);
      storeAuthTokens(accessToken, refreshToken, user);
      window.location.href = redirectTo;
    } catch {
      router.replace("/login?error=invalid_response");
    }
  }, [searchParams, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-stone-400" />
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <AuthCallbackInner />
    </Suspense>
  );
}
