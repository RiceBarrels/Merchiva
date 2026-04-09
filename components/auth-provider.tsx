"use client";

import { AuthProvider } from "react-oidc-context";

const oidcConfig = {
  authority: process.env.NEXT_PUBLIC_SPACETIMEAUTH_AUTHORITY || "https://auth.spacetimedb.com",
  client_id: process.env.NEXT_PUBLIC_SPACETIMEAUTH_CLIENT_ID || "",
  redirect_uri: typeof window !== "undefined" ? window.location.origin + "/auth/callback" : "",
  scope: "openid profile email",
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

export function SpacetimeAuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthProvider {...oidcConfig}>{children}</AuthProvider>;
}
