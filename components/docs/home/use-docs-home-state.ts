"use client";

// Docs home view state.
//
// Scope, owner, sort and search live in the URL (`?scope=&owner=&sort=&q=`) so
// tab history and reloads restore them. They are written with the native History
// API, which Next.js syncs into `useSearchParams` without a server round trip
// (node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md,
// "Native History API"); the browser shell's history bridge records those writes
// like any other. Scope changes push an entry, everything else replaces.
//
// The search box keeps a local draft that the URL follows after a short delay;
// query-sync.ts has the reconciliation rules.
//
// Grid/list and the collapsed template row are per-viewer localStorage prefs.
//
// A device panel (/store, /personal) renders the same screen without a URL of its
// own — writing there would rewrite the device's address and make the back button
// undo a filter — so it passes `url: false` and the same state lives in React for
// as long as the panel is open.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  DEFAULT_OWNER_FILTER,
  parseDocsHomeParams,
  type DocScope,
  type DocSort,
  type DocView,
  type DocsHomeParams,
  type OwnerFilter,
} from "./doc-list-model";
import {
  docsHomeKey,
  initialDocsQuerySync,
  planDebouncedQueryWrite,
  planDocsHomeWrite,
  reconcileDocsQuery,
  type DocsHomeWritePlan,
  type DocsQuerySync,
} from "./query-sync";
import { useLocalPref } from "./use-local-pref";

const VIEW_PREF_KEY = "docs_view";
const TEMPLATES_PREF_KEY = "docs_templates_collapsed";
const QUERY_WRITE_DELAY_MS = 300;

type WriteMode = "push" | "replace";

function writeHistory(plan: DocsHomeWritePlan, mode: WriteMode): void {
  const url = `${window.location.pathname}${plan.search}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

export interface DocsHomeState {
  scope: DocScope;
  owner: OwnerFilter;
  sort: DocSort;
  /** Search text as typed; filtering uses it immediately, the URL follows after a short delay. */
  query: string;
  view: DocView;
  templatesCollapsed: boolean;
  setScope(scope: DocScope): void;
  setOwner(owner: OwnerFilter): void;
  setSort(sort: DocSort): void;
  setQuery(query: string): void;
  /** Clears the search and the owner filter. */
  clearFilters(): void;
  setView(view: DocView): void;
  toggleTemplates(): void;
}

export interface DocsHomeStateOptions {
  /** Keep scope / owner / sort / search in the URL. False for a device panel,
   *  which has no URL of its own (see the note at the top). */
  url?: boolean;
}

export function useDocsHomeState({ url = true }: DocsHomeStateOptions = {}): DocsHomeState {
  const searchParams = useSearchParams();
  const [panelParams, setPanelParams] = useState<DocsHomeParams>(() => parseDocsHomeParams(new URLSearchParams()));
  const params = url ? parseDocsHomeParams(searchParams) : panelParams;
  const { scope, owner, sort, q: urlQuery } = params;
  const urlKey = docsHomeKey(params);

  const [storedSync, setSync] = useState<DocsQuerySync>(() => initialDocsQuerySync(params));
  // Off the URL nothing else can change the params, so there is no echo to tell apart.
  const sync = url ? reconcileDocsQuery(storedSync, params) : storedSync;
  if (sync !== storedSync) setSync(sync);
  const draft = sync.draft;

  /** Writes `patch` into the live URL (or the panel's own state) and marks the result as our own echo. */
  const commit = useCallback(
    (patch: Partial<DocsHomeParams>, mode: WriteMode) => {
      if (!url) {
        setPanelParams((prev) => ({ ...prev, ...patch }));
        return;
      }
      if (typeof window === "undefined") return;
      const plan = planDocsHomeWrite(window.location.search, patch);
      if (!plan) return;
      setSync((prev) => ({ ...prev, echoKey: plan.key }));
      writeHistory(plan, mode);
    },
    [url],
  );

  useEffect(() => {
    // The panel's search box is the source of truth; nothing to debounce into.
    if (!url) return;
    if (draft === urlQuery) return;
    const timer = window.setTimeout(() => {
      const plan = planDebouncedQueryWrite({
        draft,
        renderedKey: urlKey,
        renderedQuery: urlQuery,
        liveSearch: window.location.search,
      });
      if (!plan) return;
      setSync((prev) => ({ ...prev, echoKey: plan.key }));
      writeHistory(plan, "replace");
    }, QUERY_WRITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [url, draft, urlQuery, urlKey]);

  const isMobile = useIsMobile();
  const [storedView, setStoredView] = useLocalPref(VIEW_PREF_KEY);
  const view: DocView = storedView === "grid" || storedView === "list" ? storedView : isMobile ? "list" : "grid";
  const [collapsedPref, setCollapsedPref] = useLocalPref(TEMPLATES_PREF_KEY);
  const templatesCollapsed = collapsedPref === "1";

  // Filter changes carry the typed search along, so it isn't left behind by a pending
  // debounce. A scope change first records it on the entry being left, then pushes.
  const setScope = useCallback(
    (next: DocScope) => {
      commit({ q: draft }, "replace");
      commit({ scope: next }, "push");
    },
    [commit, draft],
  );
  const setOwner = useCallback((next: OwnerFilter) => commit({ owner: next, q: draft }, "replace"), [commit, draft]);
  const setSort = useCallback((next: DocSort) => commit({ sort: next, q: draft }, "replace"), [commit, draft]);
  const setQuery = useCallback((next: string) => setSync((prev) => ({ ...prev, draft: next })), []);
  const clearFilters = useCallback(() => {
    setSync((prev) => ({ ...prev, draft: "" }));
    commit({ q: "", owner: DEFAULT_OWNER_FILTER }, "replace");
  }, [commit]);
  const setView = useCallback((next: DocView) => setStoredView(next), [setStoredView]);
  const toggleTemplates = useCallback(
    () => setCollapsedPref(templatesCollapsed ? null : "1"),
    [setCollapsedPref, templatesCollapsed],
  );

  return useMemo(
    () => ({
      scope,
      owner,
      sort,
      query: draft,
      view,
      templatesCollapsed,
      setScope,
      setOwner,
      setSort,
      setQuery,
      clearFilters,
      setView,
      toggleTemplates,
    }),
    [scope, owner, sort, draft, view, templatesCollapsed, setScope, setOwner, setSort, setQuery, clearFilters, setView, toggleTemplates],
  );
}
