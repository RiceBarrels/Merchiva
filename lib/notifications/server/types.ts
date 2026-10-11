// Contracts between the notifications cron (handler.ts) and the outside world.
// The handler is a pure factory over NotifyCronDeps, so tests inject every
// effect (clock, env, SpacetimeDB, Web Push, WorkOS, Resend) and never import
// the server-guarded deps.ts, which builds the real one.

import type { SqlRow } from "@/lib/drive/server/sql-rows";
import type { PushPayload, PushResult, PushSubscriptionInput } from "@/lib/push/send";

/** The cron's environment, parsed (config.ts). */
export interface NotifyCronConfig {
  /** CRON_SECRET or null (the cron then refuses to run). */
  cronSecret: string | null;
  /** SPACETIMEDB_SERVICE_TOKEN, NEXT_PUBLIC_SPACETIMEDB_URI and NEXT_PUBLIC_SPACETIMEDB_MODULE are all set. */
  stdbConfigured: boolean;
  /** RESEND_API_KEY, WORKOS_API_KEY and WORKOS_CLIENT_ID are all set: email can go out. */
  emailConfigured: boolean;
  /**
   * The `iss` a member's access token must carry for their stored subject to be
   * emailed: WORKOS_ISSUER, else https://api.workos.com/user_management/<WORKOS_CLIENT_ID>;
   * '' when neither is known (then nobody is emailed).
   */
  expectedIssuer: string;
}

/** What a WorkOS user lookup needs from the user. */
export interface NotifyWorkosUser {
  email?: string | null;
  emailVerified?: boolean | null;
}

/** A recipient's verified address, or why there is none (recipients.ts). */
export type NotifyRecipient =
  | { kind: "ok"; email: string }
  /** No address will ever come for this subject: the email is dropped. */
  | { kind: "drop"; reason: "not_found" | "no_email" | "unverified" | "invalid" }
  /** WorkOS could not answer now: the email is tried again; no lookup is started after one. */
  | { kind: "retry"; reason: string };

export interface NotifyEmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Resend's error object (resend's ErrorResponse): `name` is its code. statusCode null = no HTTP answer. */
export interface NotifyEmailError {
  name: string;
  statusCode: number | null;
  message: string;
}

export type NotifyLogLevel = "info" | "warn" | "error";

/** The two service reducers the cron calls (snake_case names over HTTP, positional args). */
export type NotifyReducerName = "service_claim_notification_deliveries" | "service_finish_notification_deliveries";

export interface NotifyCronDeps {
  /** ms since the epoch. */
  now(): number;
  config(): NotifyCronConfig;
  /** VAPID keys present and set on web-push (ensureVapid). */
  pushReady(): boolean;
  /** A fresh lowercase v4 UUID: the run id the module leases rows to. */
  randomUUID(): string;
  /** A service reducer over HTTP with SPACETIMEDB_SERVICE_TOKEN; rejects with the module's error text. */
  call(name: NotifyReducerName, args: unknown[]): Promise<void>;
  /** One SELECT over HTTP `/sql` as the service identity. Rows keyed by column name. */
  sql(query: string): Promise<SqlRow[]>;
  /** sendWebPush with a per-service timeout. Never throws. */
  push(subscriptions: PushSubscriptionInput[], payload: PushPayload): Promise<PushResult>;
  /** The verified address of a WorkOS user id (cached; recipients.ts). Never throws. */
  resolveRecipient(subject: string): Promise<NotifyRecipient>;
  /** One email through Resend with an idempotency key; null on success. Never throws (a network failure is statusCode null). */
  sendEmail(message: NotifyEmailMessage, idempotencyKey: string): Promise<NotifyEmailError | null>;
  /** Never pass addresses, tokens, push keys or message text in `fields`. */
  log(level: NotifyLogLevel, event: string, fields: Record<string, string | number | boolean>): void;
}

export type NotifyRouteHandler = (req: Request) => Promise<Response>;
