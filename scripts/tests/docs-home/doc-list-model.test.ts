import { describe, expect, test } from "bun:test";
import { docAccessFromRole } from "@/lib/docs/access";
import type { DocRole, DocumentMeta } from "@/lib/docs/types";
import {
  buildDocListItems,
  docDateGroup,
  docItemActionGroups,
  docItemTime,
  docItemTimeKind,
  docsEmptyKind,
  filterDocItems,
  groupDocItems,
  mergeDocsHomeSearch,
  parseDocsHomeParams,
  sortDocItems,
  sortDocItemsByRecent,
  type DocListItem,
} from "@/components/docs/home/doc-list-model";

const NOW = new Date(2026, 8, 15, 14, 30).getTime(); // Tue 15 Sep 2026, 14:30 local
const DAY = 86_400_000;

function makeDoc(patch: Partial<DocumentMeta> & { id: string }): DocumentMeta {
  return {
    organizationId: "org-1",
    ownerMemberId: "m-owner",
    title: "",
    excerpt: "",
    icon: null,
    visibility: "org_edit",
    templateId: null,
    pageSetup: null,
    wordCount: 0,
    createdAt: new Date(NOW - 10 * DAY),
    updatedAt: new Date(NOW - DAY),
    lastEditorMemberId: null,
    trashedAt: null,
    trashedByMemberId: null,
    ...patch,
  };
}

function makeItem(
  doc: DocumentMeta,
  opts: { role?: DocRole; starred?: boolean; mine?: boolean; openedAt?: number | null; shared?: boolean } = {},
): DocListItem {
  return {
    doc,
    access: docAccessFromRole(opts.role ?? "editor", doc.trashedAt !== null),
    starred: opts.starred ?? false,
    ownerName: "Priya",
    isMine: opts.mine ?? false,
    isShared: opts.shared ?? doc.visibility !== "private",
    openedAt: opts.openedAt ?? null,
  };
}

const params = (search: string) => new URLSearchParams(search);

describe("URL state", () => {
  test("parses known values and falls back on unknown ones", () => {
    expect(parseDocsHomeParams(params("?scope=trash&owner=me&sort=title&q=abc"))).toEqual({
      scope: "trash",
      owner: "me",
      sort: "title",
      q: "abc",
    });
    expect(parseDocsHomeParams(params("?scope=bogus&owner=&sort=size"))).toEqual({
      scope: "recent",
      owner: "anyone",
      sort: "modified",
      q: "",
    });
  });

  test("merge drops defaults, keeps foreign params and raw query text", () => {
    expect(mergeDocsHomeSearch("", { scope: "recent" })).toBe("");
    expect(mergeDocsHomeSearch("?dialogs=Share", { scope: "starred" })).toBe("?dialogs=Share&scope=starred");
    expect(mergeDocsHomeSearch("?scope=starred&q=abc", { scope: "recent" })).toBe("?q=abc");
    expect(mergeDocsHomeSearch("?q=abc", { q: "abc " })).toBe("?q=abc+");
    expect(mergeDocsHomeSearch("?q=abc&sort=title", { q: "   " })).toBe("?sort=title");
    expect(mergeDocsHomeSearch("?owner=me", { owner: "anyone", sort: "opened" })).toBe("?sort=opened");
    expect(mergeDocsHomeSearch("", { q: "x".repeat(500) }).length).toBe("?q=".length + 200);
  });
});

