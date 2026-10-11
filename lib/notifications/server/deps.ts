import "server-only";

// The real NotifyCronDeps behind /api/cron/notifications: env config,
// SpacetimeDB over HTTP with the service token, Web Push (VAPID), WorkOS for
// the verified address, Resend for the email. Built once per process, so the
// WorkOS answer cache lives as long as the warm function.
//
// Missing env never throws here: the handler's gate answers 503 first
// (config.ts), and a channel without its keys is not offered to the claim.

import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { workos } from "@/lib/auth/workos";
import { sqlRows } from "@/lib/drive/server/sql-rows";
import { ensureVapid, sendWebPush } from "@/lib/push/send";
import { callReducer } from "@/lib/spacetimedb/server-rpc";
import { spacetimeSql } from "@/lib/spacetimedb/sql";
import { parseNotifyCronConfig } from "./config";
import { createNotifyRecipientLookup } from "./recipients";
import type { NotifyCronDeps, NotifyEmailError } from "./types";

/** web-push's socket timeout per push service. */
const PUSH_TIMEOUT_MS = 5_000;
/** One Resend call; past it the send counts as no answer (the idempotency key covers a late success). */
const EMAIL_TIMEOUT_MS = 10_000;
const SELECT_RE = /^\s*select\b/i;

let memo: NotifyCronDeps | null = null;

export function notifyCronDeps(): NotifyCronDeps {
  if (memo) return memo;
  const config = parseNotifyCronConfig(process.env);
  const serviceToken = process.env.SPACETIMEDB_SERVICE_TOKEN?.trim() ?? "";
  const resendKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const resend = resendKey ? new Resend(resendKey) : null;

  function requireToken(): string {
    if (!serviceToken) throw new Error("SPACETIMEDB_SERVICE_TOKEN is not set");
    return serviceToken;
  }

  memo = {
    now: () => Date.now(),
    config: () => config,
    pushReady: ensureVapid,
    randomUUID: () => randomUUID(),

    async call(name, args) {
      await callReducer({ token: requireToken(), name, args });
    },

    async sql(query) {
      if (!SELECT_RE.test(query) || query.includes(";")) throw new Error("Notification SQL must be a single SELECT");
      return sqlRows(await spacetimeSql(query, { token: requireToken() }));
    },

    push: (subscriptions, payload) => sendWebPush(subscriptions, payload, { timeoutMs: PUSH_TIMEOUT_MS }),

    resolveRecipient: createNotifyRecipientLookup({
      getUser: (subject) => workos.userManagement.getUser(subject),
      now: () => Date.now(),
    }),

    async sendEmail(message, idempotencyKey): Promise<NotifyEmailError | null> {
      if (!resend) return { name: "missing_api_key", statusCode: 401, message: "RESEND_API_KEY is not set" };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), EMAIL_TIMEOUT_MS);
      });
      try {
        const answer = await Promise.race([resend.emails.send(message, { idempotencyKey }), late]);
        if (!answer) return { name: "application_error", statusCode: null, message: "Resend did not answer in time" };
        const { error } = answer;
        return error ? { name: error.name, statusCode: error.statusCode, message: error.message } : null;
      } catch (err) {
        return { name: "application_error", statusCode: null, message: err instanceof Error ? err.message : "send failed" };
      } finally {
        if (timer) clearTimeout(timer);
      }
    },

    log(level, event, fields) {
      console[level](`[notify] ${event}`, fields);
    },
  };
  return memo;
}
