// Peer grouping (lib/slides/editor/peers.ts), the text fragment lookup behind the pre-mounted editor
// (lib/slides/editor/text-target.ts: read-only, never creates a cell) and the File ▸ Download plan
// (components/slides/export/export-deck.ts planSlidesExport).
import { describe, expect, test } from "bun:test";
import * as Y from "yjs";

import { isEmptyExport, isExportAbort, planSlidesExport } from "@/components/slides/export/export-deck";
import { newTable, newTextBox } from "@/lib/slides/editor/elements";
import { NO_SLIDES_PEERS, editedElementId, groupPeers, samePeerLists } from "@/lib/slides/editor/peers";
import { elementTextFragment, textTargetKey } from "@/lib/slides/editor/text-target";
import { EmptyExportError } from "@/lib/slides/export/pdf";
import { addElements } from "@/lib/slides/model/ops-elements";
import { deckMaps, readDeckSnapshot } from "@/lib/slides/model/read";
import type { PeerSlides } from "@/lib/slides/presence";
import { SIZE, sampleDeckSnapshot, sampleDoc } from "./helpers";

const peer = (yClientId: number, over: Partial<PeerSlides>): PeerSlides => ({
  v: 1, slideId: "s1", sel: [], edit: null, yClientId, memberId: `m${yClientId}`, name: `P${yClientId}`, color: "#112233", ...over,
});

describe("peers", () => {
  test("grouped by slide and by element (selection, edited element, a table cell's table), once each", () => {
    const a = peer(1, { sel: ["e1", "e2"], edit: "e1" });
    const b = peer(2, { slideId: "s2", sel: [], edit: "t1/r1:c1" });
    const c = peer(3, { slideId: null, sel: ["e9"] });
    const state = groupPeers([a, b, c]);
    expect([...state.bySlide.keys()]).toEqual(["s1", "s2"]);
    expect(state.byElement.get("e1")).toEqual([a]);
    expect(state.byElement.get("t1")).toEqual([b]);
    expect(state.byElement.has("e9")).toBe(false);
    expect(groupPeers([])).toBe(NO_SLIDES_PEERS);
    expect(editedElementId("t1/r1:c1")).toBe("t1");
  });

  test("equal lists compare equal (no re-render for a caret-only awareness change)", () => {
    expect(samePeerLists([peer(1, { sel: ["a"] })], [peer(1, { sel: ["a"] })])).toBe(true);
    expect(samePeerLists([peer(1, { sel: ["a"] })], [peer(1, { sel: ["b"] })])).toBe(false);
  });
});

describe("text target", () => {
  test("finds a text box's and a table cell's fragment; wrong types and missing cells are null, and nothing is written", () => {
    const doc = sampleDoc();
    const [boxId, tableId] = addElements(doc, "slideA", [newTextBox(SIZE), newTable(1, 1, SIZE)]);
    const table = readDeckSnapshot(doc).slides[0].elements.find((e) => e.id === tableId);
    if (!table || table.type !== "table") throw new Error("table");
    const cell = `${table.rows[0].id}:${table.cols[0].id}`;
    expect(elementTextFragment(doc, "slideA", boxId)).toBeInstanceOf(Y.XmlFragment);
    expect(elementTextFragment(doc, "slideA", tableId, cell)).toBeInstanceOf(Y.XmlFragment);
    let writes = 0;
    doc.on("update", () => writes++);
    expect(elementTextFragment(doc, "slideA", tableId)).toBeNull();
    expect(elementTextFragment(doc, "slideA", tableId, `${table.rows[0].id}:zzz`)).toBeNull();
    expect(elementTextFragment(doc, "slideA", boxId, cell)).toBeNull();
    expect(elementTextFragment(doc, "nope", boxId)).toBeNull();
    expect(elementTextFragment(doc, "slideA", "bad id!")).toBeNull();
    expect(writes).toBe(0);
    expect(deckMaps(doc).slides.get("slideA")).toBeDefined();
    expect(textTargetKey(tableId, cell)).toBe(`${tableId}/${cell}`);
  });
});

describe("download plan", () => {
  const snap = sampleDeckSnapshot();
  const hidden = { ...snap, slides: [{ ...snap.slides[0], hidden: true }, snap.slides[1]] };
  const opts = { title: "Q3 / plan", untitled: "Untitled presentation", currentSlideId: null };

  test("a PDF leaves skipped slides out; .pptx keeps them (marked hidden)", () => {
    expect(planSlidesExport(hidden, "pdf", opts).slideIds).toEqual(["slideB"]);
    expect(planSlidesExport(hidden, "pptx", opts).slideIds).toEqual(["slideA", "slideB"]);
  });

  test("a PNG is the current slide, else the first", () => {
    expect(planSlidesExport(snap, "png", { ...opts, currentSlideId: "slideB" }).slideIds).toEqual(["slideB"]);
    expect(planSlidesExport(snap, "png", { ...opts, currentSlideId: "gone" }).slideIds).toEqual(["slideA"]);
  });

  test("file names drop characters file systems refuse, and fall back to the untitled name", () => {
    expect(planSlidesExport(snap, "pptx", opts).fileName).toBe("Q3 plan.pptx");
    expect(planSlidesExport(snap, "pdf", { ...opts, title: "  " }).fileName).toBe("Untitled presentation.pdf");
  });

  test("nothing to export and a cancel are recognised by name", () => {
    expect(isEmptyExport(new EmptyExportError())).toBe(true);
    expect(isEmptyExport(Object.assign(new Error("x"), { name: "EmptyExportError" }))).toBe(true);
    expect(isExportAbort(new DOMException("x", "AbortError"))).toBe(true);
    expect(isExportAbort(new Error("x"))).toBe(false);
  });
});
