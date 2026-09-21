// Bug reports — the shape shared by /manager/bugs and the "Report a bug" lite
// app on /store and /personal. Reporting is deliberately open to everyone on
// the team, so all three surfaces file the same row with the same captured
// context; only triage (status, severity, resolution note) is manager-only.
//
// No React here: the row mapper, the sort order and the context capture are
// the parts both surfaces must agree on.

import type { StatusTone } from "@/components/ui/status-badge";

export type BugSeverity = "low" | "normal" | "high" | "blocker";
export type BugStatus = "open" | "in_progress" | "fixed" | "wont_fix";
/** Where the reporter hit the bug, not where they filed it. */
export type BugSurface = "manager" | "store" | "personal";

export const BUG_SEVERITIES: readonly BugSeverity[] = ["low", "normal", "high", "blocker"];
export const BUG_STATUSES: readonly BugStatus[] = ["open", "in_progress", "fixed", "wont_fix"];

/** Reports still owed an answer, newest first in every list. */
export const OPEN_BUG_STATUSES: readonly BugStatus[] = ["open", "in_progress"];

export interface BugReport {
  id: string;
  organizationId: string;
  /** Identity hex of whoever filed it — matches the signed-in user's own. */
  reporterIdHex: string;
  reporterMemberId: string;
  reporterName: string;
  title: string;
  body: string;
  severity: BugSeverity;
  status: BugStatus;
  surface: BugSurface;
  route: string;
  appVersion: string;
  userAgent: string;
  screenshotUrl: string | null;
  /** YYYY-MM-DD the report was filed. */
  date: string;
  resolutionNote: string;
  resolvedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Context captured automatically, so the reporter only types what happened. */
export interface BugContext {
  surface: BugSurface;
  route: string;
  appVersion: string;
  userAgent: string;
}

export function isBugSeverity(v: string): v is BugSeverity {
  return (BUG_SEVERITIES as readonly string[]).includes(v);
}

export function isBugStatus(v: string): v is BugStatus {
  return (BUG_STATUSES as readonly string[]).includes(v);
}

/** Open = still someone's problem. Drives the counts on every surface. */
export function isBugOpen(status: BugStatus): boolean {
  return status === "open" || status === "in_progress";
}

export const BUG_STATUS_TONE: Record<BugStatus, StatusTone> = {
  open: "warning",
  in_progress: "info",
  fixed: "success",
  wont_fix: "neutral",
};

export const BUG_SEVERITY_TONE: Record<BugSeverity, StatusTone> = {
  low: "neutral",
  normal: "neutral",
  high: "warning",
  blocker: "danger",
};

const SEVERITY_RANK: Record<BugSeverity, number> = { blocker: 0, high: 1, normal: 2, low: 3 };

/**
 * Triage order: open before closed, then worst severity, then newest. A
 * blocker filed this morning is what a manager opening the page needs first.
 */
export function compareBugs(a: BugReport, b: BugReport): number {
  const openDiff = Number(isBugOpen(b.status)) - Number(isBugOpen(a.status));
  if (openDiff !== 0) return openDiff;
  const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (sev !== 0) return sev;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

/** Local YYYY-MM-DD — the report's day as the reporter experienced it. */
export function bugDateStr(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The build the report came from. Inlined at build time by next.config.ts;
 * empty in a dev server that predates it, which reads as "unknown" in the UI.
 */
export function appVersion(): string {
  return process.env.NEXT_PUBLIC_APP_VERSION ?? "";
}

/** Everything about the reporter's session worth attaching to a report. */
export function captureBugContext(surface: BugSurface, route?: string): BugContext {
  const path = route ?? (typeof window === "undefined" ? "" : window.location.pathname);
  return {
    surface,
    route: path,
    appVersion: appVersion(),
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** SpacetimeDB id / identity column → string. */
function idStr(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v.toHexString === "function") return v.toHexString();
  return String(v);
}

/** SpacetimeDB timestamp → Date. Handles {microsSinceUnixEpoch} and .toDate(). */
function tsToDate(v: any): Date {
  if (v == null) return new Date(0);
  if (typeof v === "object") {
    if (typeof v.toDate === "function") {
      try { return v.toDate(); } catch { return new Date(0); }
    }
    const micros = v.microsSinceUnixEpoch;
    if (typeof micros === "bigint") return new Date(Number(micros / 1000n));
    if (typeof micros === "number") return new Date(micros / 1000);
  }
  const ms = Date.parse(String(v));
  return Number.isFinite(ms) ? new Date(ms) : new Date(0);
}

/** One `bug_report` row → the shape both surfaces render. */
export function mapBugRow(row: any): BugReport {
  const severity = String(row.severity ?? "");
  const status = String(row.status ?? "");
  const surface = String(row.surface ?? "");
  const screenshotUrl = String(row.screenshotUrl ?? "");
  return {
    id: idStr(row.id),
    organizationId: String(row.organizationId ?? ""),
    reporterIdHex: idStr(row.reporterId),
    reporterMemberId: String(row.reporterMemberId ?? ""),
    reporterName: String(row.reporterName ?? ""),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    severity: isBugSeverity(severity) ? severity : "normal",
    status: isBugStatus(status) ? status : "open",
    surface: surface === "store" || surface === "personal" ? surface : "manager",
    route: String(row.route ?? ""),
    appVersion: String(row.appVersion ?? ""),
    userAgent: String(row.userAgent ?? ""),
    screenshotUrl: screenshotUrl || null,
    date: String(row.date ?? ""),
    resolutionNote: String(row.resolutionNote ?? ""),
    resolvedByName: String(row.resolvedByName ?? ""),
    createdAt: tsToDate(row.createdAt),
    updatedAt: tsToDate(row.updatedAt),
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
