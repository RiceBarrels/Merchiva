// lib/drive/hrefs.ts — Drive home links and the editor links of every document type.
// The comparison with the module's docLink lives in parity.test.ts.

import { describe, expect, test } from "bun:test";
import { DOCS_EDIT_PATH, documentHref } from "@/lib/docs/hrefs";
import { mergeDriveSearch, parseDriveParams } from "@/components/drive/model/url-state";
import {
  DRIVE_HOME_HREF,
  SHEET_EDIT_PATH,
  SLIDES_EDIT_PATH,
  documentFileHref,
  driveHref,
  driveKindHref,
  parseEditorHref,
  sheetHref,
  slidesHref,
} from "@/lib/drive/hrefs";

const ID = "1f0e4c52-8d1a-4b6e-9c3f-2a7b5d9e0c11";
const FOLDER = "7a2b9c4d-1e3f-4a5b-8c6d-9e0f1a2b3c4d";
const MEMBER = "0b6f3a1e-2c4d-4e5f-9a6b-7c8d9e0f1a2b";

describe("paths", () => {
  test("the three routes", () => {
    expect(DRIVE_HOME_HREF).toBe("/manager/drive");
    expect(SHEET_EDIT_PATH).toBe("/manager/drive/sheet");
    expect(SLIDES_EDIT_PATH).toBe("/manager/drive/slides");
  });
});

describe("driveHref", () => {
  test("defaults are dropped", () => {
    expect(driveHref()).toBe(DRIVE_HOME_HREF);
    expect(driveHref({})).toBe(DRIVE_HOME_HREF);
    expect(driveHref({ space: "my", folder: "", member: "", source: "", preview: "" })).toBe(DRIVE_HOME_HREF);
  });

  test("keeps valid values, in the codec's order, lowercasing ids", () => {
    expect(driveHref({ space: "store" })).toBe("/manager/drive?space=store");
    expect(driveHref({ folder: FOLDER.toUpperCase() })).toBe(`/manager/drive?folder=${FOLDER}`);
    expect(driveHref({ preview: `doc:${ID}`, member: MEMBER, space: "members", folder: FOLDER })).toBe(
      `/manager/drive?space=members&folder=${FOLDER}&member=${MEMBER}&preview=doc%3A${ID}`,
    );
    expect(driveHref({ space: "apps", source: "chat", preview: "v:chat:abc-123:2" })).toBe(
      "/manager/drive?space=apps&source=chat&preview=v%3Achat%3Aabc-123%3A2",
    );
    expect(driveHref({ preview: `ITEM:${ID.toUpperCase()}` })).toBe(`/manager/drive?preview=item%3A${ID}`);
    expect(driveHref({ space: "apps", source: "forms", preview: `v:forms:${ID}` })).toBe(
      `/manager/drive?space=apps&source=forms&preview=v%3Aforms%3A${ID}`,
    );
  });

  test("drops what the home would ignore", () => {
    expect(driveHref({ space: "everything" })).toBe(DRIVE_HOME_HREF);
    expect(driveHref({ folder: "not-a-uuid", member: "1f0e4c52-8d1a-1b6e-9c3f-2a7b5d9e0c11" })).toBe(DRIVE_HOME_HREF);
    expect(driveHref({ source: "email" })).toBe(DRIVE_HOME_HREF);
    for (const preview of ["item:x", `file:${ID}`, "v:Chat:x", "v:chat:", `v:chat:${"a".repeat(81)}`, "v:chat:a:1234"]) {
      expect(driveHref({ preview })).toBe(DRIVE_HOME_HREF);
    }
  });

  test("round-trips through URLSearchParams", () => {
    const href = driveHref({ space: "store", folder: FOLDER, preview: `item:${ID}` });
    const params = new URL(href, "https://app.local").searchParams;
    expect([...params.entries()]).toEqual([["space", "store"], ["folder", FOLDER], ["preview", `item:${ID}`]]);
  });

  test("type filter: one of the home's kinds, never the default", () => {
    for (const type of ["folder", "doc", "sheet", "slides", "image", "pdf", "video", "audio", "other"]) {
      expect(driveHref({ type })).toBe(`/manager/drive?type=${type}`);
    }
    for (const type of ["all", "", "docs", "Sheet", "spreadsheet"]) expect(driveHref({ type })).toBe(DRIVE_HOME_HREF);
  });

  test("search query: trimmed, written when non-empty, capped at the home's 200 characters", () => {
    expect(driveHref({ q: "  opening checklist " })).toBe("/manager/drive?q=opening+checklist");
    expect(driveHref({ q: "   " })).toBe(DRIVE_HOME_HREF);
    expect(driveHref({ q: "" })).toBe(DRIVE_HOME_HREF);
    const long = new URL(driveHref({ q: "x".repeat(250) }), "https://app.local").searchParams.get("q");
    expect(long).toBe("x".repeat(200));
    expect(new URL(driveHref({ q: "a&b=c#d" }), "https://app.local").searchParams.get("q")).toBe("a&b=c#d");
  });

  test("type and q sit in the codec's order: space, folder, member, source, type, q, preview", () => {
    const href = driveHref({ preview: `doc:${ID}`, q: "menu", type: "doc", folder: FOLDER, space: "store" });
    expect(href).toBe(`/manager/drive?space=store&folder=${FOLDER}&type=doc&q=menu&preview=doc%3A${ID}`);
  });

  test("driveKindHref: Drive's recent view of one editor's files", () => {
    expect(driveKindHref("doc")).toBe("/manager/drive?space=recent&type=doc");
    expect(driveKindHref("sheet")).toBe("/manager/drive?space=recent&type=sheet");
    expect(driveKindHref("slides")).toBe("/manager/drive?space=recent&type=slides");
  });

  test("the home's URL codec reads type and q back, and writes the same string", () => {
    const href = driveHref({ space: "recent", type: "sheet", q: "rota" });
    const search = href.slice(href.indexOf("?"));
    const params = parseDriveParams(new URLSearchParams(search));
    expect([params.space, params.type, params.q]).toEqual(["recent", "sheet", "rota"]);
    expect(mergeDriveSearch("", { space: "recent", type: "sheet", q: "rota" })).toBe(search);
  });
});

