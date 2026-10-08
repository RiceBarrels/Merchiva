// Authentication for the CLI.
//
// Merchiva auth is WorkOS (OIDC). The WorkOS *access token* doubles as the
// SpacetimeDB token (the web stores it as `stdb_token` and passes it to
// withToken()). So logging in = getting that access token and saving it.
//
//   merchiva login    → POST /api/auth/sign-in  (email + password)
//   refresh           → POST /api/auth/refresh  (refresh token → new access)
//
// Access tokens are short-lived, so `ensureFreshToken()` transparently refreshes
// before launching the UI / running a chat when the token is near expiry.

import { loadConfig, saveConfig } from "./config.ts";

export interface AuthUser {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

interface SignInOk {
  accessToken: string;
  refreshToken: string;
  user?: AuthUser;
}

/** Decode a JWT's `exp` (epoch seconds). Returns undefined if unparseable. */
export function tokenExp(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const parts = token.split(".");
  if (parts.length < 2) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));
    return typeof payload.exp === "number" ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

export function isExpired(token: string | undefined, skewSeconds = 60): boolean {
  const exp = tokenExp(token);
  if (!exp) return false; // unknown — assume usable, let the server reject it
  return exp - skewSeconds <= Math.floor(Date.now() / 1000);
}

export class AuthError extends Error {
  constructor(
    message: string,
    public kind: "credentials" | "verification" | "mfa" | "network" | "server" = "server",
  ) {
    super(message);
  }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const { baseUrl } = loadConfig();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/auth/sign-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (e) {
    throw new AuthError(`Could not reach ${baseUrl} (${e instanceof Error ? e.message : e})`, "network");
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (res.status === 403 && data.emailVerificationRequired) {
    throw new AuthError("Email verification required — finish it in the web app, then retry.", "verification");
  }
  if (res.status === 403 && data.mfaRequired) {
    throw new AuthError("MFA is enabled on this account — sign in via the web app (MFA isn't supported in the CLI yet).", "mfa");
  }
  if (!res.ok || !data.accessToken) {
    throw new AuthError(String(data.error || `Sign-in failed (HTTP ${res.status})`), "credentials");
  }

  const ok = data as unknown as SignInOk;
  saveConfig({
    token: ok.accessToken,
    refreshToken: ok.refreshToken,
    userEmail: ok.user?.email,
  });
  return ok.user ?? {};
}

export async function refresh(): Promise<boolean> {
  const { baseUrl, refreshToken } = loadConfig();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !data.accessToken) return false;
    saveConfig({
      token: String(data.accessToken),
      refreshToken: data.refreshToken ? String(data.refreshToken) : refreshToken,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns a usable access token, refreshing first if it's expired/near-expiry.
 * Falls back to SPACETIMEDB_SERVICE_TOKEN (handled downstream) if not logged in.
 */
export async function ensureFreshToken(): Promise<string | undefined> {
  const cfg = loadConfig();
  if (cfg.token && isExpired(cfg.token) && cfg.refreshToken) {
    await refresh();
  }
  return loadConfig().token;
}

/**
 * A new access token after the server refused the current one, or undefined
 * when there is nothing to renew: a MERCHIVA_TOKEN override can't be
 * refreshed, and neither can a login without a refresh token.
 */
export async function renewToken(): Promise<string | undefined> {
  if (process.env.MERCHIVA_TOKEN) return undefined;
  return (await refresh()) ? loadConfig().token : undefined;
}

export function logout() {
  saveConfig({ token: undefined, refreshToken: undefined, userEmail: undefined });
}
