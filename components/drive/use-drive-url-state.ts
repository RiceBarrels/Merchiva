"use client";

// Drive home view state: `?space=&folder=&member=&source=&type=&sort=&view=&q=&preview=`
// (components/drive/model/url-state.ts), so reloads and tab history restore the view.
//
// Writes use the native History API, which Next.js syncs into `useSearchParams` without a
// server round trip (node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md,
// "Native History API"); the browser shell's history bridge records them like any other.
// Opening a section, a folder, a member's files, an app source or a preview pushes an entry,
// so Back returns to where the person was; filters and sort replace it. Closing a preview this
// hook opened steps Back to the entry under it (a replace would leave two identical entries, and
// the next Back would seem to do nothing); a preview reached another way closes by replacing.
//
// The search box keeps a local draft that the URL follows after a short delay; the rules
// (echoes of our own writes, back/forward, a folder write clearing the search) are
// lib/url-state/query-sync.ts's. Grid or list is a per-viewer preference (localStorage
// "drive_view", list by default on phones) unless the URL names one.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocalPref } from "@/components/docs/home/use-local-pref";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  afterOwnWrite,
  initialQuerySync,
  planDebouncedQueryWrite,
  planSearchWrite,
  reconcileQuery,
  type QuerySync,
  type SearchWritePlan,
} from "@/lib/url-state/query-sync";
import { DRIVE_VIEWS, type DriveSort, type DriveView } from "./model/types";
import { DRIVE_CODEC, defaultSortFor, parseDriveParams, type DriveUrlParams } from "./model/url-state";

const VIEW_PREF_KEY = "drive_view";
const QUERY_WRITE_DELAY_MS = 300;
/** A second close within this window of a Back already sent is the same close (the popstate is still on its way). */
const BACK_SETTLE_MS = 1000;

export type DriveHistoryMode = "push" | "replace";

export interface DriveUrlState extends Omit<DriveUrlParams, "q" | "view" | "sort"> {
  /** Search text as typed; listing uses it at once, the URL follows after a short delay. */
  query: string;
  /** The URL's view, else the viewer's saved one, else grid (list on phones). */
  view: DriveView;
  /** The URL's sort, else the section's default. */
  sort: DriveSort;
  /**
   * Applies `patch` to the URL; `mode` defaults to historyModeFor(patch). A replace that closes a
   * preview this hook opened (`preview: ""`, nothing else changed) steps Back to the entry under it.
   */
  go(patch: Partial<DriveUrlParams>, mode?: DriveHistoryMode): void;
  setQuery(q: string): void;
  /** Saves the viewer's layout; a view named in the URL is dropped so the choice shows. */
  setView(v: DriveView): void;
  /** Clears the search and the type filter. */
  clearFilters(): void;
}

/** Push when the patch goes somewhere (a section, folder, member, app source, or a preview opening); else replace. */
export function historyModeFor(patch: Partial<DriveUrlParams>): DriveHistoryMode {
  if (patch.space !== undefined || patch.folder !== undefined || patch.member !== undefined || patch.source !== undefined) {
    return "push";
  }
  return patch.preview ? "push" : "replace";
}

/**
 * `history.state` field of an entry this hook pushed to show a preview. Next's history patch and
 * the browser shell's bridge both keep custom fields (app-router.js copyNextJsInternalHistoryState,
 * lib/browser-shell/history-bridge.ts withStamp), and the browser keeps them across a reload.
 */
export const PREVIEW_MARK_FIELD = "__drivePreview";

export interface DrivePreviewMark {
  /** History entries between this one and the entry the preview was opened over. */
  readonly depth: number;
  /** `location.search` of that entry. */
  readonly base: string;
}

export function readPreviewMark(state: unknown): DrivePreviewMark | null {
  if (typeof state !== "object" || state === null) return null;
  const raw: unknown = (state as Record<string, unknown>)[PREVIEW_MARK_FIELD];
  if (typeof raw !== "object" || raw === null) return null;
  const { depth, base } = raw as Record<string, unknown>;
  return typeof depth === "number" && Number.isInteger(depth) && depth > 0 && typeof base === "string" ? { depth, base } : null;
}

/**
 * The mark of the entry written with `nextSearch` over the current one (`liveSearch`, marked
 * `current`). Only an entry that shows a preview carries one: a replace keeps the current mark,
 * a push over an entry without a preview starts one and a push over a marked preview adds a
 * level. A push over an unmarked preview (a deep link) has no known entry to go back to.
 */
export function nextPreviewMark(
  current: DrivePreviewMark | null,
  liveSearch: string,
  nextSearch: string,
  mode: DriveHistoryMode,
): DrivePreviewMark | null {
  if (DRIVE_CODEC.parse(nextSearch).preview === "") return null;
  if (mode === "replace") return current;
  if (current) return { depth: current.depth + 1, base: current.base };
  return DRIVE_CODEC.parse(liveSearch).preview === "" ? { depth: 1, base: liveSearch } : null;
}

/** The same params, in any order. */
function sameSearch(a: string, b: string): boolean {
  const left = new URLSearchParams(a);
  const right = new URLSearchParams(b);
  left.sort();
  right.sort();
  return left.toString() === right.toString();
}

/**
 * How many entries Back goes to close the preview of an entry marked `mark`: its depth when the
 * close would write exactly the search of the entry under the preview, else 0 (replace instead,
 * so a filter changed while previewing is not lost).
 */
