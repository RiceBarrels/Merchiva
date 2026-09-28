// Docs home list model: URL state, filtering, sorting, date groups and per-item menu actions.
//
// Pure (no React, no browser globals) so the rules are unit-tested in
// scripts/tests/docs-home. The docs home, its dialogs and the "Open a document"
// picker all derive their lists through these functions.

import type { DocAccess, DocumentMeta } from "@/lib/docs/types";

// ── URL state ────────────────────────────────────────────────────────────────

export type DocScope = "recent" | "starred" | "trash";
export type OwnerFilter = "anyone" | "me" | "notMe";
export type DocSort = "modified" | "opened" | "created" | "title";
export type DocView = "grid" | "list";
export type DocDateGroup = "today" | "week" | "month" | "earlier";

export const DOC_SCOPES: readonly DocScope[] = ["recent", "starred", "trash"];
export const OWNER_FILTERS: readonly OwnerFilter[] = ["anyone", "me", "notMe"];
export const DOC_SORTS: readonly DocSort[] = ["modified", "opened", "created", "title"];
export const DOC_DATE_GROUPS: readonly DocDateGroup[] = ["today", "week", "month", "earlier"];

export const DEFAULT_DOC_SCOPE: DocScope = "recent";
export const DEFAULT_OWNER_FILTER: OwnerFilter = "anyone";
export const DEFAULT_DOC_SORT: DocSort = "modified";

/** Longest search query kept in the URL. */
export const DOCS_QUERY_MAX = 200;

export interface DocsHomeParams {
  scope: DocScope;
  owner: OwnerFilter;
  sort: DocSort;
  /** Raw query as typed (not trimmed, so typing "foo " keeps its trailing space). */
  q: string;
}

function pick<T extends string>(allowed: readonly T[], value: string | null | undefined, fallback: T): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Reads `?scope=&owner=&sort=&q=`; unknown values fall back to the defaults. */
export function parseDocsHomeParams(params: { get(name: string): string | null }): DocsHomeParams {
  return {
    scope: pick(DOC_SCOPES, params.get("scope"), DEFAULT_DOC_SCOPE),
    owner: pick(OWNER_FILTERS, params.get("owner"), DEFAULT_OWNER_FILTER),
    sort: pick(DOC_SORTS, params.get("sort"), DEFAULT_DOC_SORT),
    q: (params.get("q") ?? "").slice(0, DOCS_QUERY_MAX),
  };
}

/**
 * Applies `patch` to a `location.search` string and returns the new search ("" or "?…").
 * Default values are dropped so the tab URL stays canonical, and params the home
 * doesn't own (for example DynamicUIElement's `dialogs`) are kept in place.
 */
export function mergeDocsHomeSearch(currentSearch: string, patch: Partial<DocsHomeParams>): string {
  const params = new URLSearchParams(currentSearch);
  const apply = (key: string, value: string | undefined, fallback: string) => {
    if (value === undefined) return;
    if (value === fallback) params.delete(key);
    else params.set(key, value);
  };
  apply("scope", patch.scope, DEFAULT_DOC_SCOPE);
  if (patch.q !== undefined) {
    const q = patch.q.slice(0, DOCS_QUERY_MAX);
    if (q.trim() === "") params.delete("q");
    else params.set("q", q);
  }
  apply("owner", patch.owner, DEFAULT_OWNER_FILTER);
  apply("sort", patch.sort, DEFAULT_DOC_SORT);
  const search = params.toString();
  return search ? `?${search}` : "";
}

// ── Items ────────────────────────────────────────────────────────────────────

export interface DocListItem {
  readonly doc: DocumentMeta;
  readonly access: DocAccess;
  readonly starred: boolean;
  /** Owner's display name; null when no member row matches (removed from the store). */
  readonly ownerName: string | null;
  readonly isMine: boolean;
  /** Reaches beyond the owner: store-wide visibility or at least one explicit grant. */
  readonly isShared: boolean;
  /** Last opened on this device (epoch ms), or null. */
  readonly openedAt: number | null;
  /**
   * Star and "Make a copy" are offered. Not on /store while the operator is not the tablet account: the Docs star
   * and copy reducers write for the signed-in account (useDocsSender).
   */
  readonly canStarAndCopy: boolean;
}

