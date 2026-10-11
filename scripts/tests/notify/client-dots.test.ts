// The dot state (lib/notifications/dots.ts): which unread rows light which entry
// points on each surface, the 14-day window, the active store and identity,
// alert-only rows, other stores (by this person's access there), the selectors'
// queries, and what a visible /manager page clears (an editor only its own item's
// rows). Includes "a staff member's team-join row never leaves a stuck dot" and the
// device tile table.

import { describe, expect, test } from "bun:test";
import { listNavSections } from "@/lib/browser-shell/access";
import type { AccessContext } from "@/lib/browser-shell/types";
import { DEVICE_DOT_TILE_PERMISSION, type DeviceDotTarget } from "@/lib/notifications/device-tiles";
import {
  DOT_FILTERS,
  NOTIFY_DOT_WINDOW_MS,
  buildDotState,
  hasDot,
  idsForQuery,
  linkMatchesPage,
  rowsClearedByPage,
  sameDotState,
  type DotRow,
  type DotStateInput,
  type DotSurface,
} from "@/lib/notifications/dots";

const OWNER: AccessContext = {
  isOwner: true,
  can: () => true,
  installedApps: new Set(["sales", "products", "tasks", "training", "pay", "bookings", "docs", "sheets", "slides", "forms"]),
  appsReady: true,
  appMode: "admin",
  personalMode: false,
  isCapacitor: false,
};
/** A staff member: staffing and the dashboard, no team page, no inventory. */
const STAFF_CTX: AccessContext = {
  ...OWNER,
  isOwner: false,
  can: (section) => section === "staffing" || section === "dashboard",
};
const SECTIONS = listNavSections(OWNER);
const STAFF_SECTIONS = listNavSections(STAFF_CTX);

const NOW = 1_800_000_000_000;
const ME = "aa".repeat(32);
const OTHER = "bb".repeat(32);
const ORG = "org-1";
const ORG2 = "org-2";
const CONV = "c0ffee00-0000-4000-8000-000000000001";
const CONV2 = "c0ffee00-0000-4000-8000-000000000002";

let seq = 0;
function row(type: string, link: string | null, over: Partial<DotRow> = {}): DotRow {
  seq += 1;
  return { id: `n${seq}`, organizationId: ORG, targetHex: ME, type, link, read: false, createdAtMs: NOW - seq * 1000, ...over };
}

const everyTileVisible = () => true;
const ownerElsewhere = () => ({ canViewTeam: true, sections: SECTIONS });

function state(rows: DotRow[], over: Partial<DotStateInput> = {}) {
  return buildDotState({
    rows,
    nowMs: NOW,
    organizationId: ORG,
    selfHex: ME,
    surface: "manager",
    canViewTeam: true,
    sections: SECTIONS,
    deviceTileVisible: everyTileVisible,
    merchivaRail: true,
    ...over,
  });
}

describe("which rows count", () => {
  test("unread, mine, this store, inside the window", () => {
    const fresh = row("inventory_low", "/manager/inventory");
    const read = row("inventory_low", "/manager/inventory", { read: true });
    const someoneElse = row("inventory_low", "/manager/inventory", { targetHex: OTHER });
    const old = row("inventory_low", "/manager/inventory", { createdAtMs: NOW - NOTIFY_DOT_WINDOW_MS - 1 });
    const s = state([fresh, read, someoneElse, old]);
    expect(s.entries.map((e) => e.id)).toEqual([fresh.id]);
    expect(hasDot(s, { href: "/manager/inventory" })).toBe(true);
  });

  test("no identity yet → nothing", () => {
    const s = state([row("inventory_low", "/manager/inventory")], { selfHex: null });
    expect(s.entries).toEqual([]);
    expect(s.alertOnlyIds).toEqual([]);
  });

  test("another store's rows only mark that store, never light this one", () => {
    const elsewhere = row("doc_share", "/manager/docs/edit?id=d1", { organizationId: ORG2 });
    const s = state([elsewhere], { otherOrgAccess: ownerElsewhere });
    expect(s.entries).toEqual([]);
    expect([...s.otherOrgIds]).toEqual([ORG2]);
    // An alert-only row elsewhere marks nothing.
    expect([...state([row("admin", null, { organizationId: ORG2 })], { otherOrgAccess: ownerElsewhere }).otherOrgIds]).toEqual([]);
    // Nor does any row of a store whose access is unknown.
    expect(state([elsewhere]).otherOrgIds.size).toBe(0);
  });

  test("another store is marked only for a row its own nav would show", () => {
    const low = row("inventory_low", "/manager/inventory", { organizationId: ORG2 });
    const withoutInventory = state([low], { otherOrgAccess: () => ({ canViewTeam: false, sections: STAFF_SECTIONS }) });
    expect(withoutInventory.otherOrgIds.size).toBe(0);
    const withInventory = state([low], { otherOrgAccess: ownerElsewhere });
    expect([...withInventory.otherOrgIds]).toEqual([ORG2]);
    // Mr. Merchiva's rows never mark another store (no nav row; they clear when his dock opens there).
    const reply = row("general", "/manager/dashboard?mvsession=s1", { organizationId: ORG2 });
    expect(state([reply], { otherOrgAccess: ownerElsewhere }).otherOrgIds.size).toBe(0);
  });

  test("alert-only rows (SOS, console, self) never count and are listed for marking read", () => {
    const sos = row("emergency", null);
    const admin = row("admin", "/manager/inventory");
    const self = row("general", null);
    const s = state([sos, admin, self]);
    expect(s.entries).toEqual([]);
    expect(new Set(s.alertOnlyIds)).toEqual(new Set([sos.id, admin.id, self.id]));
  });
});

