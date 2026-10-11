// In-memory NotifyCronDeps for the notifications cron tests: a scripted clock,
// a stand-in claim reducer that leases the rows it was given (per claim, when
// `rows` is a function), run ids runIdOf(1), runIdOf(2), …, `/sql` rows in
// the server's real shape (snake_case columns, `[micros]` timestamps, identity
// as `["0x…"]`), and recorded pushes, lookups and emails. Every effect is kept
// in `timeline` in order.

import { fmt } from "@/lib/i18n/fmt";
import type { NotifyTranslator } from "@/lib/notifications/server/text";
import type {
  NotifyCronConfig, NotifyCronDeps, NotifyEmailError, NotifyEmailMessage, NotifyLogLevel, NotifyRecipient,
} from "@/lib/notifications/server/types";
import type { SqlRow } from "@/lib/drive/server/sql-rows";
import type { PushPayload, PushResult, PushSubscriptionInput } from "@/lib/push/send";

export const SECRET = "cron-secret-0123456789";
export const RUN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
export const ISSUER = "https://api.workos.com/user_management/client_01TEST";
export const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);

/** The n-th run id the fake hands out (1-based); the first is RUN_ID. */
export function runIdOf(n: number): string {
  return n === 1 ? RUN_ID : `${RUN_ID.slice(0, -4)}${n.toString(16).padStart(4, "0")}`;
}

export function testConfig(over: Partial<NotifyCronConfig> = {}): NotifyCronConfig {
  return { cronSecret: SECRET, stdbConfigured: true, emailConfigured: true, expectedIssuer: ISSUER, ...over };
}

export function cronRequest(secret: string | null = SECRET): Request {
  const headers: Record<string, string> = {};
  if (secret !== null) headers.authorization = `Bearer ${secret}`;
  return new Request("https://www.merchiva.com/api/cron/notifications", { headers });
}

/** 64-hex identity for recipient `n`. */
export function hexOf(n: number): string {
  return n.toString(16).padStart(64, "0");
}

export function endpointOf(n: number, host = "fcm.googleapis.com"): string {
  return `https://${host}/fcm/send/endpoint-${n}`;
}

export interface RowSpec {
  id: string;
  target?: number;
  claimed?: string;
  template?: string;
  params?: Record<string, string>;
  title?: string;
  body?: string;
  link?: string;
  pushTargets?: PushSubscriptionInput[];
  subject?: string;
  issuer?: string;
  locale?: string;
  attempts?: number;
  createdAtMs?: number;
}

/** One `notification_delivery` row as `/sql` returns it (only the columns the cron reads, plus a few it does not). */
export function sqlRow(spec: RowSpec): SqlRow {
  const target = spec.target ?? 1;
  return {
    notification_id: spec.id,
    organization_id: "org-1",
    target_id: [`0x${hexOf(target)}`],
    scope: "drive-service",
    run_id: RUN_ID,
    claimed: spec.claimed ?? "e",
    due_at_micros: 0,
    template: spec.template ?? "chat.mention",
    params: JSON.stringify(spec.params ?? { actor: "Ana", preview: "Hi there", conversation: "general", store: "Corner Shop" }),
    source_kind: "chat_message",
    source_id: "m1",
    context_id: "c1",
    title: spec.title ?? "Ana",
    body: spec.body ?? "Hi there",
    link: spec.link ?? "/manager/channel?c=c1",
    email: (spec.claimed ?? "e").includes("e"),
    push: (spec.claimed ?? "e").includes("p"),
    push_targets: JSON.stringify(spec.pushTargets ?? []),
    subject: spec.subject ?? `user_${target}`,
    issuer: spec.issuer ?? ISSUER,
    locale: spec.locale ?? "",
    attempts: spec.attempts ?? 1,
    created_at: [(spec.createdAtMs ?? NOW - 120_000) * 1000],
  };
}

export function sub(n: number, host?: string): PushSubscriptionInput {
  return { endpoint: endpointOf(n, host), p256dh: `p256-${n}`, auth: `auth-${n}` };
}

/** English copy for the email keys, so rendering tests do not depend on messages/*.json. */
export const EN_EMAIL: Record<string, string> = {
  "notify.email.subject.chat.mention": "You were mentioned in a channel",
  "notify.email.subject.chat.message": "New message in a channel",
  "notify.email.subject.doc.comment": "New comment on a file",
  "notify.email.subject.alert.emergency": "Emergency alert from your store",
  "notify.email.subject.custom": "New notification",
  "notify.email.digestSubject": "You have {count} new notifications",
  "notify.email.subjectWithStore": "{subject} · {store}",
  "notify.email.storeLine": "Store: {store}",
  "notify.email.authorLine": "From: {author}",
  "notify.email.open": "Open in Merchiva",
  "notify.email.more": "And {count} more in Merchiva.",
  "notify.email.footerWhy": "You're receiving this email because you're a member of a store on Merchiva.",
  "notify.email.footerOff": "To stop these emails, turn off email in Settings → Notifications.",
  "notify.email.footerEmergency": "Emergency alerts are emailed even when email is off.",
  "notify.email.settings": "Notification settings",
  "notify.email.textOpen": "Open: {url}",
  "notify.email.textSettings": "Notification settings: {url}",
  "notify.event.chat.mention.title": "{actor} mentioned you",
  "notify.event.chat.mention.body": "{preview}",
  "notify.event.doc.comment.title": "{actor} commented on {doc}",
  "notify.event.doc.comment.body": "{preview}",
};

