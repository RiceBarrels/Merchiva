// The Slides editor UI reducer (lib/slides/editor/ui-state.ts): selection and editing rules, panels and dialogs,
// preference sanitizing, and the reconciliation with a changing deck (deleted slides, vanished elements).
import { describe, expect, test } from "bun:test";

import {
  DEFAULT_SLIDES_PREFS, RAIL_WIDTH_MAX, initSlidesUiState, presentStartSlide, sanitizeSlidesPrefs, slidesUiReducer,
  type SlidesUiAction, type SlidesUiState,
} from "@/lib/slides/editor/ui-state";
import { addElements, deleteElements } from "@/lib/slides/model/ops-elements";
import { deleteTableRows } from "@/lib/slides/model/ops-table";
import { deleteSlides, insertSlide, setSlidesProps } from "@/lib/slides/model/ops-slides";
import { newTable } from "@/lib/slides/editor/elements";
import { SIZE, deckStateOf, flush, sampleDoc } from "./helpers";

function run(s: SlidesUiState, ...actions: SlidesUiAction[]): SlidesUiState {
  return actions.reduce(slidesUiReducer, s);
}

describe("init", () => {
  test("starts on ?slide= when the deck has it, else the first slide; prefs are applied", async () => {
    const { state } = await deckStateOf(sampleDoc());
    const deck = state();
    const onB = initSlidesUiState({ deck, initialSlideId: "slideB", prefs: { ...DEFAULT_SLIDES_PREFS, zoom: 1.5, snap: false } });
    expect(onB.currentSlideId).toBe("slideB");
    expect(onB.slideSelection).toEqual(["slideB"]);
    expect(onB.zoom).toBe(1.5);
    expect(onB.snap).toBe(false);
    expect(initSlidesUiState({ deck, initialSlideId: "nope" }).currentSlideId).toBe("slideA");
    expect(initSlidesUiState({ deck, initialSlideId: null, startPresenting: true }).presenting).toEqual({ startSlideId: "slideA", speaker: "none" });
  });

  test("stored prefs are sanitized", () => {
    expect(sanitizeSlidesPrefs(null)).toEqual(DEFAULT_SLIDES_PREFS);
    expect(sanitizeSlidesPrefs({ notesOpen: "yes", notesHeight: 9999, railWidth: -3, zoom: "big", snap: 1 })).toEqual({
      ...DEFAULT_SLIDES_PREFS,
      notesHeight: 320,
      railWidth: 160,
      zoom: "fit",
    });
    expect(sanitizeSlidesPrefs({ railWidth: 9999, zoom: 0.5 }).railWidth).toBe(RAIL_WIDTH_MAX);
  });
});