describe("staff team-join → no stuck dot", () => {
  const join = () => row("team", "/manager/personnel/team");

  test("for someone who cannot open the team page it is alert-only on every surface", () => {
    for (const surface of ["manager", "store", "personal"] as DotSurface[]) {
      const r = join();
      const s = state([r], { surface, canViewTeam: false, sections: STAFF_SECTIONS });
      expect([surface, s.entries.length]).toEqual([surface, 0]);
      expect(s.alertOnlyIds).toEqual([r.id]);
      expect(s.entries.some((e) => e.counted)).toBe(false);
    }
  });

  test("no aggregate lights for it either (menu button, pager, other-store rows)", () => {
    const s = state([join()], { canViewTeam: false, sections: STAFF_SECTIONS });
    expect(s.entries.some((e) => e.counted && DOT_FILTERS.navRows(e))).toBe(false);
    const elsewhere = state([join()].map((r) => ({ ...r, organizationId: ORG2 })), {
      otherOrgAccess: () => ({ canViewTeam: false, sections: STAFF_SECTIONS }),
    });
    expect(elsewhere.otherOrgIds.size).toBe(0);
  });

  test("a manager gets the team row on /manager and the Directory tile on devices", () => {
    const r = join();
    const manager = state([r]);
    expect(hasDot(manager, { href: "/manager/personnel/team", level: "child" })).toBe(true);
    expect(idsForQuery(manager, { url: "/manager/personnel/team" })).toEqual([r.id]);
    const device = state([r], { surface: "personal" });
    expect(hasDot(device, { app: "directory" })).toBe(true);
  });
});

describe("/manager nav rows", () => {
  test("a section rolls its sub-pages up unless they are on screen", () => {
    const supplier = row("order", "/manager/suppliers");
    const s = state([supplier]);
    expect(hasDot(s, { href: "/manager/inventory" })).toBe(true);
    expect(hasDot(s, { href: "/manager/inventory", childrenVisible: true })).toBe(false);
    expect(hasDot(s, { href: "/manager/suppliers", level: "child" })).toBe(true);
    expect(hasDot(s, { href: "/manager/inventory/waste", level: "child" })).toBe(false);
  });

  test("a section's own rows stay on it with its children open", () => {
    const s = state([row("inventory_low", "/manager/inventory")]);
    expect(hasDot(s, { href: "/manager/inventory", childrenVisible: true })).toBe(true);
  });

  test("Personnel: the section href is also the Schedule row's", () => {
    const s = state([row("time_off", "/manager/personnel")]);
    expect(hasDot(s, { href: "/manager/personnel/schedule" })).toBe(true);
    expect(hasDot(s, { href: "/manager/personnel/schedule", childrenVisible: true })).toBe(false);
    expect(hasDot(s, { href: "/manager/personnel/schedule", level: "child" })).toBe(true);
    expect(hasDot(s, { href: "/manager/personnel/team", level: "child" })).toBe(false);
  });

  test("a tab's page: the rows visiting it would clear", () => {
    const s = state([row("doc_comment", "/manager/docs/edit?id=d1&comment=t1")]);
    expect(hasDot(s, { url: "/manager/drive" })).toBe(true);
    expect(hasDot(s, { url: "/manager/docs/edit?id=d1" })).toBe(true);
    // Another document's editor sits on the same nav row but does not show this comment.
    expect(hasDot(s, { url: "/manager/docs/edit?id=d9" })).toBe(false);
    expect(hasDot(s, { url: "/manager/inventory" })).toBe(false);
  });

  test("a row whose section this person does not see counts nowhere", () => {
    const s = state([row("inventory_low", "/manager/inventory")], { sections: STAFF_SECTIONS });
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0].counted).toBe(false);
    expect(s.entries.some((e) => e.counted)).toBe(false);
  });

  test("Mr. Merchiva counts on the desktop rail only", () => {
    const reply = row("general", "/manager/dashboard?mvsession=s1");
    expect(hasDot(state([reply]), { app: "merchiva" })).toBe(true);
    expect(hasDot(state([reply], { merchivaRail: false }), { app: "merchiva" })).toBe(false);
    // Opening the dock clears it either way.
    expect(idsForQuery(state([reply], { merchivaRail: false }), { app: "merchiva" })).toEqual([reply.id]);
  });

  test("chat: per conversation, and the Channel row", () => {
    const a = row("team", `/manager/channel?c=${CONV}`);
    const s = state([a]);
    expect(hasDot(s, { conversationId: CONV })).toBe(true);
    expect(hasDot(s, { conversationId: CONV2 })).toBe(false);
    expect(hasDot(s, { href: "/manager/channel" })).toBe(true);
    expect(s.entries.some((e) => e.counted && DOT_FILTERS.navRows(e))).toBe(true);
  });
});

