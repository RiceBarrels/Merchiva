import { describe, expect, test } from "bun:test";
import { PAGE_ANCHOR } from "@/lib/presence/anchor";
import {
  PRESENCE_STALE_MS,
  SELF_VIEWER_KEY,
  avatarStack,
  clockOffsetMs,
  cursorSpotKey,
  isFreshPresence,
  livePeers,
  otherTabUrlsOf,
  personKey,
  placeViewers,
  presenceNavKey,
  stackIndexes,
  viewersForRow,
  viewersFromPeers,
  viewersFromTabs,
  viewersSignature,
  type PresencePeer,
} from "@/lib/presence/rows";
import { listNavSections } from "@/lib/browser-shell/access";
import { documentHref } from "@/lib/docs/hrefs";
import { presencePageKeyOf } from "@/lib/presence/path";
import type { AccessContext, BrowserTab } from "@/lib/browser-shell/types";

const NOW = 1_800_000_000_000;

const OWNER: AccessContext = {
  isOwner: true,
  can: () => true,
  installedApps: new Set(["sales", "products", "tasks", "training", "pay", "bookings", "docs"]),
  appsReady: true,
  appMode: "admin",
  personalMode: false,
  isCapacitor: false,
};
const SECTIONS = listNavSections(OWNER);

let nextId = 0;
function peer(overrides: Partial<PresencePeer> = {}): PresencePeer {
  nextId += 1;
  return {
    id: `c${nextId}:user:`,
    connectionId: `c${nextId}`,
    self: false,
    memberId: `m${nextId}`,
    kind: "user",
    slot: "",
    name: `Person ${nextId}`,
    avatarUrl: "",
    pagePath: "/manager/inventory",
    anchor: PAGE_ANCHOR,
    anchorX: 0.5,
    anchorY: 0.5,
    pointX: 0.5,
    pointY: 0,
    clickSeq: 0,
    activity: "",
    updatedAtMs: NOW,
    ...overrides,
  };
}

const ME = { name: "Mia Chen", avatarUrl: "", memberId: "m-me" };

describe("staleness", () => {
  test("a row is live for 100 s on the server clock; the future counts as fresh", () => {
    expect(isFreshPresence(NOW, NOW)).toBe(true);
    expect(isFreshPresence(NOW - PRESENCE_STALE_MS, NOW)).toBe(true);
    expect(isFreshPresence(NOW - PRESENCE_STALE_MS - 1, NOW)).toBe(false);
    expect(isFreshPresence(NOW + 30_000, NOW)).toBe(true);
  });

  test("the clock offset corrects a local clock that runs ahead", () => {
    // The local clock is 3 minutes fast: a 20 s old row would look 200 s old without the offset.
    const localNow = NOW + 180_000;
    const offset = clockOffsetMs(NOW, localNow);
    expect(offset).toBe(-180_000);
    expect(isFreshPresence(NOW - 20_000, localNow)).toBe(false);
    expect(isFreshPresence(NOW - 20_000, localNow + offset)).toBe(true);
  });

  test("livePeers drops this window's own rows and stale ones, and keeps this user's other windows", () => {
    const mine = peer({ connectionId: "me", self: true });
    const myOtherWindow = peer({ self: true });
    const stale = peer({ updatedAtMs: NOW - PRESENCE_STALE_MS - 5 });
    const colleague = peer();
    expect(livePeers([mine, myOtherWindow, stale, colleague], "me", NOW)).toEqual([myOtherWindow, colleague]);
  });
});

