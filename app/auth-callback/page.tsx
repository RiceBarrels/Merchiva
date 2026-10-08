"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { addAccountToStorage } from "@/lib/auth/context";
import { safeNextPath } from "@/lib/auth/safe-next";

import { Suspense } from "react";
import { Spinner } from "@/components/ui/loaders/geometric";

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
    const redirectTo = safeNextPath(searchParams.get("redirect_to"));

    if (!accessToken || !refreshToken || !userStr) {
      router.replace("/login?error=missing_tokens");
      return;
    }

    try {
      const user = JSON.parse(userStr);
      addAccountToStorage(accessToken, refreshToken, user);
      window.location.href = redirectTo;
    } catch {
      router.replace("/login?error=invalid_response");
    }
  }, [searchParams, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner size={24} className="text-stone-400 dark:text-stone-500" />
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
