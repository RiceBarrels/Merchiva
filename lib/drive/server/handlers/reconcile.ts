// GET /api/cron/drive-reconcile — daily at 04:30 UTC (vercel.json). Compares the
// Blob store with the database, one organization folder at a time:
//
//   1. list({ prefix: 'org/', mode: 'folded' }), paged: the org folders
//      (`org/<uuid>/`), shuffled so a run cut short by the budget does not
//      always starve the same organizations.
//   2. Per org, pages of up to 1000 blobs: count them and their bytes. The Drive
//      keys of the page older than DRIVE_RECONCILE_ORPHAN_AGE_MS go to
//      service_enqueue_orphan_drive_blobs as `[{ k, s, u }]` (key, size,
//      uploadedAt ms). The MODULE decides which of them no row owns and queues
//      those for the GC cron; this route never calls a key an orphan. Keys that
//      are not Drive keys are counted but never sent.
//   3. After the org's last page: service_finish_drive_reconcile(org, bytes,
//      count) recomputes the org's drive_usage from its rows and stores the
//      measured totals for drift monitoring.
//   4. `[drive.orphan_brake]` (a page full of unknown keys: a store paired with
//      the wrong database) → the org goes in `braked`, its remaining pages and
//      its finish are skipped, and it is logged at error level. The module also
//      skips organizations it does not know.
//   5. More than DRIVE_PLATFORM_ALERT_BYTES in the store → an error-level log.
//
// Mode: `live` only on the production deployment (config.reconcileLive, i.e.
// VERCEL_ENV === "production") and without `?dryRun=1`. Otherwise `dry_run`:
// the store is listed and counted, and nothing is written. An org cut short
// (budget, a failed listing or a failed report) gets no finish, because its
// totals are incomplete. Auth: requireCron (gc.ts).

import { parseDriveBlobKey } from "@/lib/drive/rules";
import { errorResponse, reducerFailure } from "@/lib/drive/server/http";
import { failureText, requireCron } from "./gc";
import type { DriveListPage, DriveRouteHandler, DriveServerDeps } from "./types";

export interface DriveReconcileSummary {
  mode: "live" | "dry_run";
  /** Organization folders visited (fully or in part). */
  orgs: number;
  /** Blobs and bytes listed in those folders. */
  blobs: number;
  bytes: number;
  /** Keys sent to service_enqueue_orphan_drive_blobs (always 0 in dry_run). */
  sentKeys: number;
  /** Organizations whose report hit the module's orphan brake. */
  braked: string[];
  /** `bytes` exceeded DRIVE_PLATFORM_ALERT_BYTES. */
  alert: boolean;
  /** The budget ran out before every folder was listed. */
  stoppedEarly: boolean;
}

/** Of the route's 300 s maxDuration. */
export const DRIVE_RECONCILE_BUDGET_MS = 270_000;
/** = the module's DRIVE_ORPHAN_GRACE_MICROS (parity-tested): younger keys may belong to an upload in flight. */
export const DRIVE_RECONCILE_ORPHAN_AGE_MS = 24 * 60 * 60_000;
const LIST_PAGE_LIMIT = 1000;
const ORG_FOLDER_RE = /^org\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/;
const NO_STORE = { "Cache-Control": "private, no-store" };

type OrgOutcome = "done" | "braked" | "failed" | "stopped";

/** The organization id of a folded-listing folder (`org/<uuid>/`), else null. */
export function orgOfFolder(folder: string): string | null {
  return ORG_FOLDER_RE.exec(folder)?.[1] ?? null;
}