describe("selection and editing", () => {
  test("selecting another element ends editing; re-selecting the edited one alone keeps it", async () => {
    const { state } = await deckStateOf(sampleDoc());
    const s0 = initSlidesUiState({ deck: state(), initialSlideId: null });
    const editing = run(s0, { type: "startEdit", elementId: "e1" });
    expect(editing.selection).toEqual(["e1"]);
    expect(editing.editing).toEqual({ elementId: "e1" });
    expect(run(editing, { type: "select", ids: ["e1"] })).toBe(editing);
    expect(run(editing, { type: "select", ids: ["e1", "e2"] }).editing).toBeNull();
    expect(run(editing, { type: "select", ids: [] }).editing).toBeNull();
    expect(run(editing, { type: "endEdit" }).selection).toEqual(["e1"]);
  });

  test("changing slide clears element selection and editing", async () => {
    const { state } = await deckStateOf(sampleDoc());
    const s = run(initSlidesUiState({ deck: state(), initialSlideId: null }), { type: "startEdit", elementId: "e1" }, { type: "selectSlide", slideId: "slideB" });
    expect(s).toMatchObject({ currentSlideId: "slideB", slideSelection: ["slideB"], selection: [], editing: null });
  });

  test("rail multi-select keeps its current slide last unless told otherwise", async () => {
    const { state } = await deckStateOf(sampleDoc());
    const s = run(initSlidesUiState({ deck: state(), initialSlideId: null }), { type: "selectSlides", slideIds: ["slideA", "slideB", "slideA"] });
    expect(s.slideSelection).toEqual(["slideA", "slideB"]);
    expect(s.currentSlideId).toBe("slideB");
  });

  test("undoing typing inside the edited box keeps editing; another element's step ends it", async () => {
    const { state } = await deckStateOf(sampleDoc());
    const editing = run(initSlidesUiState({ deck: state(), initialSlideId: null }), { type: "startEdit", elementId: "e1" });
    expect(run(editing, { type: "restoreSelection", slideId: "slideA", elementIds: ["e1"] }).editing).toEqual({ elementId: "e1" });
    expect(run(editing, { type: "restoreSelection", slideId: "slideA", elementIds: ["e2"] })).toMatchObject({ editing: null, selection: ["e2"] });
    expect(run(editing, { type: "restoreSelection", slideId: "slideB", elementIds: ["e1"] }).editing).toBeNull();
  });

  test("an undo step restores its slide and selection", async () => {
    const { state } = await deckStateOf(sampleDoc());
    const s = run(initSlidesUiState({ deck: state(), initialSlideId: null }), { type: "restoreSelection", slideId: "slideB", elementIds: ["x", "x", "y"] });
    expect(s).toMatchObject({ currentSlideId: "slideB", slideSelection: ["slideB"], selection: ["x", "y"], editing: null });
  });
});

describe("panels, dialogs, modes", () => {
  test("a panel toggles; closing history drops the previewed version", async () => {
    const { state } = await deckStateOf(sampleDoc());
    let s = initSlidesUiState({ deck: state(), initialSlideId: null });
    s = run(s, { type: "openPanel", panel: "history" }, { type: "previewVersion", versionId: "v1" });
    expect(s).toMatchObject({ rightPanel: "history", previewVersionId: "v1" });
    expect(run(s, { type: "openPanel", panel: "history" })).toMatchObject({ rightPanel: "none", previewVersionId: null });
    expect(run(s, { type: "openPanel", panel: "theme" })).toMatchObject({ rightPanel: "theme", previewVersionId: null });
  });

  test("restore confirmation carries its version and forgets it on close", async () => {
    const { state } = await deckStateOf(sampleDoc());
    const s = run(initSlidesUiState({ deck: state(), initialSlideId: null }), { type: "requestRestore", versionId: "v9" });
    expect(s).toMatchObject({ dialog: "restoreConfirm", restoreVersionId: "v9" });
    expect(run(s, { type: "closeDialog" })).toMatchObject({ dialog: null, restoreVersionId: null });
  });

  test("zoom and sizes are clamped; phone view mode drops selection and sheets", async () => {
    const { state } = await deckStateOf(sampleDoc());
    let s = initSlidesUiState({ deck: state(), initialSlideId: null });
    expect(run(s, { type: "setZoom", zoom: 99 }).zoom).toBe(4);
    expect(run(s, { type: "setNotesHeight", height: 10 }).notesHeight).toBe(80);
    s = run(s, { type: "setMobileMode", mode: "edit" }, { type: "select", ids: ["a"] }, { type: "openMobileSheet", sheet: "add" });
    expect(run(s, { type: "setMobileMode", mode: "view" })).toMatchObject({ mobileMode: "view", selection: [], mobileSheet: null });
  });

  test("presenting starts where asked and editing stops", async () => {
    const { state } = await deckStateOf(sampleDoc());
    const s = run(initSlidesUiState({ deck: state(), initialSlideId: null }), { type: "startEdit", elementId: "e" }, { type: "present", startSlideId: "slideB", speaker: "window" });
    expect(s).toMatchObject({ presenting: { startSlideId: "slideB", speaker: "window" }, editing: null });
    expect(run(s, { type: "stopPresenting" }).presenting).toBeNull();
  });
});

