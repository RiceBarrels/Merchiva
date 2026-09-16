// Docs home search box <-> URL `q` reconciliation. Pure; driven by use-docs-home-state.ts
// and exercised by scripts/tests/docs/home-query-sync.test.ts.
//
// The box keeps a local draft so typing never waits for the URL; the URL follows after
// a short debounce. The page stays mounted across search-param changes and same-page
// browser-shell tab switches (PageTransition is keyed by pathname), so the draft must
// tell our own URL writes apart from everything else (back/forward, a link, another
// tab on the docs home):
//
//   - Every own write records the home-params key it produces (`echoKey`). The next
//     change of those params is compared with it once and the marker is dropped either
//     way, so only the immediate echo of a write is ignored. An echo keeps the draft,
//     which may already be ahead of what was written.
//   - Any other change of the home params adopts the URL's `q`.
//   - Params the home doesn't own (DynamicUIElement's `dialogs`) never touch the draft.
//   - A debounced write only lands while the live URL still shows the params it was
//     scheduled against, so it can't leak into another tab or history entry.

import { mergeDocsHomeSearch, parseDocsHomeParams, type DocsHomeParams } from "./doc-list-model";

/** Identity of the home-owned params (scope, owner, sort, q) of a URL. */
export function docsHomeKey(params: DocsHomeParams): string {
  return JSON.stringify([params.scope, params.owner, params.sort, params.q]);
}

export function docsHomeKeyFromSearch(search: string): string {
  return docsHomeKey(parseDocsHomeParams(new URLSearchParams(search)));
}

export interface DocsQuerySync {
  /** Search text as typed. */
  readonly draft: string;
  /** Home-params key of the URL this state last reconciled with. */
  readonly syncedKey: string;
  /** Key our last own history write produced, until the next URL change consumes it. */
  readonly echoKey: string | null;
}

export function initialDocsQuerySync(params: DocsHomeParams): DocsQuerySync {
  return { draft: params.q, syncedKey: docsHomeKey(params), echoKey: null };
}

/** Reconciles with the rendered URL; returns `state` itself when nothing changed. */
export function reconcileDocsQuery(state: DocsQuerySync, params: DocsHomeParams): DocsQuerySync {
  const key = docsHomeKey(params);
  if (key === state.syncedKey) return state;
  const isEcho = state.echoKey === key;
  return { draft: isEcho ? state.draft : params.q, syncedKey: key, echoKey: null };
}

export interface DocsHomeWritePlan {
  /** New `location.search` ("" or "?…"). */
  readonly search: string;
  /** Home-params key of `search`, to record as the echo marker. */
  readonly key: string;
}

/** Applies `patch` to the live search; null when the URL wouldn't change. */
export function planDocsHomeWrite(liveSearch: string, patch: Partial<DocsHomeParams>): DocsHomeWritePlan | null {
  const next = mergeDocsHomeSearch(liveSearch, patch);
  if (new URLSearchParams(next).toString() === new URLSearchParams(liveSearch).toString()) return null;
  return { search: next, key: docsHomeKeyFromSearch(next) };
}

export interface DebouncedQueryWriteInput {
  readonly draft: string;
  /** Home-params key and `q` of the render that scheduled the write. */
  readonly renderedKey: string;
  readonly renderedQuery: string;
  /** `window.location.search` when the timer fires. */
  readonly liveSearch: string;
}

/**
 * The write a debounce timer should make, or null. The live URL can be ahead of the
 * rendered one (a tab switch or back/forward whose render hasn't landed yet); the write
 * is dropped then; that render reconciles the draft and schedules again if needed.
 */
export function planDebouncedQueryWrite(input: DebouncedQueryWriteInput): DocsHomeWritePlan | null {
  if (input.draft === input.renderedQuery) return null;
  if (docsHomeKeyFromSearch(input.liveSearch) !== input.renderedKey) return null;
  return planDocsHomeWrite(input.liveSearch, { q: input.draft });
}
