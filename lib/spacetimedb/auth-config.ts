export const SPACETIMEAUTH_AUTHORITY =
  process.env.NEXT_PUBLIC_SPACETIMEAUTH_AUTHORITY || "https://auth.spacetimedb.com";

export const SPACETIMEAUTH_CLIENT_ID =
  process.env.NEXT_PUBLIC_SPACETIMEAUTH_CLIENT_ID || "";

export const SPACETIMEAUTH_REDIRECT_URI =
  typeof window !== "undefined" ? window.location.origin + "/auth/callback" : "";