export interface BuildDocListItemsInput {
  /** Viewable documents plus the trashed documents the caller manages. */
  readonly docs: readonly DocumentMeta[];
  accessFor(doc: DocumentMeta): DocAccess;
  readonly starredIds: ReadonlySet<string>;
  /** Documents that have at least one explicit grant. */
  readonly grantedDocIds: ReadonlySet<string>;
  /** org_member id → display name. */
  readonly memberNames: ReadonlyMap<string, string>;
  readonly memberId: string | null;
  readonly openedMap: ReadonlyMap<string, number>;
  /** useDocsSender().actingForOther: star and copy would be written for someone else. */
  readonly actingForOther?: boolean;
}

export function buildDocListItems(input: BuildDocListItemsInput): DocListItem[] {
  const seen = new Set<string>();
  const items: DocListItem[] = [];
  for (const doc of input.docs) {
    if (seen.has(doc.id)) continue;
    seen.add(doc.id);
    items.push({
      doc,
      access: input.accessFor(doc),
      starred: input.starredIds.has(doc.id),
      ownerName: input.memberNames.get(doc.ownerMemberId) ?? null,
      isMine: input.memberId !== null && doc.ownerMemberId === input.memberId,
      isShared: doc.visibility !== "private" || input.grantedDocIds.has(doc.id),
      openedAt: input.openedMap.get(doc.id) ?? null,
      canStarAndCopy: input.actingForOther !== true,
    });
  }
  return items;
}

/** Case- and width-insensitive form used for substring search. */
export function normalizeSearchText(text: string, locale?: string): string {
  let lower: string;
  try {
    lower = text.toLocaleLowerCase(locale);
  } catch {
    lower = text.toLowerCase();
  }
  return lower.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export interface DocFilterOptions {
  scope: DocScope;
  owner: OwnerFilter;
  query: string;
  /** App locale for case folding (e.g. Turkish dotted i). */
  locale?: string;
  /** Shown for empty titles, so searching for it finds untitled documents. */
  untitledLabel: string;
}

export function filterDocItems(items: readonly DocListItem[], opts: DocFilterOptions): DocListItem[] {
  const q = normalizeSearchText(opts.query, opts.locale);
  const untitled = normalizeSearchText(opts.untitledLabel, opts.locale);
  return items.filter((item) => {
    const trashed = item.doc.trashedAt !== null;
    if (opts.scope === "trash") {
      if (!trashed || !item.access.canManage) return false;
    } else {
      if (trashed || !item.access.canView) return false;
      if (opts.scope === "starred" && !item.starred) return false;
    }
    if (opts.owner === "me" && !item.isMine) return false;
    if (opts.owner === "notMe" && item.isMine) return false;
    if (!q) return true;
    const title = item.doc.title.trim() ? normalizeSearchText(item.doc.title, opts.locale) : untitled;
    return title.includes(q) || normalizeSearchText(item.doc.excerpt, opts.locale).includes(q);
  });
}

/** The timestamp a row shows (and is grouped by) for a sort in a scope. */
export function docItemTime(item: DocListItem, sort: DocSort, scope: DocScope): number {
  if (scope === "trash") return (item.doc.trashedAt ?? item.doc.updatedAt).getTime();
  switch (sort) {
    case "opened":
      return item.openedAt ?? item.doc.updatedAt.getTime();
    case "created":
      return item.doc.createdAt.getTime();
    default:
      return item.doc.updatedAt.getTime();
  }
}

/** Which date a row's time stamp refers to (drives the column header and card meta label). */
export function docItemTimeKind(sort: DocSort, scope: DocScope): "modified" | "opened" | "created" | "trashed" {
  if (scope === "trash") return "trashed";
  if (sort === "opened") return "opened";
  if (sort === "created") return "created";
  return "modified";
}

/** Most recent of "updated" and "opened on this device". */
export function docRecentTime(item: DocListItem): number {
  return Math.max(item.doc.updatedAt.getTime(), item.openedAt ?? 0);
}

function collatorFor(locale?: string): Intl.Collator {
  try {
    return new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  } catch {
    return new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  }
}

const byId = (a: DocListItem, b: DocListItem) => (a.doc.id < b.doc.id ? -1 : a.doc.id > b.doc.id ? 1 : 0);

/**
 * Title sorts A→Z with untitled documents last; every other sort is newest first
 * (`opened` falls back to the modified time for documents never opened here).
 * Ties break on id so the order is stable across renders.
 */
export function sortDocItems(items: readonly DocListItem[], sort: DocSort, scope: DocScope, locale?: string): DocListItem[] {
  const out = [...items];
  if (sort === "title") {
    const collator = collatorFor(locale);
    out.sort((a, b) => {
      const at = a.doc.title.trim();
      const bt = b.doc.title.trim();
      if (!at !== !bt) return at ? -1 : 1;
      return collator.compare(at, bt) || b.doc.updatedAt.getTime() - a.doc.updatedAt.getTime() || byId(a, b);
    });
    return out;
  }
  out.sort((a, b) => docItemTime(b, sort, scope) - docItemTime(a, sort, scope) || byId(a, b));
  return out;
}

/** Newest first by `docRecentTime` (the "Open a document" picker). */
export function sortDocItemsByRecent(items: readonly DocListItem[]): DocListItem[] {
  return [...items].sort((a, b) => docRecentTime(b) - docRecentTime(a) || byId(a, b));
}

/** Today / previous 7 days / previous 30 days / earlier, in local calendar days. */
export function docDateGroup(time: number, now: number): DocDateGroup {
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (time >= startOfToday) return "today";
  if (time >= new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7).getTime()) return "week";
  if (time >= new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30).getTime()) return "month";
  return "earlier";
}