export function previewCloseSteps(mark: DrivePreviewMark | null, closedSearch: string): number {
  return mark !== null && sameSearch(mark.base, closedSearch) ? mark.depth : 0;
}

function writeHistory(liveSearch: string, plan: SearchWritePlan, mode: DriveHistoryMode): void {
  const mark = nextPreviewMark(readPreviewMark(window.history.state), liveSearch, plan.search, mode);
  const state = mark ? { [PREVIEW_MARK_FIELD]: mark } : null;
  const url = `${window.location.pathname}${plan.search}`;
  if (mode === "push") window.history.pushState(state, "", url);
  else window.history.replaceState(state, "", url);
}

export function useDriveUrlState(): DriveUrlState {
  const searchParams = useSearchParams();
  const params = parseDriveParams(searchParams);
  const urlKey = DRIVE_CODEC.key(params);
  const urlQuery = params.q;

  const [storedSync, setSync] = useState<QuerySync>(() => initialQuerySync(DRIVE_CODEC, params));
  const sync = reconcileQuery(DRIVE_CODEC, storedSync, params);
  // Adjust-state-during-render: a URL change (back/forward, a link) adopts its `q` unless it is our own echo.
  if (sync !== storedSync) setSync(sync);
  const draft = sync.draft;

  /** Writes `patch` into the live URL and records the result as our own echo. */
  const commit = useCallback((patch: Partial<DriveUrlParams>, mode: DriveHistoryMode) => {
    if (typeof window === "undefined") return;
    const liveSearch = window.location.search;
    const plan = planSearchWrite(DRIVE_CODEC, liveSearch, patch);
    if (!plan) return;
    setSync((prev) => afterOwnWrite(DRIVE_CODEC, prev, liveSearch, patch, plan));
    writeHistory(liveSearch, plan, mode);
  }, []);

  /** The Back sent to close a preview, until its popstate lands (a double close must not go back twice). */
  const pendingBack = useRef<{ search: string; at: number } | null>(null);
  /** Closes the preview by stepping Back when the entry under it is exactly what the close would write. */
  const closeByBack = useCallback((patch: Partial<DriveUrlParams>): boolean => {
    if (typeof window === "undefined") return false;
    const liveSearch = window.location.search;
    const pending = pendingBack.current;
    if (pending && pending.search === liveSearch && Date.now() - pending.at < BACK_SETTLE_MS) return true;
    const plan = planSearchWrite(DRIVE_CODEC, liveSearch, patch);
    const steps = plan ? previewCloseSteps(readPreviewMark(window.history.state), plan.search) : 0;
    if (steps === 0) return false;
    pendingBack.current = { search: liveSearch, at: Date.now() };
    window.history.go(-steps);
    return true;
  }, []);

  useEffect(() => {
    if (draft === urlQuery) return;
    const timer = window.setTimeout(() => {
      const liveSearch = window.location.search;
      const plan = planDebouncedQueryWrite(DRIVE_CODEC, {
        draft,
        renderedKey: urlKey,
        renderedQuery: urlQuery,
        liveSearch,
      });
      if (!plan) return;
      setSync((prev) => afterOwnWrite(DRIVE_CODEC, prev, liveSearch, { q: draft }, plan));
      writeHistory(liveSearch, plan, "replace");
    }, QUERY_WRITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, urlQuery, urlKey]);

  const isMobile = useIsMobile();
  const [storedView, setStoredView] = useLocalPref(VIEW_PREF_KEY);
  const savedView = (DRIVE_VIEWS as readonly string[]).includes(storedView ?? "") ? (storedView as DriveView) : null;
  const view: DriveView = params.view || savedView || (isMobile ? "list" : "grid");
  const sort: DriveSort = params.sort || defaultSortFor(params.space);
  const urlView = params.view;

  const go = useCallback(
    (patch: Partial<DriveUrlParams>, mode: DriveHistoryMode = historyModeFor(patch)) => {
      if (mode === "push") {
        // Record the typed search on the entry being left, so Back shows it; a folder write then clears it.
        commit({ q: draft }, "replace");
        commit(patch, "push");
        return;
      }
      // Carry the typed search along, so a pending debounce isn't lost; opening a folder clears it on purpose.
      const next = patch.q === undefined && patch.folder === undefined ? { ...patch, q: draft } : patch;
      if (patch.preview === "" && closeByBack(next)) return;
      commit(next, "replace");
    },
    [commit, closeByBack, draft],
  );
  const setQuery = useCallback((next: string) => setSync((prev) => ({ ...prev, draft: next })), []);
  const setView = useCallback(
    (next: DriveView) => {
      setStoredView(next);
      if (urlView !== "") commit({ view: "", q: draft }, "replace");
    },
    [setStoredView, urlView, commit, draft],
  );
  const clearFilters = useCallback(() => {
    setSync((prev) => ({ ...prev, draft: "" }));
    commit({ q: "", type: "all" }, "replace");
  }, [commit]);

  const { space, folder, member, source, type, preview } = params;
  return useMemo(
    () => ({ space, folder, member, source, type, preview, query: draft, view, sort, go, setQuery, setView, clearFilters }),
    [space, folder, member, source, type, preview, draft, view, sort, go, setQuery, setView, clearFilters],
  );
}
