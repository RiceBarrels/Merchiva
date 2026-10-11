// GET /api/cron/notifications — every minute (vercel.json). The one path that
// sends notifications off the app: Web Push to the recipient's browsers and an
// email digest to their verified address. The module decides what is owed and
// when (spacetimedb/src/notify/claim.ts: delays, pacing, revalidation); this
// run only delivers what it was leased:
//
//   1. Gate (config.ts): CRON_SECRET, then SpacetimeDB service access, then the
//      channels this deployment can serve ('p' with VAPID keys, 'e' with Resend
//      + WorkOS); fails closed.
//   2. service_claim_notification_deliveries(runId, channels, limit) leases due
//      rows to a fresh run id (and registers the service identity as a reader),
//      then one SELECT reads them back by run_id. Steps 2-5 make one batch; a
//      full batch is followed by another claim (at most NOTIFY_CLAIMS_PER_RUN),
//      under a new run id and only for the channels the run can still serve.
//   3. Push first: every leased push is sent once to the row's subscriptions on
//      a browser push service, in the recipient's language, tag = notification
//      id. An endpoint goes to one recipient per run. One finish call reports
//      every push (push is one-shot) and the subscriptions that are gone.
//   4. Email: one per recipient. A row whose stored issuer is not this
//      deployment's WorkOS issuer is dropped (a foreign identity provider could
//      mint the same subject). WorkOS gives the verified address (≤ 8 lookups at
//      a time, cached). Sends go one by one, at most NOTIFY_EMAILS_PER_RUN, each
//      under an idempotency key of its rows, and each is reported right after it
//      is sent. A provider outage stops email for the rest of the run.
//   5. Whatever was not decided (budget, outage, overflow) is reported as
//      emailRetry, which does not count an attempt.
// New work stops after `budgetMs` (45 s of the route's 60 s). The per-run
// limits (an endpoint's recipient, the email cap, an outage) hold across batches.

import { notifyAppOrigin, safeAppPath } from "@/lib/notifications/safe-link";
import type { PushPayload, PushSubscriptionInput } from "@/lib/push/send";
import { NotifyCronError, notifyCronChannels, requireNotifyCron } from "./config";
import { NOTIFY_EMAIL_FROM, renderNotifyEmail } from "./email";
import {
  notifyEmailGroups, notifyEmailVerdict, notifyFinishCalls, notifyIdempotencyKey,
  type NotifyEmailGroup, type NotifyFinishLists,
} from "./outcomes";
import { notifyClaimedQuery, notifyClaimedRows, type NotifyClaimedRow } from "./rows";
import { notifyOneLine, notifyPlainText, notifyRowText, notifyTemplateOf, notifyTranslator, type NotifyTranslator } from "./text";
import type { NotifyCronConfig, NotifyCronDeps, NotifyRecipient, NotifyRouteHandler } from "./types";

/** Of the route's 60 s maxDuration; the rest is for the finish calls of what was sent. */
export const NOTIFY_CRON_BUDGET_MS = 45_000;
/** Pushes start within this much of the run, so email keeps its share. */
export const NOTIFY_PUSH_BUDGET_MS = 20_000;
/** Rows leased per claim (the module caps a claim at 500 and a recipient at 20 a claim). */
export const NOTIFY_CLAIM_LIMIT = 200;
/** Claims per run: another only after a full batch, while there is time to deliver it. */
export const NOTIFY_CLAIMS_PER_RUN = 3;
export const NOTIFY_EMAILS_PER_RUN = 60;
export const NOTIFY_PUSH_PARALLEL = 16;
export const NOTIFY_LOOKUP_PARALLEL = 8;
/** = the module's NOTIFY_EMAIL_MAX_ATTEMPTS: a failure at this attempt gives the email up. */
const NOTIFY_EMAIL_MAX_ATTEMPTS = 3;
const NOTIFY_PUSH_TITLE_MAX = 140;
const NOTIFY_PUSH_BODY_MAX = 500;
const NO_STORE = { "Cache-Control": "private, no-store" };

export interface NotifyCronSummary {
  /** Rows the run held. */
  claimed: number;
  /** Rows whose push was reported (sent, or given up: push is one-shot). */
  pushed: number;
  /** Push messages the push services accepted. */
  pushSent: number;
  /** Subscriptions the push services reported gone. */
  pushExpired: number;
  /** Emails sent, one per recipient. */
  emails: number;
  /** Email rows by outcome. */
  emailed: number;
  emailRetry: number;
  emailFailed: number;
  emailDropped: number;
  /** The budget ran out before every row was tried. */
  stoppedEarly: boolean;
}