describe("reconciling with the deck", () => {
  test("a deleted current slide gives way to the slide now at its position", async () => {
    const doc = sampleDoc();
    const { state } = await deckStateOf(doc);
    const extra = insertSlide(doc, { afterSlideId: "slideA", layout: "blank" }); // A, extra, B
    await flush();
    let s = run(initSlidesUiState({ deck: state(), initialSlideId: extra }), { type: "deckChanged", deck: state() });
    expect(s.currentSlideId).toBe(extra);
    deleteSlides(doc, [extra]);
    await flush();
    s = run(s, { type: "deckChanged", deck: state() });
    expect(s.currentSlideId).toBe("slideB");
    expect(s.slideSelection).toEqual(["slideB"]);
  });

  test("the last slide deleted by someone else → the new last one", async () => {
    const doc = sampleDoc();
    const { state } = await deckStateOf(doc);
    let s = run(initSlidesUiState({ deck: state(), initialSlideId: "slideB" }), { type: "deckChanged", deck: state() });
    deleteSlides(doc, ["slideB"]);
    await flush();
    s = run(s, { type: "deckChanged", deck: state() });
    expect(s.currentSlideId).toBe("slideA");
  });

  test("vanished elements drop out of the selection; the edited one raises elementRemoved", async () => {
    const doc = sampleDoc();
    const { state } = await deckStateOf(doc);
    const [first, second] = state().slides.get("slideA")!.elements.map((e) => e.id);
    let s = initSlidesUiState({ deck: state(), initialSlideId: "slideA" });
    s = run(s, { type: "select", ids: [first, second] });
    deleteElements(doc, "slideA", [second]);
    await flush();
    s = run(s, { type: "deckChanged", deck: state() });
    expect(s.selection).toEqual([first]);
    expect(s.notice).toBeNull();
    s = run(s, { type: "startEdit", elementId: first });
    deleteElements(doc, "slideA", [first]);
    await flush();
    s = run(s, { type: "deckChanged", deck: state() });
    expect(s.editing).toBeNull();
    expect(s.selection).toEqual([]);
    expect(s.notice).toEqual({ code: "elementRemoved", seq: 1 });
  });

  test("a table cell being typed in loses its row → editing ends", async () => {
    const doc = sampleDoc();
    const { state } = await deckStateOf(doc);
    const [tableId] = addElements(doc, "slideA", [newTable(2, 2, SIZE)]);
    await flush();
    const table = state().slides.get("slideA")!.elements.find((e) => e.id === tableId);
    if (!table || table.type !== "table") throw new Error("no table");
    let s = run(initSlidesUiState({ deck: state(), initialSlideId: "slideA" }), { type: "startEdit", elementId: tableId, cellKey: `${table.rows[0].id}:${table.cols[0].id}` });
    deleteTableRows(doc, "slideA", tableId, [table.rows[0].id]);
    await flush();
    s = run(s, { type: "deckChanged", deck: state() });
    expect(s.editing).toBeNull();
    expect(s.notice?.code).toBe("elementRemoved");
  });

  test("an unchanged deck returns the same state object", async () => {
    const { state } = await deckStateOf(sampleDoc());
    const s = run(initSlidesUiState({ deck: state(), initialSlideId: null }), { type: "deckChanged", deck: state() });
    expect(run(s, { type: "deckChanged", deck: state() })).toBe(s);
  });
});

test("a show starts on the current slide, or on the first one that is not skipped", async () => {
  const doc = sampleDoc();
  const { state } = await deckStateOf(doc);
  setSlidesProps(doc, ["slideA"], { hidden: true });
  await flush();
  expect(presentStartSlide(state(), "start", "slideA")).toBe("slideB");
  expect(presentStartSlide(state(), "current", "slideA")).toBe("slideA");
  expect(presentStartSlide(state(), "current", "gone")).toBe("slideB");
});