describe("items and filtering", () => {
  const plain = makeDoc({ id: "a", title: "Shift Handover", excerpt: "cash drawer counted" });
  const untitled = makeDoc({ id: "b", title: "  " });
  const cjk = makeDoc({ id: "c", title: "店铺交接班", excerpt: "盘点库存" });
  const trashed = makeDoc({ id: "d", title: "Old SOP", trashedAt: new Date(NOW - 2 * DAY) });
  const items = [
    makeItem(plain, { starred: true, mine: true }),
    makeItem(untitled),
    makeItem(cjk, { role: "viewer" }),
    makeItem(trashed, { role: "manager" }),
    makeItem(makeDoc({ id: "e", title: "Trashed by someone", trashedAt: new Date(NOW) }), { role: "editor" }),
  ];
  const base = { owner: "anyone" as const, query: "", untitledLabel: "Untitled document", locale: "en" };

  test("buildDocListItems derives ownership, sharing and dedupes ids", () => {
    const doc = makeDoc({ id: "x", visibility: "private", ownerMemberId: "m-me" });
    const built = buildDocListItems({
      docs: [doc, doc, makeDoc({ id: "y", visibility: "private" })],
      accessFor: () => docAccessFromRole("manager", false),
      starredIds: new Set(["x"]),
      grantedDocIds: new Set(["y"]),
      memberNames: new Map([["m-me", "Me"]]),
      memberId: "m-me",
      openedMap: new Map([["x", 123]]),
    });
    expect(built.map((i) => i.doc.id)).toEqual(["x", "y"]);
    expect(built[0]).toMatchObject({ isMine: true, isShared: false, starred: true, ownerName: "Me", openedAt: 123 });
    expect(built[1]).toMatchObject({ isMine: false, isShared: true, starred: false, ownerName: null, openedAt: null });
  });

  test("scopes: recent hides trash, starred needs a star, trash needs manage rights", () => {
    expect(filterDocItems(items, { ...base, scope: "recent" }).map((i) => i.doc.id)).toEqual(["a", "b", "c"]);
    expect(filterDocItems(items, { ...base, scope: "starred" }).map((i) => i.doc.id)).toEqual(["a"]);
    expect(filterDocItems(items, { ...base, scope: "trash" }).map((i) => i.doc.id)).toEqual(["d"]);
  });

  test("owner filter", () => {
    expect(filterDocItems(items, { ...base, scope: "recent", owner: "me" }).map((i) => i.doc.id)).toEqual(["a"]);
    expect(filterDocItems(items, { ...base, scope: "recent", owner: "notMe" }).map((i) => i.doc.id)).toEqual(["b", "c"]);
  });

  test("search matches title or excerpt, case-insensitively, including untitled and CJK", () => {
    const search = (query: string) => filterDocItems(items, { ...base, scope: "recent", query }).map((i) => i.doc.id);
    expect(search("HANDOVER")).toEqual(["a"]);
    expect(search("  drawer  ")).toEqual(["a"]);
    expect(search("untitled")).toEqual(["b"]);
    expect(search("库存")).toEqual(["c"]);
    expect(search("ＳＨＩＦＴ")).toEqual(["a"]); // full-width letters fold via NFKC
    expect(search("nothing-here")).toEqual([]);
  });
});

