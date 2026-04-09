export const SPACETIMEAUTH_AUTHORITY =
  process.env.NEXT_PUBLIC_SPACETIMEAUTH_AUTHORITY || "https://auth.spacetimedb.com/oidc";

export const SPACETIMEAUTH_CLIENT_ID =
  process.env.NEXT_PUBLIC_SPACETIMEAUTH_CLIENT_ID || "client_032wKpr8lE6TZ7Kik2g0VE";

export const SPACETIMEAUTH_REDIRECT_URI =
  typeof window !== "undefined" ? window.location.origin + "/auth/callback" : "";