describe("nav placement", () => {
  test("a URL lands on the section row the sidebar highlights and on its sub-page row", () => {
    const inputs = [
      "/manager/suppliers",
      "/manager/inventory",
      "/manager/inventory/waste",
      "/manager/docs/edit?id=abc",
      "/manager",
      "/manager/personnel",
      "/manager/personnel/team/42",
      "/manager/finances",
      "/manager/settings/billing",
      "/manager/products",
    ].map((url, i) => ({ key: `k${i}`, self: false, name: url, avatarUrl: "", memberId: "", url }));
    const placed = placeViewers(inputs, SECTIONS).map((v) => [v.name, v.sectionHref, v.childHref]);
    expect(placed).toEqual([
      ["/manager/suppliers", "/manager/inventory", "/manager/suppliers"],
      ["/manager/inventory", "/manager/inventory", null],
      ["/manager/inventory/waste", "/manager/inventory", "/manager/inventory/waste"],
      // The Docs editor sits under Drive, the one file hub (Docs is an editor plugin).
      ["/manager/docs/edit?id=abc", "/manager/drive", null],
      ["/manager", "/manager/new-tab", null],
      ["/manager/personnel", "/manager/personnel/schedule", "/manager/personnel/schedule"],
      ["/manager/personnel/team/42", "/manager/personnel/schedule", "/manager/personnel/team"],
      ["/manager/finances", "/manager/sales", "/manager/finances"],
      ["/manager/settings/billing", "/manager/settings", null],
      // /manager/products is unlisted and has no parent: no row, no badge.
    ]);
  });

  test("user rows and this window's other tabs become viewers; agent rows do not", () => {
    const colleague = peer({ memberId: "m-ana", name: "Ana", pagePath: "/manager/suppliers" });
    const agent = peer({ kind: "agent", slot: "t_1", pagePath: "/manager/suppliers" });
    const fromPeers = viewersFromPeers([colleague, agent]);
    expect(fromPeers).toEqual([
      { key: "member:m-ana", self: false, name: "Ana", avatarUrl: "", memberId: "m-ana", url: "/manager/suppliers" },
    ]);
    expect(viewersFromTabs(["/manager/inventory"], ME)).toEqual([
      { key: SELF_VIEWER_KEY, self: true, name: "Mia Chen", avatarUrl: "", memberId: "m-me", url: "/manager/inventory" },
    ]);
  });

  test("this window's other tabs are the ones off screen, and none on the single-tab phone layout", () => {
    const tab = (id: string, urls: string[], index = urls.length - 1): BrowserTab => ({
      id,
      pinned: false,
      openerTabId: null,
      createdAt: 1,
      lastActiveAt: 1,
      history: { entries: urls.map((url, i) => ({ key: `e_${id}${i}`, url, at: 1 })), index },
    });
    const tabs = [tab("t_a", ["/manager/inventory"]), tab("t_b", ["/manager/sales"]), tab("t_c", ["/manager/reports", "/manager/tasks"], 0)];
    // Each tab counts with the page it shows, not the last one in its history.
    expect(otherTabUrlsOf(tabs, "t_b", false)).toEqual(["/manager/inventory", "/manager/reports"]);
    expect(otherTabUrlsOf(tabs, null, false)).toHaveLength(3);
    // The phone keeps restored tabs hidden: they put no "You (other tab)" badge on the drawer.
    expect(otherTabUrlsOf(tabs, "t_b", true)).toEqual([]);
  });

  test("people in different documents are all on the Drive row; the record segment is not a nav key", () => {
    const inDocX = presencePageKeyOf(documentHref("doc-x")) ?? "";
    const inDocY = presencePageKeyOf(documentHref("doc-y")) ?? "";
    expect(inDocX).not.toBe(inDocY);
    const viewers = viewersFromPeers([peer({ pagePath: inDocX }), peer({ pagePath: inDocY })]);
    expect(viewers.map((v) => v.url)).toEqual(["/manager/docs/edit", "/manager/docs/edit"]);
    const placed = placeViewers(viewers, SECTIONS);
    expect(placed.map((v) => v.sectionHref)).toEqual(["/manager/drive", "/manager/drive"]);
    expect(presenceNavKey(inDocX)).toBe(presenceNavKey("/manager/docs/edit"));
    expect(presenceNavKey("/manager/inventory/waste")).toBe("/manager/inventory/waste");
  });

  test("person keys: this user is one person, colleagues by member, then by connection", () => {
    expect(personKey({ self: true, memberId: "m1", connectionId: "c1" })).toBe(SELF_VIEWER_KEY);
    expect(personKey({ self: false, memberId: "m1", connectionId: "c1" })).toBe("member:m1");
    expect(personKey({ self: false, memberId: "", connectionId: "c1" })).toBe("connection:c1");
  });
});

