"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { loadPKCE, clearPKCE } from "@/lib/pkce";
import {
  SPACETIMEAUTH_AUTHORITY,
  SPACETIMEAUTH_CLIENT_ID,
  SPACETIMEAUTH_REDIRECT_URI,
} from "@/lib/spacetimedb/auth-config";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const errorParam = params.get("error");
    const errorDesc = params.get("error_description");

    if (errorParam) {
      setError(errorDesc ?? errorParam);
      return;
    }

    if (!code) {
      setError("No authorization code received.");
      return;
    }

    const pkce = loadPKCE();
    if (!pkce) {
      setError("Session expired. Please try signing in again.");
      return;
    }

    const { verifier } = pkce;

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: SPACETIMEAUTH_REDIRECT_URI,
      client_id: SPACETIMEAUTH_CLIENT_ID,
      code_verifier: verifier,
    });

    fetch(`${SPACETIMEAUTH_AUTHORITY}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
      .then((res) => {
        if (!res.ok) return res.text().then((t) => Promise.reject(new Error(t)));
        return res.json();
      })
      .then((data: { id_token?: string; access_token?: string }) => {
        clearPKCE();
        const token = data.id_token ?? data.access_token;
        if (!token) throw new Error("No token in response");
        localStorage.setItem("stdb_token", token);
        // If opened in a new tab, close it so the opener detects the token
        if (window.opener) {
          window.close();
        } else {
          router.replace("/dashboard");
        }
      })
      .catch((err: Error) => {
        clearPKCE();
        setError(err.message || "Authentication failed");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-destructive text-center">{error}</p>
        <button
          onClick={() => {
            localStorage.removeItem("stdb_token");
            if (window.opener) {
              window.close();
            } else {
              window.location.href = "/";
            }
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