/** A translator over a fixed table (missing keys behave like lookup(): the key comes back). */
export function fixedTranslator(strings: Record<string, string> = EN_EMAIL, dir: "ltr" | "rtl" = "ltr"): NotifyTranslator {
  const t = (key: string) => strings[key] ?? key;
  return {
    locale: dir === "rtl" ? "ar" : "en",
    dir,
    t,
    text(key, vars) {
      const found = t(key);
      if (found === key) return null;
      return vars ? fmt(found, vars) : found;
    },
  };
}

export interface RecordedLog { level: NotifyLogLevel; event: string; fields: Record<string, string | number | boolean> }
export interface RecordedFinish { lists: Record<string, unknown>; runId: string }

export interface FakeOptions {
  config?: NotifyCronConfig;
  pushReady?: boolean;
  /** What `/sql` returns; a function gets the 1-based number of the claim it reads back. */
  rows?: SqlRow[] | ((claim: number) => SqlRow[]);
  /** Throw to fail the call; `n` is the 1-based claim number. */
  onClaim?: (n: number) => void;
  onSql?: () => void;
  /** Throw to fail a finish call; `n` counts every finish call made, 1-based, retries included. */
  onFinish?: (n: number, lists: Record<string, unknown>) => void;
  push?: (subs: PushSubscriptionInput[], payload: PushPayload) => PushResult;
  recipients?: Record<string, NotifyRecipient>;
  /** The answer to the n-th email (1-based); null = sent. */
  sendResult?: (n: number, message: NotifyEmailMessage) => NotifyEmailError | null;
  /** ms added to the clock after each email / push / lookup (to run out the budget). */
  tick?: { email?: number; push?: number; lookup?: number };
}

export interface FakeDeps {
  deps: NotifyCronDeps;
  timeline: string[];
  claims: unknown[][];
  sqls: string[];
  finishes: RecordedFinish[];
  pushes: Array<{ subs: PushSubscriptionInput[]; payload: PushPayload }>;
  lookups: string[];
  emails: Array<{ message: NotifyEmailMessage; key: string }>;
  logs: RecordedLog[];
  clock: { now: number };
}

export function makeDeps(opts: FakeOptions = {}): FakeDeps {
  const clock = { now: NOW };
  const fake: Omit<FakeDeps, "deps"> = {
    timeline: [], claims: [], sqls: [], finishes: [], pushes: [], lookups: [], emails: [], logs: [], clock,
  };
  let finishCalls = 0;
  let runIds = 0;
  const deps: NotifyCronDeps = {
    now: () => clock.now,
    config: () => opts.config ?? testConfig(),
    pushReady: () => opts.pushReady ?? true,
    randomUUID: () => runIdOf(++runIds),
    async call(name, args) {
      if (name === "service_claim_notification_deliveries") {
        fake.timeline.push("claim");
        fake.claims.push(args);
        opts.onClaim?.(fake.claims.length);
        return;
      }
      const lists = JSON.parse(String(args[1])) as Record<string, unknown>;
      fake.timeline.push(`finish:${Object.keys(lists).sort().join("+")}`);
      opts.onFinish?.(++finishCalls, lists);
      fake.finishes.push({ runId: String(args[0]), lists });
    },
    async sql(query) {
      fake.timeline.push("sql");
      fake.sqls.push(query);
      opts.onSql?.();
      return typeof opts.rows === "function" ? opts.rows(fake.claims.length) : opts.rows ?? [];
    },
    async push(subs, payload) {
      fake.timeline.push("push");
      fake.pushes.push({ subs, payload });
      clock.now += opts.tick?.push ?? 0;
      return opts.push?.(subs, payload) ?? { sent: subs.length, failed: 0, expired: [] };
    },
    async resolveRecipient(subject) {
      fake.timeline.push("lookup");
      fake.lookups.push(subject);
      clock.now += opts.tick?.lookup ?? 0;
      return opts.recipients?.[subject] ?? { kind: "ok", email: `${subject}@example.com` };
    },
    async sendEmail(message, key) {
      fake.timeline.push("email");
      fake.emails.push({ message, key });
      clock.now += opts.tick?.email ?? 0;
      return opts.sendResult?.(fake.emails.length, message) ?? null;
    },
    log(level, event, fields) {
      fake.logs.push({ level, event, fields });
    },
  };
  return { ...fake, deps };
}

/** All ids reported under `list` across the run's finish calls. */
export function reported(fake: FakeDeps, list: string): string[] {
  return fake.finishes.flatMap((f) => (Array.isArray(f.lists[list]) ? (f.lists[list] as string[]) : []));
}

export async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}