describe("device tiles", () => {
  // Producer row → the tile it lights on both device surfaces (null = none).
  const TABLE: Array<[string, string | null, string | null]> = [
    ["team", `/manager/channel?c=${CONV}`, "channel"],
    ["doc_share", "/manager/docs/edit?id=d1", "drive"],
    ["doc_comment", "/manager/drive/sheet?id=d1&comment=t1", "drive"],
    ["inventory_low", "/manager/inventory", "inventory"],
    ["team", "/manager/personnel/team", "directory"],
    ["security", "/manager/personnel/team", null],
    ["order", "/manager/suppliers", null],
    ["form_response", "/manager/forms/edit?id=f1&view=responses", null],
    ["time_off", "/manager/personnel", null],
    ["shift_trade", "/manager/personnel", null],
    ["general", "/manager/dashboard?mvsession=s1", null],
  ];

  for (const surface of ["store", "personal"] as const) {
    test(`${surface}: the producer × tile table`, () => {
      for (const [type, link, tile] of TABLE) {
        const r = row(type, link);
        const s = state([r], { surface });
        const entry = s.entries[0];
        expect([type, link, entry?.app ?? null, entry?.counted ?? false]).toEqual([type, link, tile, tile !== null]);
        if (tile) {
          expect(hasDot(s, { app: tile })).toBe(true);
          // Opening the tile clears exactly its rows.
          expect(idsForQuery(s, { app: tile })).toEqual([r.id]);
        }
      }
    });
  }

  test("rows without a device dot stay unread there (not alert-only)", () => {
    const s = state([row("security", "/manager/personnel/team")], { surface: "personal" });
    expect(s.alertOnlyIds).toEqual([]);
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0].counted).toBe(false);
  });

  test("a tile the person cannot see does not light", () => {
    const visible = (target: DeviceDotTarget) =>
      target.kind === "channel" || DEVICE_DOT_TILE_PERMISSION[target.app] !== "inventory";
    const s = state([row("inventory_low", "/manager/inventory"), row("doc_share", "/manager/docs/edit?id=d1")], {
      surface: "store",
      deviceTileVisible: visible,
    });
    expect(hasDot(s, { app: "inventory" })).toBe(false);
    expect(hasDot(s, { app: "drive" })).toBe(true);
  });

  test("pager aggregates: chat rows for the Channel page, tile rows for the Apps page", () => {
    const s = state([row("team", `/manager/channel?c=${CONV}`)], { surface: "personal" });
    expect(s.entries.some((e) => e.counted && DOT_FILTERS.chat(e))).toBe(true);
    expect(s.entries.some((e) => e.counted && DOT_FILTERS.deviceTiles(e))).toBe(false);
  });
});

