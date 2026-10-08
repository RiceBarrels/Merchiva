import { describe, expect, test } from "bun:test";
import { documentHref } from "@/lib/docs/hrefs";
import {
  PRESENCE_PATH_MAX,
  isAgentSlot,
  presenceActivity,
  presencePageKeyOf,
  presencePathOf,
  stripRecordKey,
} from "@/lib/presence/path";
import { isPresenceActivity, isPresencePath, isPresenceSlot } from "@/spacetimedb/src/presence/validate";

describe("presencePathOf", () => {
  test("drops the query and hash — doc ids live in the query", () => {
    expect(presencePathOf("/manager/docs/edit?id=3f9c&comment=1")).toBe("/manager/docs/edit");
    expect(presencePathOf("/manager/inventory#top")).toBe("/manager/inventory");
    expect(presencePathOf("/manager/inventory/?q=milk")).toBe("/manager/inventory");
  });

  test("applies the legacy redirects the tab store applies", () => {
    expect(presencePathOf("/manager")).toBe("/manager/new-tab");
    expect(presencePathOf("/manager/personnel")).toBe("/manager/personnel/schedule");
    expect(presencePathOf("/manager/chat")).toBe("/manager/channel");
  });

  test("keeps dynamic segments the module accepts and stops at one it would reject", () => {
    expect(presencePathOf("/manager/personnel/team/8b1f-42")).toBe("/manager/personnel/team/8b1f-42");
    expect(presencePathOf("/manager/personnel/team/J%C3%BCrgen/edit")).toBe("/manager/personnel/team");
    expect(presencePathOf("/manager/inventory//waste")).toBe("/manager/inventory/waste");
  });

  test("is null outside /manager", () => {
    expect(presencePathOf("/store")).toBeNull();
    expect(presencePathOf("/personal/pay")).toBeNull();
    expect(presencePathOf("/managers")).toBeNull();
    expect(presencePathOf("")).toBeNull();
  });

  test("stays within the module's length limit", () => {
    const long = `/manager/${Array.from({ length: 40 }, (_, i) => `segment${i}`).join("/")}`;
    const path = presencePathOf(long) ?? "";
    expect(path.length).toBeLessThanOrEqual(PRESENCE_PATH_MAX);
    expect(long.startsWith(path)).toBe(true);
  });

  test("every path it returns passes the module's validator", () => {
    const urls = [
      "/manager",
      "/manager/new-tab",
      "/manager/docs/edit?id=x",
      "/manager/settings/billing?session_id=cs_1",
      "/manager/personnel/team/J%C3%BCrgen",
      "/manager/a/./b",
      "/manager/a/../b",
      `/manager/${"x".repeat(300)}`,
    ];
    for (const url of urls) {
      const path = presencePathOf(url);
      expect(path).not.toBeNull();
      expect(isPresencePath(path ?? "")).toBe(true);
    }
  });
});

describe("presencePageKeyOf", () => {
  const DOC_X = "6f1d2c3a-0b4e-4f5a-9c8d-7e6f5a4b3c2d";
  const DOC_Y = "0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d";

  test("two documents in the editor are two pages; the same document is one, however it is linked", () => {
    const x = presencePageKeyOf(documentHref(DOC_X));
    const y = presencePageKeyOf(documentHref(DOC_Y));
    expect(x).not.toBeNull();
    expect(x).not.toBe(y);
    expect(x?.startsWith("/manager/docs/edit/~")).toBe(true);
    expect(presencePageKeyOf(documentHref(DOC_X, { comment: "t1", version: "v2" }))).toBe(x);
    expect(presencePageKeyOf(`/manager/docs/edit/?id=${DOC_X.toUpperCase()}#c`)).toBe(x);
    expect(presencePageKeyOf(`/manager/docs/edit?new=1&id=${encodeURIComponent(` ${DOC_X} `)}`)).toBe(x);
  });

  test("publishes a hash, never the record id", () => {
    const key = presencePageKeyOf(documentHref(DOC_X)) ?? "";
    expect(key).not.toContain(DOC_X);
    expect(key).not.toContain(DOC_X.slice(0, 8));
  });

  test("routes that keep no record in the query, and the editor without one, stay the bare path", () => {
    expect(presencePageKeyOf("/manager/docs/edit")).toBe("/manager/docs/edit");
    expect(presencePageKeyOf("/manager/docs/edit?id=")).toBe("/manager/docs/edit");
    expect(presencePageKeyOf("/manager/docs?id=abc")).toBe("/manager/docs");
    expect(presencePageKeyOf("/manager/settings/billing?session_id=cs_1")).toBe("/manager/settings/billing");
    expect(presencePageKeyOf("/manager/personnel")).toBe("/manager/personnel/schedule");
    expect(presencePageKeyOf("/store")).toBeNull();
  });

  test("stripping the record segment gives the route back (nav rows, Mr. Merchiva)", () => {
    expect(stripRecordKey(presencePageKeyOf(documentHref(DOC_X)) ?? "")).toBe("/manager/docs/edit");
    expect(stripRecordKey("/manager/inventory/waste")).toBe("/manager/inventory/waste");
    expect(stripRecordKey("/manager/personnel/team/8b1f-42")).toBe("/manager/personnel/team/8b1f-42");
  });

  test("every key passes the module's validator (no publish needed)", () => {
    for (const url of [documentHref(DOC_X), documentHref(DOC_Y), `/manager/docs/edit?id=${"z".repeat(500)}`]) {
      expect(isPresencePath(presencePageKeyOf(url) ?? "")).toBe(true);
    }
  });
});

describe("agent slot and activity", () => {
  test("browser-shell tab ids and the window scope are valid slots", () => {
    for (const scope of ["t_k3j9x0a1bc", "__window__"]) {
      expect(isAgentSlot(scope)).toBe(true);
      expect(isPresenceSlot("agent", scope)).toBe(true);
    }
    expect(isAgentSlot("")).toBe(false);
    expect(isAgentSlot("a b")).toBe(false);
    expect(isAgentSlot("x".repeat(81))).toBe(false);
  });

  test("activities are made acceptable: other characters become _ and long MCP keys are cut", () => {
    expect(presenceActivity("viewInventory")).toBe("viewInventory");
    expect(presenceActivity("mcp_my.server_list items")).toBe("mcp_my_server_list_items");
    const long = presenceActivity(`mcp_${"a".repeat(80)}_2`);
    expect(long.length).toBe(80);
    for (const tool of ["viewInventory", "mcp_my.server_list items", `mcp_${"a".repeat(80)}_2`, ""]) {
      expect(isPresenceActivity(presenceActivity(tool))).toBe(true);
    }
  });
});