interface NotifyRun {
  /** The lease id of the batch in hand: each claim gets a fresh one. */
  runId: string;
  config: NotifyCronConfig;
  summary: NotifyCronSummary;
  overBudget(): boolean;
  pushOverBudget(): boolean;
  /** endpoint → the recipient it carries pushes for in this run. */
  endpointOwner: Map<string, string>;
  /** Endpoints a push service reported gone in this run. */
  gone: Set<string>;
  /** Emails this run may still try (NOTIFY_EMAILS_PER_RUN). */
  emailSlots: number;
  /** WorkOS or the email provider failed: no later batch claims email. */
  emailHalted: boolean;
}

/** Runs `work` over `items`, at most `limit` at a time. */
async function eachLimited<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async () => {
    while (next < items.length) await work(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

function countBy(keys: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts].map(([key, n]) => `${key}:${n}`).join(",");
}

export function createNotifyCronHandler(
  deps: NotifyCronDeps,
  opts: { budgetMs?: number; pushBudgetMs?: number } = {},
): NotifyRouteHandler {
  const budgetMs = opts.budgetMs ?? NOTIFY_CRON_BUDGET_MS;
  const pushBudgetMs = opts.pushBudgetMs ?? NOTIFY_PUSH_BUDGET_MS;
  const translators = new Map<string, NotifyTranslator>();
  const translatorFor = (locale: string): NotifyTranslator => {
    let tr = translators.get(locale);
    if (!tr) translators.set(locale, (tr = notifyTranslator(locale)));
    return tr;
  };

  /** Reports one outcome set; false when a call failed twice. */
  async function finish(run: NotifyRun, lists: NotifyFinishLists): Promise<boolean> {
    let ok = true;
    for (const call of notifyFinishCalls(lists)) {
      const args = [run.runId, JSON.stringify(call)];
      try {
        await deps.call("service_finish_notification_deliveries", args);
      } catch {
        try {
          await deps.call("service_finish_notification_deliveries", args);
        } catch (err) {
          ok = false;
          deps.log("error", "notify.finish_failed", { error: errorText(err) });
        }
      }
    }
    return ok;
  }

  function pushPayload(row: NotifyClaimedRow): PushPayload {
    const text = notifyRowText(translatorFor(row.locale), row);
    return {
      title: notifyOneLine(text.title, NOTIFY_PUSH_TITLE_MAX) || "Merchiva",
      body: notifyPlainText(text.body, NOTIFY_PUSH_BODY_MAX),
      link: safeAppPath(row.link),
      // Carried as the OS notification's data. Whether a focused tab already
      // alerted the row is that tab's answer (public/sw.js), not the type's.
      type: row.template === "chat.merchiva" ? "merchiva_reply" : notifyTemplateOf(row.template),
      id: row.notificationId,
    };
  }

  async function pushPhase(run: NotifyRun, rows: readonly NotifyClaimedRow[]): Promise<void> {
    if (rows.length === 0) return;
    // A browser endpoint carries one recipient's pushes per run: a stale row of
    // an account that used the browser before never gets another's alerts.
    const owner = run.endpointOwner;
    let shared = 0;
    const jobs = rows.map((row) => {
      const subs = row.pushTargets.filter((sub) => {
        const holder = owner.get(sub.endpoint);
        if (holder === undefined) owner.set(sub.endpoint, row.target);
        return holder === undefined || holder === row.target;
      });
      shared += row.pushTargets.length - subs.length;
      return { row, subs };
    });
    const pushed: string[] = [];
    const expired: Array<[string, string]> = [];
    const gone = run.gone;
    let skipped = 0;
    await eachLimited(jobs, NOTIFY_PUSH_PARALLEL, async ({ row, subs }) => {
      pushed.push(row.notificationId);
      if (run.pushOverBudget()) {
        skipped++;
        return;
      }
      const live: PushSubscriptionInput[] = subs.filter((sub) => !gone.has(sub.endpoint));
      if (live.length === 0) return;
      const result = await deps.push(live, pushPayload(row));
      run.summary.pushSent += result.sent;
      for (const endpoint of result.expired) {
        if (gone.has(endpoint)) continue;
        gone.add(endpoint);
        expired.push([row.notificationId, endpoint]);
      }
    });
    run.summary.pushed += pushed.length;
    run.summary.pushExpired += expired.length;
    if (skipped > 0) {
      run.summary.stoppedEarly = true;
      deps.log("warn", "notify.push.skipped_budget", { rows: skipped });
    }
    if (shared > 0) deps.log("warn", "notify.push.shared_endpoint", { endpoints: shared });
    await finish(run, { pushed, expired });
  }

  async function lookUp(run: NotifyRun, groups: readonly NotifyEmailGroup[]): Promise<Map<NotifyEmailGroup, NotifyRecipient>> {
    const found = new Map<NotifyEmailGroup, NotifyRecipient>();
    for (let i = 0; i < groups.length; i += NOTIFY_LOOKUP_PARALLEL) {
      if (run.overBudget()) {
        run.summary.stoppedEarly = true;
        break;
      }
      const batch = groups.slice(i, i + NOTIFY_LOOKUP_PARALLEL);
      const answers = await Promise.all(batch.map((group) => deps.resolveRecipient(group.subject)));
      batch.forEach((group, j) => found.set(group, answers[j]));
      const down = answers.find((answer) => answer.kind === "retry");
      if (down?.kind === "retry") {
        // WorkOS is failing: no more lookups this run; the rest wait for the next.
        run.emailHalted = true;
        deps.log("warn", "notify.email.lookup_unavailable", { reason: down.reason });
        break;
      }
    }
    return found;
  }

  async function emailPhase(run: NotifyRun, rows: readonly NotifyClaimedRow[]): Promise<void> {
    if (rows.length === 0) return;
    const report: Required<Pick<NotifyFinishLists, "emailed" | "emailRetry" | "emailFailed" | "emailDropped">> = {
      emailed: [], emailRetry: [], emailFailed: [], emailDropped: [],
    };
    const decided = new Set<string>();
    const dropReasons: string[] = [];
    const settle = (group: NotifyEmailGroup, list: keyof typeof report) => {
      for (const row of group.rows) {
        report[list].push(row.notificationId);
        decided.add(row.notificationId);
      }
    };
    const drop = (group: NotifyEmailGroup, reason: string) => {
      settle(group, "emailDropped");
      dropReasons.push(...group.rows.map(() => reason));
    };

    const ready: NotifyEmailGroup[] = [];
    let issuerLogged = false;
    for (const group of notifyEmailGroups(rows)) {
      if (!group.subject) {
        drop(group, "no_subject");
      } else if (!run.config.expectedIssuer || group.issuer !== run.config.expectedIssuer) {
        if (!issuerLogged) {
          issuerLogged = true;
          deps.log("error", "notify.email.issuer_mismatch", {
            seen: group.issuer.slice(0, 200), expected: run.config.expectedIssuer,
          });
        }
        drop(group, "issuer");
      } else {
        ready.push(group);
      }
    }
    const sendable = run.emailHalted ? [] : ready.slice(0, run.emailSlots);
    run.emailSlots -= sendable.length;
    const addresses = await lookUp(run, sendable);

    let providerDown = false;
    for (const group of sendable) {
      const who = addresses.get(group);
      if (who?.kind === "drop") {
        drop(group, who.reason);
        continue;
      }
      // Not looked up, WorkOS failing, the provider down or the budget spent: emailRetry below.
      if (who?.kind !== "ok" || providerDown) continue;
      if (run.overBudget()) {
        run.summary.stoppedEarly = true;
        continue;
      }
      const ids = group.rows.map((row) => row.notificationId);
      let email: ReturnType<typeof renderNotifyEmail>;
      try {
        email = renderNotifyEmail({ tr: translatorFor(group.locale), items: group.rows, appOrigin: notifyAppOrigin() });
      } catch (err) {
        // A bug in one email never holds up the others: counted as an attempt, backed off.
        settle(group, "emailFailed");
        deps.log("error", "notify.email.render_failed", { rows: ids.length, error: errorText(err) });
        continue;
      }
      const error = await deps.sendEmail({ from: NOTIFY_EMAIL_FROM, to: who.email, ...email }, notifyIdempotencyKey(ids));
      const verdict = notifyEmailVerdict(error);
      if (verdict === "sent") {
        run.summary.emails++;
        for (const id of ids) decided.add(id);
        run.summary.emailed += ids.length;
        // Reported at once, so a crash later in the run cannot send these rows again;
        // if that call fails they go with the final report.
        if (!(await finish(run, { emailed: ids }))) report.emailed.push(...ids);
      } else if (verdict === "retryStop") {
        providerDown = true;
        run.emailHalted = true;
        deps.log("error", "notify.email.provider_unavailable", {
          code: error?.name ?? "", status: error?.statusCode ?? 0,
        });
      } else if (verdict === "dropped") {
        drop(group, `provider_${error?.name ?? "rejected"}`);
      } else if (verdict === "failed") {
        settle(group, "emailFailed");
        const lastTry = group.rows.filter((row) => row.attempts >= NOTIFY_EMAIL_MAX_ATTEMPTS).length;
        deps.log(lastTry > 0 ? "error" : "warn", "notify.email.failed", {
          code: error?.name ?? "", status: error?.statusCode ?? 0, rows: group.rows.length, lastTry,
        });
      }
    }
    for (const row of rows) {
      if (!decided.has(row.notificationId)) report.emailRetry.push(row.notificationId);
    }
    run.summary.emailRetry += report.emailRetry.length;
    run.summary.emailFailed += report.emailFailed.length;
    run.summary.emailDropped += report.emailDropped.length;
    if (dropReasons.length > 0) {
      deps.log("error", "notify.email.dropped", { rows: dropReasons.length, reasons: countBy(dropReasons) });
    }
    await finish(run, report);
  }

  /** Leases a batch to `run.runId` for `channels`, then reads it back. */
  async function claimBatch(run: NotifyRun, channels: string): Promise<NotifyClaimedRow[]> {
    const query = notifyClaimedQuery(run.runId);
    try {
      await deps.call("service_claim_notification_deliveries", [run.runId, channels, NOTIFY_CLAIM_LIMIT]);
    } catch (err) {
      deps.log("error", "notify.claim_failed", { error: errorText(err) });
      throw new NotifyCronError("upstream", "Could not claim notification deliveries");
    }
    try {
      return notifyClaimedRows(await deps.sql(query));
    } catch (err) {
      // The leases expire on their own (5 minutes); the next runs pick the rows up.
      deps.log("error", "notify.read_failed", { error: errorText(err) });
      throw new NotifyCronError("upstream", "Could not read the claimed notification deliveries");
    }
  }

  return async (req) => {
    try {
      const config = deps.config();
      requireNotifyCron(req, config.cronSecret);
      const channels = notifyCronChannels(config, deps.pushReady());
      const started = deps.now();
      const run: NotifyRun = {
        runId: "",
        config,
        summary: {
          claimed: 0, pushed: 0, pushSent: 0, pushExpired: 0, emails: 0,
          emailed: 0, emailRetry: 0, emailFailed: 0, emailDropped: 0, stoppedEarly: false,
        },
        overBudget: () => deps.now() - started >= budgetMs,
        pushOverBudget: () => deps.now() - started >= pushBudgetMs,
        endpointOwner: new Map(),
        gone: new Set(),
        emailSlots: NOTIFY_EMAILS_PER_RUN,
        emailHalted: false,
      };
      let serve = channels;
      let claims = 0;
      while (serve) {
        run.runId = deps.randomUUID();
        let rows: NotifyClaimedRow[];
        try {
          rows = await claimBatch(run, serve);
        } catch (err) {
          // The first claim is the run; a later one failing (logged) ends it with what was delivered.
          if (claims === 0 || !(err instanceof NotifyCronError)) throw err;
          break;
        }
        claims++;
        run.summary.claimed += rows.length;
        const pushStarted = deps.now();
        await pushPhase(run, rows.filter((row) => row.push));
        const pushMs = deps.now() - pushStarted;
        await emailPhase(run, rows.filter((row) => row.email));
        if (rows.length < NOTIFY_CLAIM_LIMIT || claims >= NOTIFY_CLAIMS_PER_RUN || run.overBudget()) break;
        // Push again only if pushes taking as long as the last batch's still start
        // in time (a push past the push budget is lost); email only while it can go
        // out. A row owed on a channel left out waits a minute (NOTIFY_DEFER_MICROS).
        serve = (serve.includes("p") && deps.now() - started + pushMs < pushBudgetMs ? "p" : "")
          + (serve.includes("e") && !run.emailHalted && run.emailSlots > 0 ? "e" : "");
      }
      deps.log("info", "notify.done", { ...run.summary, channels, claims });
      return Response.json(run.summary, { headers: NO_STORE });
    } catch (err) {
      const failure = err instanceof NotifyCronError ? err : new NotifyCronError("upstream", "Notification delivery failed");
      if (!(err instanceof NotifyCronError)) deps.log("error", "notify.unexpected", { error: errorText(err) });
      return Response.json({ error: failure.message, code: failure.code }, { status: failure.status, headers: NO_STORE });
    }
  };
}

/** The message of anything thrown, at most 300 chars (SpacetimeDB errors carry no credentials). */
function errorText(err: unknown): string {
  const text = err instanceof Error ? err.message : typeof err === "string" ? err : "unknown error";
  return text.slice(0, 300);
}