describe("what a visible /manager page clears", () => {
  test("its placement's rows, and rows linking to it", () => {
    const inv = row("inventory_low", "/manager/inventory");
    const sup = row("order", "/manager/suppliers");
    const doc = row("doc_comment", "/manager/docs/edit?id=d1&comment=t1");
    const form = row("form_response", "/manager/forms/edit?id=f1&view=responses");
    const s = state([inv, sup, doc, form]);
    expect(rowsClearedByPage(s, "/manager/inventory")).toEqual([inv.id]);
    expect(rowsClearedByPage(s, "/manager/suppliers?tab=orders")).toEqual([sup.id]);
    expect(rowsClearedByPage(s, "/manager/drive")).toEqual([doc.id]);
    expect(rowsClearedByPage(s, "/manager/forms")).toEqual([form.id]);
    expect(rowsClearedByPage(s, "/manager/sales")).toEqual([]);
  });

  test("an editor clears only its own item's rows", () => {
    const c1 = row("doc_comment", "/manager/docs/edit?id=d1&thread=t1");
    const s3 = row("doc_share", "/manager/drive/sheet?id=d3");
    const c9 = row("doc_comment", "/manager/docs/edit?id=d9&thread=t2");
    const f1 = row("form_response", "/manager/forms/edit?id=f1&view=responses");
    const f2 = row("form_response", "/manager/forms/edit?id=f2&view=responses");
    const s = state([c1, s3, c9, f1, f2]);
    expect(rowsClearedByPage(s, "/manager/docs/edit?id=d9")).toEqual([c9.id]);
    expect(rowsClearedByPage(s, "/manager/drive/sheet?id=d3")).toEqual([s3.id]);
    expect(rowsClearedByPage(s, "/manager/drive/slides?id=zz")).toEqual([]);
    expect(rowsClearedByPage(s, "/manager/forms/edit?id=f2")).toEqual([f2.id]);
    // The landing pages list them all.
    expect(new Set(rowsClearedByPage(s, "/manager/drive"))).toEqual(new Set([c1.id, s3.id, c9.id]));
    expect(new Set(rowsClearedByPage(s, "/manager/forms"))).toEqual(new Set([f1.id, f2.id]));
  });

  test("chat rows with a conversation never clear on a page (markChatRead does)", () => {
    const s = state([row("team", `/manager/channel?c=${CONV}`)]);
    expect(rowsClearedByPage(s, "/manager/channel")).toEqual([]);
    expect(rowsClearedByPage(s, `/manager/channel?c=${CONV}`)).toEqual([]);
  });

  test("an older chat row without a conversation clears on the channel page", () => {
    const old = row("team", "/manager/channel");
    expect(rowsClearedByPage(state([old]), "/manager/channel")).toEqual([old.id]);
  });

  test("Mr. Merchiva's rows never clear on a page", () => {
    const s = state([row("general", "/manager/dashboard?mvsession=s1")]);
    expect(rowsClearedByPage(s, "/manager/dashboard?mvsession=s1")).toEqual([]);
  });

  test("a row outside this person's nav still clears on its exact page", () => {
    const inv = row("inventory_low", "/manager/inventory");
    expect(rowsClearedByPage(state([inv], { sections: STAFF_SECTIONS }), "/manager/inventory")).toEqual([inv.id]);
  });
});

describe("linkMatchesPage", () => {
  test("same path, same id / c when the link names one", () => {
    expect(linkMatchesPage("/manager/docs/edit?id=d1&comment=t1", "/manager/docs/edit?id=d1")).toBe(true);
    expect(linkMatchesPage("/manager/docs/edit?id=d1", "/manager/docs/edit?id=d2")).toBe(false);
    expect(linkMatchesPage("/manager/inventory", "/manager/inventory?x=1")).toBe(true);
    expect(linkMatchesPage("/manager/personnel", "/manager/personnel/schedule")).toBe(true);
    expect(linkMatchesPage(`/manager/channel?c=${CONV}`, "/manager/channel")).toBe(false);
    expect(linkMatchesPage(null, "/manager/inventory")).toBe(false);
  });
});

describe("sameDotState", () => {
  test("a rebuild with nothing new keeps the state; a read row or another store does not", () => {
    const rows = [row("inventory_low", "/manager/inventory"), row("general", null)];
    const a = state(rows);
    expect(sameDotState(a, state(rows, { nowMs: NOW + 60_000 }))).toBe(true);
    expect(sameDotState(a, state([{ ...rows[0], read: true }, rows[1]]))).toBe(false);
    expect(sameDotState(a, state(rows, { sections: STAFF_SECTIONS }))).toBe(false);
    const elsewhere = row("inventory_low", "/manager/inventory", { organizationId: ORG2 });
    expect(sameDotState(a, state([...rows, elsewhere], { otherOrgAccess: ownerElsewhere }))).toBe(false);
  });
});
