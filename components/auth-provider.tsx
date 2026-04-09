"use client";

import { AuthProvider } from "react-oidc-context";
import type { User } from "oidc-client-ts";

const oidcConfig = {
  authority: process.env.NEXT_PUBLIC_SPACETIMEAUTH_AUTHORITY || "https://auth.spacetimedb.com/oidc",
  client_id: process.env.NEXT_PUBLIC_SPACETIMEAUTH_CLIENT_ID || "client_032wKpr8lE6TZ7Kik2g0VE",
  redirect_uri: typeof window !== "undefined" ? window.location.origin + "/auth/callback" : "",
  post_logout_redirect_uri: typeof window !== "undefined" ? window.location.origin : "",
  scope: "openid profile email",
  // Clean up URL only after oidc-client has finished processing the callback
  onSigninCallback: (_user: User | void) => {
    window.history.replaceState({}, document.title, "/auth/callback");
  },
};

export function SpacetimeAuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthProvider {...oidcConfig}>{children}</AuthProvider>;
}