export interface DocItemGroup {
  readonly id: DocDateGroup;
  readonly items: readonly DocListItem[];
}

/** Date groups for already-sorted items; null when the sort/scope isn't grouped. */
export function groupDocItems(
  sorted: readonly DocListItem[],
  sort: DocSort,
  scope: DocScope,
  now: number,
): DocItemGroup[] | null {
  if (scope === "trash" || (sort !== "modified" && sort !== "opened")) return null;
  const buckets = new Map<DocDateGroup, DocListItem[]>();
  for (const item of sorted) {
    const group = docDateGroup(docItemTime(item, sort, scope), now);
    const list = buckets.get(group);
    if (list) list.push(item);
    else buckets.set(group, [item]);
  }
  return DOC_DATE_GROUPS.flatMap((id) => {
    const list = buckets.get(id);
    return list ? [{ id, items: list }] : [];
  });
}

/** Which empty state to show when a filtered list is empty. */
export type DocsEmptyKind = "noDocuments" | "noMatches" | "noStarred" | "trashEmpty";

export function docsEmptyKind(scope: DocScope, owner: OwnerFilter, query: string): DocsEmptyKind {
  if (query.trim() !== "" || owner !== DEFAULT_OWNER_FILTER) return "noMatches";
  if (scope === "starred") return "noStarred";
  if (scope === "trash") return "trashEmpty";
  return "noDocuments";
}

// ── Item menu ────────────────────────────────────────────────────────────────

export type DocItemAction =
  | "open"
  | "openNewTab"
  | "rename"
  | "star"
  | "unstar"
  | "share"
  | "copy"
  | "trash"
  | "restore"
  | "deleteForever";

/**
 * Menu actions for an item, in display order, split into separator groups.
 * Mirrors what the reducers allow (plan §B4.5): rename needs editor; trash,
 * restore and delete forever need manager; star, share (read-only for
 * non-managers) and copy need viewer; star and copy are left out when the item
 * says so (`canStarAndCopy` false). A trashed document can only be opened
 * (read-only), restored or deleted forever.
 */
export function docItemActionGroups(
  item: Pick<DocListItem, "doc" | "access" | "starred"> & Partial<Pick<DocListItem, "canStarAndCopy">>,
): DocItemAction[][] {
  const { access } = item;
  if (!access.canView && !access.canManage) return [];
  if (item.doc.trashedAt !== null) {
    return access.canManage ? [["open"], ["restore", "deleteForever"]] : [["open"]];
  }
  const groups: DocItemAction[][] = [["open", "openNewTab"]];
  const middle: DocItemAction[] = [];
  if (access.canEdit) middle.push("rename");
  const starAndCopy = item.canStarAndCopy !== false;
  if (starAndCopy) middle.push(item.starred ? "unstar" : "star");
  middle.push("share");
  if (starAndCopy) middle.push("copy");
  groups.push(middle);
  if (access.canManage) groups.push(["trash"]);
  return groups;
}
