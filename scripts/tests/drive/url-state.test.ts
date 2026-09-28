import { describe, expect, test } from "bun:test";
import {
  DEFAULT_DRIVE_PARAMS,
  DRIVE_CODEC,
  DRIVE_QUERY_MAX,
  defaultSortFor,
  driveParamsKey,
  mergeDriveSearch,
  parseDriveParams,
  previewParam,
  type DriveUrlParams,
} from "@/components/drive/model/url-state";
import { DRIVE_SECTIONS } from "@/components/drive/model/types";
import { DRIVE_HOME_HREF, driveHref } from "@/lib/drive/hrefs";

const F = "0f8e2b1c-3d4a-4b5c-8d6e-7f8091a2b3c4";
const G = "1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d";
const M = "9b8a7c6d-5e4f-4321-a987-6543210fedcb";
const parse = (search: string): DriveUrlParams => parseDriveParams(new URLSearchParams(search));

describe("parseDriveParams", () => {
  test("an empty search is the defaults", () => {
    expect(parse("")).toEqual({ ...DEFAULT_DRIVE_PARAMS });
    expect(DEFAULT_DRIVE_PARAMS).toEqual({
      space: "my", folder: "", member: "", source: "", type: "all", sort: "", view: "", q: "", preview: "",
    });
  });

  test("known values are read", () => {
    expect(parse(`?space=members&member=${M}&folder=${F}&type=image&sort=size&view=list&q=menu&preview=item:${G}`)).toEqual({
      space: "members", folder: F, member: M, source: "", type: "image", sort: "size", view: "list", q: "menu", preview: `item:${G}`,
    });
    expect(parse("?space=apps&source=inventory").source).toBe("inventory");
    for (const space of DRIVE_SECTIONS) expect(parse(`?space=${space}`).space).toBe(space);
  });

  test("unknown values fall back to the defaults", () => {
    expect(parse("?space=everything&type=spreadsheets&sort=random&view=tiles&source=email")).toEqual({ ...DEFAULT_DRIVE_PARAMS });
    expect(parse("?space=MY").space).toBe("my");
  });

  test("folder and member must be uuid v4 and are lowercased", () => {
    expect(parse(`?folder=${F.toUpperCase()}`).folder).toBe(F);
    expect(parse("?folder=not-a-uuid").folder).toBe("");
    expect(parse("?folder=0f8e2b1c-3d4a-1b5c-8d6e-7f8091a2b3c4").folder).toBe(""); // v1
    expect(parse(`?member=${M}x`).member).toBe("");
    expect(parse(`?member=${M.toUpperCase()}`).member).toBe(M);
  });

  test("preview must be an entry key", () => {
    expect(parse(`?preview=item:${G.toUpperCase()}`).preview).toBe(`item:${G}`);
    expect(parse(`?preview=DOC:${G}`).preview).toBe(`doc:${G}`);
    expect(parse(`?preview=doc:${G}`).preview).toBe(`doc:${G}`);
    expect(parse(`?preview=file:${G}`).preview).toBe("");
    expect(parse("?preview=item:123").preview).toBe("");
    expect(parse("?preview=v:chat:abc-123").preview).toBe("v:chat:abc-123");
    expect(parse("?preview=v:tasks:abc-123:12").preview).toBe("v:tasks:abc-123:12");
    expect(parse("?preview=v:tasks:abc-123:1234").preview).toBe("");
    expect(parse("?preview=v:chat:abc_123").preview).toBe("");
    expect(parse("?preview=v:Chat:abc").preview).toBe("");
    expect(parse(`?preview=v:chat:${"a".repeat(80)}`).preview).toBe(`v:chat:${"a".repeat(80)}`);
    expect(parse(`?preview=v:chat:${"a".repeat(81)}`).preview).toBe("");
    expect(previewParam(null)).toBe("");
  });

  test("q is kept raw and capped at 200 characters", () => {
    expect(parse("?q=menu%20").q).toBe("menu ");
    expect(parse(`?q=${"x".repeat(300)}`).q).toHaveLength(DRIVE_QUERY_MAX);
    expect(DRIVE_QUERY_MAX).toBe(200);
  });

  test("a sort equal to the section's default reads as ''", () => {
    expect(parse("?sort=name").sort).toBe("");
    expect(parse("?sort=modified").sort).toBe("modified");
    expect(parse("?space=recent&sort=modified").sort).toBe("");
    expect(parse("?space=recent&sort=name").sort).toBe("name");
    expect(parse("?space=trash&sort=modified").sort).toBe("");
  });
});

