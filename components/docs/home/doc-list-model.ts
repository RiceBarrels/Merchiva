// Docs list model: document items, filtering, recent sort, search normalization and date groups.
//
// Pure (no React, no browser globals) so the rules are unit-tested in
// scripts/tests/docs-home. The "Open a document" picker derives its list through
// these functions; Drive reuses the search normalization and date groups.

import type { DocAccess, DocumentMeta } from "@/lib/docs/types";

export type DocScope = "recent" | "starred" | "trash";
export type OwnerFilter = "anyone" | "me" | "notMe";
export type DocDateGroup = "today" | "week" | "month" | "earlier";

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

/** Most recent of "updated" and "opened on this device". */
function docRecentTime(item: DocListItem): number {
  return Math.max(item.doc.updatedAt.getTime(), item.openedAt ?? 0);
}

const byId = (a: DocListItem, b: DocListItem) => (a.doc.id < b.doc.id ? -1 : a.doc.id > b.doc.id ? 1 : 0);

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