describe("editor links", () => {
  test("sheetHref", () => {
    expect(sheetHref(ID)).toBe(`/manager/drive/sheet?id=${ID}`);
    expect(sheetHref(` ${ID.toUpperCase()} `, { isNew: true })).toBe(`/manager/drive/sheet?id=${ID}&new=1`);
    expect(sheetHref(ID, { version: "v 1", isNew: false })).toBe(`/manager/drive/sheet?id=${ID}&version=v%201`);
  });

  test("slidesHref", () => {
    expect(slidesHref(ID)).toBe(`/manager/drive/slides?id=${ID}`);
    expect(slidesHref(ID, { slide: "s/1", version: "v1", isNew: true, present: true })).toBe(
      `/manager/drive/slides?id=${ID}&slide=s%2F1&version=v1&new=1&present=1`,
    );
    expect(slidesHref(ID, { present: false, slide: "" })).toBe(`/manager/drive/slides?id=${ID}`);
  });

  test("documentFileHref: each type opens its own editor", () => {
    expect(documentFileHref({ id: ID, fileType: "doc" })).toBe(documentHref(ID));
    expect(documentFileHref({ id: ID, fileType: "doc" }, { comment: "t1", isNew: true })).toBe(documentHref(ID, { comment: "t1", isNew: true }));
    expect(documentFileHref({ id: ID, fileType: "sheet" })).toBe(sheetHref(ID));
    expect(documentFileHref({ id: ID, fileType: "sheet" }, { version: "v2", isNew: true })).toBe(sheetHref(ID, { version: "v2", isNew: true }));
    expect(documentFileHref({ id: ID, fileType: "slides" }, { isNew: true })).toBe(slidesHref(ID, { isNew: true }));
    // A comment thread is kept for every type, like the module's docLink.
    expect(documentFileHref({ id: ID, fileType: "sheet" }, { comment: "t1" })).toBe(`${SHEET_EDIT_PATH}?id=${ID}&comment=t1`);
    expect(documentFileHref({ id: ID, fileType: "slides" }, { comment: "t1" })).toBe(`${SLIDES_EDIT_PATH}?id=${ID}&comment=t1`);
  });

  test("documentFileHref: a newer client's type goes to the Drive home", () => {
    expect(documentFileHref({ id: ID, fileType: "unknown" })).toBe(DRIVE_HOME_HREF);
    expect(documentFileHref({ id: ID, fileType: "unknown" }, { comment: "t1" })).toBe(DRIVE_HOME_HREF);
  });
});

describe("parseEditorHref", () => {
  test("the three editors, with a trailing slash, a hash or extra params", () => {
    expect(parseEditorHref(`${DOCS_EDIT_PATH}?id=${ID}`)).toEqual({ kind: "doc", id: ID });
    expect(parseEditorHref(`${SHEET_EDIT_PATH}/?id=${ID.toUpperCase()}&new=1`)).toEqual({ kind: "sheet", id: ID });
    expect(parseEditorHref(`${SLIDES_EDIT_PATH}?slide=s1&id=${ID}#notes`)).toEqual({ kind: "slides", id: ID });
    expect(parseEditorHref(`${SLIDES_EDIT_PATH}//?id=${ID}&present=1`)).toEqual({ kind: "slides", id: ID });
  });

  test("round-trips every link builder", () => {
    for (const fileType of ["doc", "sheet", "slides"] as const) {
      expect(parseEditorHref(documentFileHref({ id: ID, fileType }, { comment: "t", version: "v", isNew: true }))).toEqual({ kind: fileType, id: ID });
    }
    expect(parseEditorHref(slidesHref(ID, { slide: "s", present: true }))).toEqual({ kind: "slides", id: ID });
  });

  test("rejects bad ids and other paths", () => {
    for (const href of [
      `${SHEET_EDIT_PATH}?id=not-a-uuid`,
      `${SHEET_EDIT_PATH}?id=1f0e4c52-8d1a-1b6e-9c3f-2a7b5d9e0c11`,
      SHEET_EDIT_PATH,
      `${SHEET_EDIT_PATH}?doc=${ID}`,
      `/manager/drive?id=${ID}`,
      `/manager/drive/sheets?id=${ID}`,
      `/manager/docs?id=${ID}`,
      `https://evil.example${SHEET_EDIT_PATH}?id=${ID}`,
      `#${SHEET_EDIT_PATH}?id=${ID}`,
      "",
    ]) {
      expect(parseEditorHref(href)).toBeNull();
    }
    expect(parseEditorHref(42 as unknown as string)).toBeNull();
  });
});