describe("defaultSortFor", () => {
  test("recent and trash are newest first, everything else by name", () => {
    expect(DRIVE_SECTIONS.map((s) => [s, defaultSortFor(s)])).toEqual([
      ["my", "name"], ["store", "name"], ["shared", "name"], ["recent", "modified"],
      ["starred", "name"], ["trash", "modified"], ["apps", "name"], ["members", "name"],
    ]);
  });
});

describe("mergeDriveSearch", () => {
  test("defaults are dropped", () => {
    expect(mergeDriveSearch("", { space: "my", type: "all", sort: "name", view: "", q: "", preview: "" })).toBe("");
    expect(mergeDriveSearch("?space=store&type=pdf", { space: "my", type: "all" })).toBe("");
    expect(mergeDriveSearch("?view=list", { view: "" })).toBe("");
  });

  test("params the home doesn't own are kept in place", () => {
    expect(mergeDriveSearch("?dialogs=share", { q: "x" })).toBe("?dialogs=share&q=x");
    expect(mergeDriveSearch("?dialogs=share&q=x", { q: "" })).toBe("?dialogs=share");
    expect(mergeDriveSearch("?q=a&dialogs=share", { q: "b" })).toBe("?q=b&dialogs=share");
  });

  test("naming a space clears folder, member, source and preview, and keeps the search", () => {
    const from = `?folder=${F}&preview=item:${G}&q=abc&member=${M}&source=chat`;
    expect(mergeDriveSearch(from, { space: "store" })).toBe("?q=abc&space=store");
    expect(mergeDriveSearch(from, { space: "my" })).toBe("?q=abc");
  });

  test("a space patch keeps what it names itself", () => {
    expect(mergeDriveSearch(`?folder=${F}`, { space: "members", member: M })).toBe(`?space=members&member=${M}`);
    expect(mergeDriveSearch("", { space: "apps", source: "tasks" })).toBe("?space=apps&source=tasks");
    expect(mergeDriveSearch("?space=trash", { space: "store", folder: F, preview: `item:${G}` })).toBe(
      `?space=store&folder=${F}&preview=item%3A${G}`,
    );
  });

  test("naming a folder clears preview and q unless the patch sets them", () => {
    expect(mergeDriveSearch(`?q=abc&preview=item:${G}&type=image`, { folder: F })).toBe(`?type=image&folder=${F}`);
    expect(mergeDriveSearch(`?q=abc`, { folder: F, preview: `doc:${G}` })).toBe(`?folder=${F}&preview=doc%3A${G}`);
    expect(mergeDriveSearch(`?folder=${F}&q=abc`, { folder: "" })).toBe("");
  });

  test("a preview patch alone keeps the folder and the search", () => {
    expect(mergeDriveSearch(`?folder=${F}&q=abc`, { preview: `item:${G}` })).toBe(`?folder=${F}&q=abc&preview=item%3A${G}`);
    expect(mergeDriveSearch(`?folder=${F}&preview=item:${G}`, { preview: "" })).toBe(`?folder=${F}`);
  });

  test("invalid patch values fall back to the default", () => {
    expect(mergeDriveSearch("?type=pdf", { type: "bogus" as never })).toBe("");
    expect(mergeDriveSearch("", { folder: "../etc" })).toBe("");
    expect(mergeDriveSearch("", { preview: "javascript:alert(1)" })).toBe("");
    expect(mergeDriveSearch("", { space: "admin" as never })).toBe("");
  });

  test("q keeps its trailing space, is capped, and is dropped when blank", () => {
    expect(mergeDriveSearch("", { q: "menu " })).toBe("?q=menu+");
    expect(mergeDriveSearch("", { q: "   " })).toBe("");
    expect(new URLSearchParams(mergeDriveSearch("", { q: "y".repeat(250) })).get("q")).toHaveLength(DRIVE_QUERY_MAX);
  });

  test("a sort is stored only when it differs from the section's default", () => {
    expect(mergeDriveSearch("", { sort: "name" })).toBe("");
    expect(mergeDriveSearch("", { sort: "size" })).toBe("?sort=size");
    expect(mergeDriveSearch("?space=recent", { sort: "name" })).toBe("?space=recent&sort=name");
    expect(mergeDriveSearch("?space=recent&sort=name", { space: "my" })).toBe("");
    expect(mergeDriveSearch("?sort=modified", { space: "recent" })).toBe("?space=recent");
  });

  test("unrelated patches canonicalize junk values of owned params", () => {
    expect(mergeDriveSearch("?type=bogus&folder=nope&dialogs=x", { q: "a" })).toBe("?dialogs=x&q=a");
  });
});

