// Search box <-> URL `q` reconciliation for any page whose view lives in the query string. Pure;
// the page's hook drives it (the Drive home: components/drive/use-drive-url-state.ts) and
// scripts/tests/drive/query-sync.test.ts exercises it.
//
// The algorithm, generic over a SearchCodec:
//
//   - The box keeps a local draft so typing never waits for the URL; the URL follows after a
//     short debounce.
//   - Every own write records the key of the page params it produces (`echoKey`, through
//     afterOwnWrite). The next change of those params is compared with it once and the marker is
//     dropped either way, so only the immediate echo of a write is ignored. An echo keeps the
//     draft, which may already be ahead of what was written.
//   - Any other change of the page params (back/forward, a link, another tab on the same page)
//     adopts the URL's `q`. Params the page doesn't own (DynamicUIElement's `dialogs`) never
//     touch the draft: the codec's key leaves them out.
//   - A debounced write only lands while the live URL still shows the params it was scheduled
//     against, so it can't leak into another tab or history entry.

/** How a page reads and writes its own params in a `location.search` string. */
export interface SearchCodec<P extends { q: string }> {
  /** Params of a search string ("" or "?…"); unknown values fall back to defaults. */
  parse(search: string): P;
  /** `search` with `patch` applied, defaults dropped and foreign params kept ("" or "?…"). */
  merge(search: string, patch: Partial<P>): string;
  /** Identity of the page-owned params; equal views give equal keys. */
  key(params: P): string;
}

export interface QuerySync {
  /** Search text as typed. */
  readonly draft: string;
  /** Page-params key of the URL this state last reconciled with. */
  readonly syncedKey: string;
  /** Key our last own history write produced, until the next URL change consumes it. */
  readonly echoKey: string | null;
}

export function initialQuerySync<P extends { q: string }>(codec: SearchCodec<P>, params: P): QuerySync {
  return { draft: params.q, syncedKey: codec.key(params), echoKey: null };
}

/** Reconciles with the rendered URL; returns `state` itself when nothing changed. */
export function reconcileQuery<P extends { q: string }>(codec: SearchCodec<P>, state: QuerySync, params: P): QuerySync {
  const key = codec.key(params);
  if (key === state.syncedKey) return state;
  const isEcho = state.echoKey === key;
  return { draft: isEcho ? state.draft : params.q, syncedKey: key, echoKey: null };
}

export interface SearchWritePlan {
  /** New `location.search` ("" or "?…"). */
  readonly search: string;
  /** Page-params key of `search`, to record as the echo marker. */
  readonly key: string;
}

/** Page-params key of a search string. */
export function searchKey<P extends { q: string }>(codec: SearchCodec<P>, search: string): string {
  return codec.key(codec.parse(search));
}

/** Applies `patch` to the live search; null when the URL wouldn't change. */
export function planSearchWrite<P extends { q: string }>(
  codec: SearchCodec<P>,
  liveSearch: string,
  patch: Partial<P>,
): SearchWritePlan | null {
  const next = codec.merge(liveSearch, patch);
  if (new URLSearchParams(next).toString() === new URLSearchParams(liveSearch).toString()) return null;
  return { search: next, key: searchKey(codec, next) };
}

/**
 * The state after the page wrote `plan` (made from `patch` against `liveSearch`): records the echo
 * marker. A patch that names `q` keeps the draft, which may already be ahead of what was written.
 * Any other patch that sets `q` as a side effect (the Drive home clears the search when a folder
 * opens) moves the draft to the written value, so the next debounce doesn't write it back. The
 * side effect is measured on the draft, not on the live URL, so it holds whether or not the draft
 * reached the URL before the write; both sides go through the codec, so its own normalizing of
 * `q` (a blank or over-long query) doesn't count as a change.
 */
export function afterOwnWrite<P extends { q: string }>(
  codec: SearchCodec<P>,
  state: QuerySync,
  liveSearch: string,
  patch: Partial<P>,
  plan: SearchWritePlan,
): QuerySync {
  if (patch.q !== undefined) return { draft: state.draft, syncedKey: state.syncedKey, echoKey: plan.key };
  // The patch only names `q`, which every codec's params carry.
  const withDraft = codec.merge(liveSearch, { q: state.draft } as Partial<P>);
  const changed = codec.parse(codec.merge(withDraft, patch)).q !== codec.parse(withDraft).q;
  return { draft: changed ? codec.parse(plan.search).q : state.draft, syncedKey: state.syncedKey, echoKey: plan.key };
}

export interface DebouncedQueryWriteInput {
  readonly draft: string;
  /** Page-params key and `q` of the render that scheduled the write. */
  readonly renderedKey: string;
  readonly renderedQuery: string;
  /** `window.location.search` when the timer fires. */
  readonly liveSearch: string;
}

/**
 * The write a debounce timer should make, or null. The live URL can be ahead of the rendered
 * one (a tab switch or back/forward whose render hasn't landed yet); the write is dropped then,
 * and that render reconciles the draft and schedules again if needed.
 */
export function planDebouncedQueryWrite<P extends { q: string }>(
  codec: SearchCodec<P>,
  input: DebouncedQueryWriteInput,
): SearchWritePlan | null {
  if (input.draft === input.renderedQuery) return null;
  if (searchKey(codec, input.liveSearch) !== input.renderedKey) return null;
  // The patch only names `q`, which every codec's params carry.
  return planSearchWrite(codec, input.liveSearch, { q: input.draft } as Partial<P>);
}
