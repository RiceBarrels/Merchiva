import { describe, expect, test } from "bun:test";
import { docAccessFromRole } from "@/lib/docs/access";
import type { DocRole, DocumentMeta } from "@/lib/docs/types";
import {
  buildDocListItems,
  docDateGroup,
  filterDocItems,
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
    fileType: "doc",
    folderId: "",
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

describe("recent sort and date groups", () => {
  const older = makeItem(makeDoc({ id: "1", title: "banana", updatedAt: new Date(NOW - 20 * DAY), createdAt: new Date(NOW - 1 * DAY) }), {
    openedAt: NOW - 1000,
  });
  const newer = makeItem(makeDoc({ id: "2", title: "Apple", updatedAt: new Date(NOW - 1000), createdAt: new Date(NOW - 40 * DAY) }));
  const blank = makeItem(makeDoc({ id: "3", title: "", updatedAt: new Date(NOW - 3 * DAY), createdAt: new Date(NOW - 5 * DAY) }));
  const list = [older, newer, blank];

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
});