describe("driveParamsKey and DRIVE_CODEC", () => {
  const key = (search: string) => driveParamsKey(parse(search));

  test("the key ignores foreign params and normalizes defaults", () => {
    expect(key("?dialogs=a&q=x")).toBe(key("?q=x"));
    expect(key("?space=my&type=all&sort=name")).toBe(key(""));
    expect(key("?q=x")).not.toBe(key("?q=x&space=starred"));
    expect(key(`?preview=item:${G.toUpperCase()}`)).toBe(key(`?preview=item:${G}`));
  });

  test("the codec is parse / merge / key over search strings", () => {
    expect(DRIVE_CODEC.parse("?space=trash&q=a")).toEqual(parse("?space=trash&q=a"));
    expect(DRIVE_CODEC.merge("?q=a", { space: "starred" })).toBe(mergeDriveSearch("?q=a", { space: "starred" }));
    expect(DRIVE_CODEC.key(parse("?q=a"))).toBe(driveParamsKey(parse("?q=a")));
  });

  test("a written search parses back to what was written", () => {
    const patches: Partial<DriveUrlParams>[] = [
      { space: "store", folder: F, type: "pdf", sort: "size", view: "list", q: "april ", preview: `item:${G}` },
      { space: "members", member: M, folder: G },
      { space: "apps", source: "bugs", preview: "v:bugs:abc-1:2" },
      { space: "recent", sort: "created" },
    ];
    for (const patch of patches) {
      expect(parse(mergeDriveSearch("", patch))).toEqual({ ...DEFAULT_DRIVE_PARAMS, ...patch });
    }
  });
});

describe("parity with lib/drive/hrefs.ts driveHref", () => {
  test("a link and a write give the same URL", () => {
    const cases: { space?: string; folder?: string; member?: string; source?: string; preview?: string }[] = [
      {},
      { space: "my" },
      { space: "store", folder: F },
      { space: "members", member: M, folder: G },
      { space: "apps", source: "chat" },
      { space: "trash", preview: `doc:${G}` },
      { folder: F.toUpperCase(), preview: `ITEM:${G}` },
      { space: "bogus", folder: "nope", member: "x", source: "email", preview: "bad" },
      { preview: "v:inventory:row-1:3" },
    ];
    for (const params of cases) {
      const href = driveHref(params);
      expect(`${DRIVE_HOME_HREF}${mergeDriveSearch("", params as Partial<DriveUrlParams>)}`).toBe(href);
      const query = href.slice(DRIVE_HOME_HREF.length);
      expect(mergeDriveSearch(query, {})).toBe(query);
    }
  });
});
