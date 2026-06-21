"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, clearAuthTokens } from "@/lib/auth/context";

export function AuthRedirect() {
  const router = useRouter();
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const [justLoggedOut, setJustLoggedOut] = useState<boolean | null>(null);
  const processedLogout = useRef(false);

  useEffect(() => {
    if (processedLogout.current) return;
    processedLogout.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("logout") === "1") {
      clearAuthTokens();
      window.history.replaceState({}, "", "/");
      setJustLoggedOut(true);
    } else {
      setJustLoggedOut(false);
    }
  }, []);

  useEffect(() => {
    if (justLoggedOut !== false) return;
    if (!isLoaded || !isSignedIn) return;
    getToken().then((token) => {
      if (token) localStorage.setItem("stdb_token", token);
      router.replace("/~/");
    });
  }, [justLoggedOut, isLoaded, isSignedIn, router, getToken]);

  return null;
}