describe("viewersForRow", () => {
  const ana1 = peer({ memberId: "m-ana", name: "Ana", pagePath: "/manager/suppliers" });
  const ana2 = peer({ memberId: "m-ana", name: "Ana", pagePath: "/manager/inventory", avatarUrl: "https://x/ana.png" });
  const ben = peer({ memberId: "m-ben", name: "Ben", pagePath: "/manager/inventory" });
  const zoe = peer({ memberId: "m-zoe", name: "Zoe", pagePath: "/manager/inventory/waste" });
  const myWindow = peer({ self: true, memberId: "m-me", name: "Mia Chen", pagePath: "/manager/suppliers" });
  const viewers = placeViewers(
    [
      ...viewersFromPeers([zoe, ana1, ben, ana2, myWindow]),
      ...viewersFromTabs(["/manager/inventory", "/manager/suppliers", "/manager/channel"], ME),
    ],
    SECTIONS,
  );

  test("one entry per person per row — this user once however many tabs and windows — others first by name", () => {
    const row = viewersForRow(viewers, "/manager/inventory", "section");
    expect(row.map((v) => v.key)).toEqual(["member:m-ana", "member:m-ben", "member:m-zoe", SELF_VIEWER_KEY]);
    // Ana is in two windows; the entry with an avatar wins.
    expect(row[0].avatarUrl).toBe("https://x/ana.png");
  });

  test("a section row with its sub-pages on screen leaves them to the sub-page rows", () => {
    expect(viewersForRow(viewers, "/manager/inventory", "section", true).map((v) => v.key)).toEqual([
      "member:m-ana",
      "member:m-ben",
      SELF_VIEWER_KEY,
    ]);
    expect(viewersForRow(viewers, "/manager/suppliers", "child").map((v) => v.key)).toEqual([
      "member:m-ana",
      SELF_VIEWER_KEY,
    ]);
    expect(viewersForRow(viewers, "/manager/inventory/waste", "child").map((v) => v.key)).toEqual(["member:m-zoe"]);
    expect(viewersForRow(viewers, "/manager/channel", "section").map((v) => v.key)).toEqual([SELF_VIEWER_KEY]);
    expect(viewersForRow(viewers, "/manager/sales", "section")).toEqual([]);
  });

  test("two avatars, then an n+ chip for the rest", () => {
    expect(avatarStack(["a"], 2)).toEqual({ shown: ["a"], extra: 0 });
    expect(avatarStack(["a", "b"], 2)).toEqual({ shown: ["a", "b"], extra: 0 });
    expect(avatarStack(["a", "b", "c"], 2)).toEqual({ shown: ["a", "b"], extra: 1 });
    expect(avatarStack(["a", "b", "c", "d", "e"], 2)).toEqual({ shown: ["a", "b"], extra: 3 });
    expect(avatarStack(["a", "b"], 1)).toEqual({ shown: ["a"], extra: 1 });
  });

  test("the signature changes with anything a badge shows", () => {
    const base = viewersSignature(viewers);
    expect(viewersSignature([...viewers])).toBe(base);
    const renamed = viewers.map((v, i) => (i === 0 ? { ...v, name: "Renamed" } : v));
    expect(viewersSignature(renamed)).not.toBe(base);
    expect(viewersSignature(viewers.slice(1))).not.toBe(base);
  });
});

describe("cursor stacking", () => {
  test("cursors on the same spot get increasing stack indexes", () => {
    const arrived = peer();
    const arrivedToo = peer();
    const clicked = peer({ anchor: "id:inventory.list", anchorX: 0.25, anchorY: 0.5 });
    const pointOnly = peer({ anchor: "", pointX: 0.1, pointY: 0.2 });
    const keys = [arrived, arrivedToo, clicked, pointOnly].map(cursorSpotKey);
    expect(keys).toEqual(["page", "page", "id:inventory.list|0.250|0.500", "point|0.100|0.200"]);
    expect(stackIndexes([...keys, "page"])).toEqual([0, 1, 0, 0, 2]);
  });
});