describe("sorting and grouping", () => {
  const older = makeItem(makeDoc({ id: "1", title: "banana", updatedAt: new Date(NOW - 20 * DAY), createdAt: new Date(NOW - 1 * DAY) }), {
    openedAt: NOW - 1000,
  });
  const newer = makeItem(makeDoc({ id: "2", title: "Apple", updatedAt: new Date(NOW - 1000), createdAt: new Date(NOW - 40 * DAY) }));
  const blank = makeItem(makeDoc({ id: "3", title: "", updatedAt: new Date(NOW - 3 * DAY), createdAt: new Date(NOW - 5 * DAY) }));
  const list = [older, newer, blank];

  test("modified / created / opened are newest first; opened falls back to modified", () => {
    expect(sortDocItems(list, "modified", "recent").map((i) => i.doc.id)).toEqual(["2", "3", "1"]);
    expect(sortDocItems(list, "created", "recent").map((i) => i.doc.id)).toEqual(["1", "3", "2"]);
    expect(sortDocItems(list, "opened", "recent").map((i) => i.doc.id)).toEqual(["1", "2", "3"]);
    expect(docItemTime(newer, "opened", "recent")).toBe(NOW - 1000);
  });

  test("title sorts A→Z with untitled last", () => {
    expect(sortDocItems(list, "title", "recent", "en").map((i) => i.doc.id)).toEqual(["2", "1", "3"]);
  });

  test("trash scope uses the trashed time", () => {
    const a = makeItem(makeDoc({ id: "t1", trashedAt: new Date(NOW - 5 * DAY), updatedAt: new Date(NOW) }), { role: "manager" });
    const b = makeItem(makeDoc({ id: "t2", trashedAt: new Date(NOW - DAY), updatedAt: new Date(NOW - 9 * DAY) }), { role: "manager" });
    expect(sortDocItems([a, b], "modified", "trash").map((i) => i.doc.id)).toEqual(["t2", "t1"]);
    expect(docItemTimeKind("modified", "trash")).toBe("trashed");
    expect(docItemTimeKind("opened", "recent")).toBe("opened");
    expect(docItemTimeKind("title", "recent")).toBe("modified");
  });

  test("recent picker uses max(updated, opened)", () => {
    expect(sortDocItemsByRecent(list).map((i) => i.doc.id)).toEqual(["1", "2", "3"]);
  });

  test("date groups follow local calendar days", () => {
    const startOfToday = new Date(2026, 8, 15).getTime();
    expect(docDateGroup(NOW, NOW)).toBe("today");
    expect(docDateGroup(startOfToday, NOW)).toBe("today");
    expect(docDateGroup(startOfToday - 1, NOW)).toBe("week");
    expect(docDateGroup(new Date(2026, 8, 8).getTime(), NOW)).toBe("week");
    expect(docDateGroup(new Date(2026, 8, 8).getTime() - 1, NOW)).toBe("month");
    expect(docDateGroup(new Date(2026, 7, 16).getTime(), NOW)).toBe("month");
    expect(docDateGroup(new Date(2026, 7, 16).getTime() - 1, NOW)).toBe("earlier");
    expect(docDateGroup(NOW + DAY, NOW)).toBe("today");
  });

  test("groupDocItems only groups date sorts outside the trash and keeps order", () => {
    const sorted = sortDocItems(list, "modified", "recent");
    expect(groupDocItems(sorted, "modified", "recent", NOW)?.map((g) => [g.id, g.items.map((i) => i.doc.id)])).toEqual([
      ["today", ["2"]],
      ["week", ["3"]],
      ["month", ["1"]],
    ]);
    expect(groupDocItems(sorted, "title", "recent", NOW)).toBeNull();
    expect(groupDocItems(sorted, "created", "recent", NOW)).toBeNull();
    expect(groupDocItems(sorted, "modified", "trash", NOW)).toBeNull();
  });
});

describe("empty states", () => {
  test("filters beat scope", () => {
    expect(docsEmptyKind("recent", "anyone", "")).toBe("noDocuments");
    expect(docsEmptyKind("starred", "anyone", " ")).toBe("noStarred");
    expect(docsEmptyKind("trash", "anyone", "")).toBe("trashEmpty");
    expect(docsEmptyKind("trash", "me", "")).toBe("noMatches");
    expect(docsEmptyKind("recent", "anyone", "abc")).toBe("noMatches");
  });
});

describe("item menu actions follow the role matrix (plan §B4.5)", () => {
  const live = makeDoc({ id: "live" });
  const inTrash = makeDoc({ id: "trash", trashedAt: new Date(NOW) });
  const groups = (role: DocRole, doc: DocumentMeta, starred = false) =>
    docItemActionGroups({ doc, access: docAccessFromRole(role, doc.trashedAt !== null), starred });

  test("viewer and commenter: open, star, share (read-only), copy", () => {
    expect(groups("viewer", live)).toEqual([["open", "openNewTab"], ["star", "share", "copy"]]);
    expect(groups("commenter", live, true)).toEqual([["open", "openNewTab"], ["unstar", "share", "copy"]]);
  });

  test("editor adds rename; manager adds trash", () => {
    expect(groups("editor", live)).toEqual([["open", "openNewTab"], ["rename", "star", "share", "copy"]]);
    expect(groups("manager", live)).toEqual([["open", "openNewTab"], ["rename", "star", "share", "copy"], ["trash"]]);
  });

  test("trashed documents: managers restore or delete forever", () => {
    expect(groups("manager", inTrash)).toEqual([["open"], ["restore", "deleteForever"]]);
    expect(groups("editor", inTrash)).toEqual([["open"]]);
    expect(groups("none", live)).toEqual([]);
  });
});
