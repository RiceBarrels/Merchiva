// The notifications cron's environment and its gate. Pure: the env is passed in.
//
// The gate fails closed, in this order:
//   CRON_SECRET unset → 503 not_configured; wrong or missing bearer → 401;
//   no service token / SpacetimeDB URI / module → 503;
//   neither email (Resend + WorkOS) nor push (VAPID) configured → 503.
// It never reads the Drive Blob config: the notifications cron does not need
// file storage.

import { sameSecret } from "@/lib/cron-auth";
import { bearerToken } from "@/lib/drive/server/http";
import type { NotifyCronConfig } from "./types";

export type NotifyCronCode = "not_configured" | "unauthenticated" | "upstream";

const NOTIFY_STATUS: Readonly<Record<NotifyCronCode, number>> = {
  not_configured: 503,
  unauthenticated: 401,
  upstream: 502,
};

export class NotifyCronError extends Error {
  readonly code: NotifyCronCode;
  readonly status: number;
  constructor(code: NotifyCronCode, message: string) {
    super(message);
    this.name = "NotifyCronError";
    this.code = code;
    this.status = NOTIFY_STATUS[code];
  }
}

function envValue(env: Readonly<Record<string, string | undefined>>, name: string): string {
  return (env[name] ?? "").trim();
}

export function parseNotifyCronConfig(env: Readonly<Record<string, string | undefined>>): NotifyCronConfig {
  const clientId = envValue(env, "WORKOS_CLIENT_ID");
  const issuer = envValue(env, "WORKOS_ISSUER");
  return {
    cronSecret: envValue(env, "CRON_SECRET") || null,
    stdbConfigured: Boolean(
      envValue(env, "SPACETIMEDB_SERVICE_TOKEN")
      && envValue(env, "NEXT_PUBLIC_SPACETIMEDB_URI")
      && envValue(env, "NEXT_PUBLIC_SPACETIMEDB_MODULE"),
    ),
    emailConfigured: Boolean(envValue(env, "RESEND_API_KEY") && envValue(env, "WORKOS_API_KEY") && clientId),
    expectedIssuer: issuer || (clientId ? `https://api.workos.com/user_management/${clientId}` : ""),
  };
}

/** Only Vercel Cron (or an operator holding CRON_SECRET) may run the notifications cron. */
export function requireNotifyCron(req: Request, cronSecret: string | null): void {
  if (!cronSecret) throw new NotifyCronError("not_configured", "CRON_SECRET is not set");
  const given = bearerToken(req.headers.get("authorization"));
  if (!given || !sameSecret(given, cronSecret)) throw new NotifyCronError("unauthenticated", "Wrong cron secret");
}

/**
 * The channels this run can serve, as the claim reducer takes them: 'p' with
 * VAPID keys, 'e' with Resend + WorkOS. 503 when SpacetimeDB service access is
 * missing or neither channel is configured.
 */
export function notifyCronChannels(config: NotifyCronConfig, pushReady: boolean): string {
  if (!config.stdbConfigured) {
    throw new NotifyCronError("not_configured", "SpacetimeDB service access is not configured");
  }
  const channels = (pushReady ? "p" : "") + (config.emailConfigured ? "e" : "");
  if (!channels) throw new NotifyCronError("not_configured", "Neither push nor email is configured");
  return channels;
}
