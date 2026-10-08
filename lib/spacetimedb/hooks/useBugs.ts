"use client";

// Bug reports for the active org.
//
// Two hooks, used by all three surfaces so they can never disagree:
//   useBugs()          — mapped rows, triage order, counts, who may triage.
//   useBugReportDraft() — the report form's state, screenshot upload and submit.
//
// When the client's bindings are older than the deployed module `useBugReports()`
// returns an empty, never-ready tuple, so screens render their empty state
// instead of spinning forever (same guard as the docs hooks).

import { useCallback, useMemo, useState } from "react";
import {
  captureBugContext,
  compareBugs,
  isBugOpen,
  mapBugRow,
  type BugReport,
  type BugSeverity,
  type BugStatus,
  type BugSurface,
} from "@/lib/bugs";
import { usePermissions } from "@/lib/context/permissions";
import { appUploadErrorKey, uploadAppFiles } from "@/lib/storage/app-upload";
import { reportBug } from "@/lib/spacetimedb/actions";
import { useBugReports, useSpacetimeDB } from "@/lib/spacetimedb/hooks";

export interface BugCounts {
  all: number;
  open: number;
  in_progress: number;
  fixed: number;
  wont_fix: number;
}

export interface UseBugsResult {
  /** Every report for this org, in triage order (open · worst · newest). */
  bugs: BugReport[];
  /** Only the signed-in person's own reports, same order. */
  mine: BugReport[];
  counts: BugCounts;
  /** Still owed an answer — the number every surface leads with. */
  openCount: number;
  /** Owners and managers triage; everyone else reads and reports. */
  canTriage: boolean;
  isReady: boolean;
}

export function useBugs(): UseBugsResult {
  const { organizationId, role } = usePermissions();
  const stdb = useSpacetimeDB();
  const [rows, isReady] = useBugReports();
  const identityHex = stdb?.identity?.toHexString?.() ?? null;

  const bugs = useMemo(() => {
    if (!organizationId) return [];
    return rows
      .map(mapBugRow)
      .filter((b) => b.organizationId === organizationId)
      .sort(compareBugs);
  }, [rows, organizationId]);

  const mine = useMemo(
    () => (identityHex ? bugs.filter((b) => b.reporterIdHex === identityHex) : []),
    [bugs, identityHex],
  );

  const counts = useMemo(() => {
    const out: BugCounts = { all: bugs.length, open: 0, in_progress: 0, fixed: 0, wont_fix: 0 };
    for (const b of bugs) out[b.status] += 1;
    return out;
  }, [bugs]);

  return {
    bugs,
    mine,
    counts,
    openCount: useMemo(() => bugs.filter((b) => isBugOpen(b.status)).length, [bugs]),
    canTriage: role === "owner" || role === "manager",
    isReady,
  };
}

/** A screenshot the reporter attached, once it has been uploaded. */
export interface BugScreenshot {
  url: string;
  name: string;
}

export interface UseBugReportDraftResult {
  title: string;
  setTitle: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  severity: BugSeverity;
  setSeverity: (v: BugSeverity) => void;
  screenshot: BugScreenshot | null;
  /** Upload a picked file; resolves null, or the `error` it set on failure ("upload" | "quota"). */
  attach: (file: File) => Promise<BugDraftError | null>;
  removeScreenshot: () => void;
  uploading: boolean;
  submitting: boolean;
  /** True once the title has something in it. */
  canSubmit: boolean;
  /** Files the picker should offer. */
  accept: string;
  /** Sends the report; resolves false and sets `error` on failure. */
  submit: (route?: string) => Promise<boolean>;
  reset: () => void;
  /** "upload" | "quota" | "submit" | "title" — the caller picks the wording. */
  error: BugDraftError | null;
  clearError: () => void;
}

/** "quota": the store is out of storage (appUpload.quotaExceeded). */
export type BugDraftError = "upload" | "quota" | "submit" | "title";

/** 8MB is the `generalFile` image limit in app/api/uploadthing/core.ts. */
const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;

/**
 * The report form, shared by the manager dialog and the device app. `surface`
 * is where the reporter hit the bug; the route, build and user agent are
 * captured at submit time so they describe the moment, not the form.
 */
export function useBugReportDraft(surface: BugSurface): UseBugReportDraftResult {
  const { organizationId } = usePermissions();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<BugSeverity>("normal");
  const [screenshot, setScreenshot] = useState<BugScreenshot | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<BugDraftError | null>(null);

  const reset = useCallback(() => {
    setTitle("");
    setBody("");
    setSeverity("normal");
    setScreenshot(null);
    setError(null);
  }, []);

  const attach = useCallback(
    async (file: File) => {
      if (file.size > SCREENSHOT_MAX_BYTES || !organizationId) {
        setError("upload");
        return "upload";
      }
      setUploading(true);
      setError(null);
      try {
        const res = await uploadAppFiles("generalFile", { files: [file], organizationId, source: "bugs" });
        const url = (res?.[0]?.serverData as { url?: string } | undefined)?.url;
        if (!url) throw new Error("upload returned no url");
        setScreenshot({ url, name: file.name });
        return null;
      } catch (err) {
        console.error("Bug screenshot upload failed:", err);
        const problem: BugDraftError = appUploadErrorKey(err) === "appUpload.quotaExceeded" ? "quota" : "upload";
        setError(problem);
        return problem;
      } finally {
        setUploading(false);
      }
    },
    [organizationId],
  );

  const submit = useCallback(
    async (route?: string) => {
      if (!title.trim()) {
        setError("title");
        return false;
      }
      setSubmitting(true);
      setError(null);
      try {
        await reportBug({
          title,
          body,
          severity,
          context: captureBugContext(surface, route),
          screenshotUrl: screenshot?.url ?? null,
        });
        reset();
        return true;
      } catch (err) {
        console.error("Bug report failed:", err);
        setError("submit");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [title, body, severity, surface, screenshot, reset],
  );

  return {
    title,
    setTitle,
    body,
    setBody,
    severity,
    setSeverity,
    screenshot,
    attach,
    removeScreenshot: useCallback(() => setScreenshot(null), []),
    uploading,
    submitting,
    canSubmit: title.trim().length > 0,
    accept: "image/*",
    submit,
    reset,
    error,
    clearError: useCallback(() => setError(null), []),
  };
}

/** Status values a manager may move a report to, in the order shown. */
export const TRIAGE_STATUSES: readonly BugStatus[] = ["open", "in_progress", "fixed", "wont_fix"];