/** Fisher–Yates with an injectable random source. */
function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function createDriveReconcileHandler(
  deps: DriveServerDeps,
  opts: { budgetMs?: number; random?: () => number } = {},
): DriveRouteHandler {
  const budgetMs = opts.budgetMs ?? DRIVE_RECONCILE_BUDGET_MS;
  const random = opts.random ?? Math.random;

  /** Every org folder of the store; null when the budget ran out first. */
  async function listOrgFolders(overBudget: () => boolean): Promise<string[] | null> {
    const orgs = new Set<string>();
    let cursor: string | undefined;
    do {
      if (overBudget()) return null;
      let page: DriveListPage;
      try {
        page = await deps.blob.list({ prefix: "org/", mode: "folded", cursor, limit: LIST_PAGE_LIMIT });
      } catch (err) {
        deps.log("error", "drive.reconcile.list_failed", { prefix: "org/", error: failureText(err) });
        throw err;
      }
      for (const folder of page.folders) {
        const org = orgOfFolder(folder);
        if (org) orgs.add(org);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return [...orgs];
  }

  async function reconcileOrg(
    org: string,
    live: boolean,
    cutoff: number,
    summary: DriveReconcileSummary,
    overBudget: () => boolean,
  ): Promise<OrgOutcome> {
    let blobs = 0;
    let bytes = 0;
    let cursor: string | undefined;
    do {
      if (overBudget()) return "stopped";
      let page: DriveListPage;
      try {
        page = await deps.blob.list({ prefix: `org/${org}/`, cursor, limit: LIST_PAGE_LIMIT });
      } catch (err) {
        deps.log("error", "drive.reconcile.list_failed", { organizationId: org, error: failureText(err) });
        return "failed";
      }
      const pageBytes = page.blobs.reduce((sum, blob) => sum + blob.size, 0);
      blobs += page.blobs.length;
      bytes += pageBytes;
      summary.blobs += page.blobs.length;
      summary.bytes += pageBytes;

      const old = page.blobs
        .filter((blob) => blob.uploadedAt < cutoff && parseDriveBlobKey(blob.pathname)?.organizationId === org)
        .map((blob) => ({ k: blob.pathname, s: blob.size, u: blob.uploadedAt }));
      if (live && old.length > 0) {
        try {
          await deps.call("enqueueOrphans", { organizationId: org, blobsJson: JSON.stringify(old) });
          summary.sentKeys += old.length;
        } catch (err) {
          const failure = reducerFailure(err);
          if (failure.code === "orphan_brake") {
            deps.log("error", "drive.reconcile.orphan_brake", { organizationId: org, keys: old.length });
            return "braked";
          }
          deps.log("error", "drive.reconcile.report_failed", { organizationId: org, code: failure.code });
          return "failed";
        }
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    if (live) {
      try {
        await deps.call("finishReconcile", { organizationId: org, measuredBytes: bytes, measuredCount: blobs });
      } catch (err) {
        deps.log("error", "drive.reconcile.finish_failed", { organizationId: org, code: reducerFailure(err).code });
        return "failed";
      }
    }
    return "done";
  }

  return async (req) => {
    try {
      requireCron(deps, req);
      const config = deps.config();
      const dryRunAsked = new URL(req.url).searchParams.get("dryRun") === "1";
      const live = config?.reconcileLive === true && !dryRunAsked;
      const started = deps.now();
      const overBudget = () => deps.now() - started >= budgetMs;
      const cutoff = started - DRIVE_RECONCILE_ORPHAN_AGE_MS;
      const summary: DriveReconcileSummary = {
        mode: live ? "live" : "dry_run", orgs: 0, blobs: 0, bytes: 0, sentKeys: 0, braked: [], alert: false, stoppedEarly: false,
      };

      const folders = await listOrgFolders(overBudget);
      if (folders === null) summary.stoppedEarly = true;
      for (const org of shuffle(folders ?? [], random)) {
        if (overBudget()) {
          summary.stoppedEarly = true;
          break;
        }
        summary.orgs++;
        const outcome = await reconcileOrg(org, live, cutoff, summary, overBudget);
        if (outcome === "braked") summary.braked.push(org);
        if (outcome === "stopped") {
          summary.stoppedEarly = true;
          break;
        }
      }

      const threshold = config?.platformAlertBytes ?? null;
      if (threshold !== null && summary.bytes > threshold) {
        summary.alert = true;
        deps.log("error", "drive.platform_bytes_alert", { bytes: summary.bytes, threshold });
      }
      deps.log("info", "drive.reconcile.done", {
        mode: summary.mode, orgs: summary.orgs, blobs: summary.blobs, bytes: summary.bytes, sentKeys: summary.sentKeys,
        braked: summary.braked.length, alert: summary.alert, stoppedEarly: summary.stoppedEarly,
      });
      return deps.json(req, summary, { headers: NO_STORE });
    } catch (err) {
      return errorResponse(deps, req, err);
    }
  };
}
