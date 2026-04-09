"use client";

import { AuthProvider } from "react-oidc-context";
import { WebStorageStateStore } from "oidc-client-ts";

const oidcConfig = {
  authority: process.env.NEXT_PUBLIC_SPACETIMEAUTH_AUTHORITY || "https://auth.spacetimedb.com/oidc",
  client_id: process.env.NEXT_PUBLIC_SPACETIMEAUTH_CLIENT_ID || "client_032wKpr8lE6TZ7Kik2g0VE",
  redirect_uri: typeof window !== "undefined" ? window.location.origin + "/auth/callback" : "",
  post_logout_redirect_uri: typeof window !== "undefined" ? window.location.origin : "",
  scope: "openid profile email",
  response_type: "id_token", // implicit flow — id_token delivered directly in URL hash
  userStore: typeof window !== "undefined"
    ? new WebStorageStateStore({ store: window.localStorage })
    : undefined,
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

export function SpacetimeAuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthProvider {...oidcConfig}>{children}</AuthProvider>;
}
