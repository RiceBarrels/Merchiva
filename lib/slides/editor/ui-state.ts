// Editor UI state of one open deck (slides.md §7.2): which slide is shown, what is selected or being typed in,
// panels, dialogs, presenting, phone modes, and the per-viewer preferences. A plain reducer, re-exported by
// components/slides/editor/slides-context.tsx (the public entry); pure, so it is tested without a DOM.
//
// The deck changes under the editor (collaborators, undo, restore). `deckChanged` reconciles the state with the new
// DeckState: a deleted current slide gives way to the slide now at its position, selected elements that are gone
// drop out, and an element that vanished while being typed in ends editing and raises the elementRemoved notice.
import type { DeckState } from "@/lib/slides/model/deck-store";
import type { ImportReport } from "@/lib/slides/import/report";
import type { SlideSnapshot } from "@/lib/slides/model/types";

export type SlidesRightPanel = "none" | "theme" | "format" | "history";
export type SlidesDialog =
  | null
  | "share"
  | "rename"
  | "restoreConfirm"
  | "importPptx"
  | "importReport"
  | "insertTable"
  | "imageUrl"
  | "trashConfirm"
  | "nameVersion";
export type SlidesMobileSheet = "add" | "element" | "notes" | "slide" | "more";
export type SpeakerMode = "none" | "inline" | "window";
/** The element being typed in; `cellKey` ("rowId:colId") for a table cell. */
export interface SlidesEditingTarget { elementId: string; cellKey?: string }

export interface SlidesUiState {
  currentSlideId: string | null;
  /** Slides picked in the rail (Shift / Mod click); always holds currentSlideId when there is one. */
  slideSelection: readonly string[];
  /** Selected elements of the current slide. */
  selection: readonly string[];
  editing: SlidesEditingTarget | null;
  rightPanel: SlidesRightPanel;
  notesOpen: boolean;
  notesHeight: number;
  railWidth: number;
  view: "edit" | "grid";
  zoom: number | "fit";
  snap: boolean;
  dialog: SlidesDialog;
  /** The version the restore confirmation is about. */
  restoreVersionId: string | null;
  /** The version shown instead of the live deck (version history). */
  previewVersionId: string | null;
  /** The report the importReport dialog shows. */
  importReport: ImportReport | null;
  presenting: null | { startSlideId: string; speaker: SpeakerMode };
  mobileMode: "view" | "edit";
  mobileSheet: SlidesMobileSheet | null;
  /** A one-off message for the editor to show (seq changes each time). */
  notice: { code: "elementRemoved"; seq: number } | null;
  /** The deck's slide order when last reconciled: where a deleted current slide was. */
  deckSlideIds: readonly string[];
}

export type SlidesUiAction =
  | { type: "selectSlide"; slideId: string | null }
  | { type: "selectSlides"; slideIds: readonly string[]; current?: string }
  | { type: "select"; ids: readonly string[] }
  | { type: "startEdit"; elementId: string; cellKey?: string }
  | { type: "endEdit" }
  | { type: "restoreSelection"; slideId: string | null; elementIds: readonly string[] }
  | { type: "openPanel"; panel: Exclude<SlidesRightPanel, "none"> }
  | { type: "closePanel" }
  | { type: "toggleNotes"; open?: boolean }
  | { type: "setNotesHeight"; height: number }
  | { type: "setRailWidth"; width: number }
  | { type: "setView"; view: "edit" | "grid" }
  | { type: "setZoom"; zoom: number | "fit" }
  | { type: "setSnap"; snap: boolean }
  | { type: "openDialog"; dialog: Exclude<SlidesDialog, null> }
  | { type: "closeDialog" }
  | { type: "requestRestore"; versionId: string }
  | { type: "previewVersion"; versionId: string | null }
  | { type: "showImportReport"; report: ImportReport }
  | { type: "present"; startSlideId: string; speaker?: SpeakerMode }
  | { type: "stopPresenting" }
  | { type: "setMobileMode"; mode: "view" | "edit" }
  | { type: "openMobileSheet"; sheet: SlidesMobileSheet }
  | { type: "closeMobileSheet" }
  | { type: "deckChanged"; deck: DeckState };

/** Per-viewer preferences, kept in localStorage under SLIDES_PREFS_KEY. */
export interface SlidesPrefs { notesOpen: boolean; notesHeight: number; railWidth: number; zoom: number | "fit"; snap: boolean }

export const SLIDES_PREFS_KEY = "merchiva:slides:prefs:v1";
export const NOTES_HEIGHT_MIN = 80;
export const NOTES_HEIGHT_MAX = 320;
export const RAIL_WIDTH_MIN = 160;
export const RAIL_WIDTH_MAX = 280;
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;
export const DEFAULT_SLIDES_PREFS: SlidesPrefs = Object.freeze({ notesOpen: false, notesHeight: 120, railWidth: 200, zoom: "fit", snap: true });

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function cleanZoom(raw: unknown): number | "fit" {
  return raw === "fit" ? "fit" : typeof raw === "number" && Number.isFinite(raw) ? clamp(raw, ZOOM_MIN, ZOOM_MAX) : "fit";
}

/** Stored prefs → clean prefs (anything missing or malformed takes its default). */
export function sanitizeSlidesPrefs(raw: unknown): SlidesPrefs {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const num = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
  const d = DEFAULT_SLIDES_PREFS;
  return {
    notesOpen: typeof r.notesOpen === "boolean" ? r.notesOpen : d.notesOpen,
    notesHeight: num(r.notesHeight, d.notesHeight, NOTES_HEIGHT_MIN, NOTES_HEIGHT_MAX),
    railWidth: num(r.railWidth, d.railWidth, RAIL_WIDTH_MIN, RAIL_WIDTH_MAX),
    zoom: r.zoom === undefined ? d.zoom : cleanZoom(r.zoom),
    snap: typeof r.snap === "boolean" ? r.snap : d.snap,
  };
}

export interface SlidesUiInit {
  deck: DeckState;
  /** `?slide=`; ignored when the deck has no such slide. */
  initialSlideId: string | null;
  /** `?present=1`: start presenting from the initial slide. */
  startPresenting?: boolean;
  prefs?: SlidesPrefs;
}

export function initSlidesUiState(init: SlidesUiInit): SlidesUiState {
  const { deck } = init;
  const prefs = init.prefs ?? DEFAULT_SLIDES_PREFS;
  const current = init.initialSlideId && deck.slides.has(init.initialSlideId) ? init.initialSlideId : (deck.slideIds[0] ?? null);
  return {
    currentSlideId: current,
    slideSelection: current ? [current] : [],
    selection: [],
    editing: null,
    rightPanel: "none",
    notesOpen: prefs.notesOpen,
    notesHeight: prefs.notesHeight,
    railWidth: prefs.railWidth,
    view: "edit",
    zoom: prefs.zoom,
    snap: prefs.snap,
    dialog: null,
    restoreVersionId: null,
    previewVersionId: null,
    importReport: null,
    presenting: init.startPresenting && current ? { startSlideId: current, speaker: "none" } : null,
    mobileMode: "view",
    mobileSheet: null,
    notice: null,
    deckSlideIds: deck.slideIds,
  };
}

const unique = (ids: readonly string[]) => [...new Set(ids)];

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** False when `editing` names a table cell whose row or column is gone (a plain element target is always true). */
function cellExists(slide: SlideSnapshot | undefined, editing: SlidesEditingTarget): boolean {
  if (!editing.cellKey) return true;
  const table = slide?.elements.find((el) => el.id === editing.elementId);
  if (!table || table.type !== "table") return false;
  const [rowId, colId] = editing.cellKey.split(":");
  return table.rows.some((r) => r.id === rowId) && table.cols.some((c) => c.id === colId);
}

/** The state after the deck changed (see the file comment). Returns `s` itself when nothing needs to change. */
function reconcile(s: SlidesUiState, deck: DeckState): SlidesUiState {
  const ids = deck.slideIds;
  let current = s.currentSlideId;
  if (ids.length === 0) current = null;
  else if (current === null || !deck.slides.has(current)) {
    const was = current === null ? -1 : s.deckSlideIds.indexOf(current);
    current = ids[Math.min(Math.max(0, was), ids.length - 1)];
  }
  const slide = current ? deck.slides.get(current) : undefined;
  const onSlide = new Set(slide ? slide.elements.map((el) => el.id) : []);
  const slideMoved = current !== s.currentSlideId;
  const selection = slideMoved ? [] : s.selection.filter((id) => onSlide.has(id));
  const editingLost = s.editing !== null && (slideMoved || !onSlide.has(s.editing.elementId) || !cellExists(slide, s.editing));
  const editing = editingLost ? null : s.editing;
  const kept = s.slideSelection.filter((id) => deck.slides.has(id));
  const slideSelection = current === null ? [] : kept.includes(current) ? kept : [current];
  const presenting = s.presenting && ids.length === 0 ? null : s.presenting;
  if (
    current === s.currentSlideId &&
    sameIds(selection, s.selection) &&
    editing === s.editing &&
    sameIds(slideSelection, s.slideSelection) &&
    presenting === s.presenting &&
    ids === s.deckSlideIds
  ) {
    return s;
  }
  return {
    ...s,
    currentSlideId: current,
    selection: sameIds(selection, s.selection) ? s.selection : selection,
    editing,
    slideSelection: sameIds(slideSelection, s.slideSelection) ? s.slideSelection : slideSelection,
    presenting,
    notice: editingLost ? { code: "elementRemoved", seq: (s.notice?.seq ?? 0) + 1 } : s.notice,
    deckSlideIds: ids,
  };
}

export function slidesUiReducer(s: SlidesUiState, a: SlidesUiAction): SlidesUiState {
  switch (a.type) {
    case "selectSlide":
      if (a.slideId === s.currentSlideId && s.selection.length === 0 && s.editing === null && s.slideSelection.length <= 1) return s;
      return { ...s, currentSlideId: a.slideId, slideSelection: a.slideId ? [a.slideId] : [], selection: [], editing: null };
    case "selectSlides": {
      const slideIds = unique(a.slideIds);
      const current = a.current && slideIds.includes(a.current) ? a.current : (slideIds[slideIds.length - 1] ?? s.currentSlideId);
      const moved = current !== s.currentSlideId;
      return { ...s, slideSelection: slideIds.length > 0 ? slideIds : current ? [current] : [], currentSlideId: current, selection: moved ? [] : s.selection, editing: moved ? null : s.editing };
    }
    case "select": {
      const ids = unique(a.ids);
      const keepEditing = s.editing !== null && ids.length === 1 && ids[0] === s.editing.elementId;
      if (sameIds(ids, s.selection) && (keepEditing || s.editing === null)) return s;
      return { ...s, selection: ids, editing: keepEditing ? s.editing : null };
    }
    case "startEdit":
      return { ...s, selection: [a.elementId], editing: a.cellKey ? { elementId: a.elementId, cellKey: a.cellKey } : { elementId: a.elementId } };
    case "endEdit":
      return s.editing === null ? s : { ...s, editing: null };
    case "restoreSelection": {
      const slideId = a.slideId ?? s.currentSlideId;
      const moved = slideId !== s.currentSlideId;
      const ids = unique(a.elementIds);
      // Undoing typing inside the box being edited keeps editing (the step's selection is that box, or none).
      const keepEditing = !moved && s.editing !== null && (ids.length === 0 || (ids.length === 1 && ids[0] === s.editing.elementId));
      return {
        ...s,
        currentSlideId: slideId,
        slideSelection: moved && slideId ? [slideId] : s.slideSelection,
        selection: keepEditing && s.editing ? [s.editing.elementId] : ids,
        editing: keepEditing ? s.editing : null,
      };
    }
    case "openPanel": {
      const panel = s.rightPanel === a.panel ? "none" : a.panel;
      return { ...s, rightPanel: panel, previewVersionId: panel === "history" ? s.previewVersionId : null };
    }
    case "closePanel":
      return { ...s, rightPanel: "none", previewVersionId: null };
    case "toggleNotes":
      return { ...s, notesOpen: a.open ?? !s.notesOpen };
    case "setNotesHeight":
      return Number.isFinite(a.height) ? { ...s, notesHeight: clamp(a.height, NOTES_HEIGHT_MIN, NOTES_HEIGHT_MAX) } : s;
    case "setRailWidth":
      return Number.isFinite(a.width) ? { ...s, railWidth: clamp(a.width, RAIL_WIDTH_MIN, RAIL_WIDTH_MAX) } : s;
    case "setView":
      return { ...s, view: a.view, editing: a.view === "grid" ? null : s.editing, selection: a.view === "grid" ? [] : s.selection };
    case "setZoom":
      return { ...s, zoom: cleanZoom(a.zoom) };
    case "setSnap":
      return { ...s, snap: a.snap };
    case "openDialog":
      return { ...s, dialog: a.dialog };
    case "closeDialog":
      return { ...s, dialog: null, restoreVersionId: s.dialog === "restoreConfirm" ? null : s.restoreVersionId, importReport: s.dialog === "importReport" ? null : s.importReport };
    case "requestRestore":
      return { ...s, dialog: "restoreConfirm", restoreVersionId: a.versionId };
    case "previewVersion":
      return { ...s, previewVersionId: a.versionId, editing: a.versionId ? null : s.editing };
    case "showImportReport":
      return { ...s, dialog: "importReport", importReport: a.report };
    case "present":
      return { ...s, presenting: { startSlideId: a.startSlideId, speaker: a.speaker ?? "none" }, editing: null };
    case "stopPresenting":
      return s.presenting === null ? s : { ...s, presenting: null };
    case "setMobileMode":
      return {
        ...s,
        mobileMode: a.mode,
        editing: null,
        selection: a.mode === "view" ? [] : s.selection,
        mobileSheet: a.mode === "view" ? null : s.mobileSheet,
      };
    case "openMobileSheet":
      return { ...s, mobileSheet: a.sheet };
    case "closeMobileSheet":
      return s.mobileSheet === null ? s : { ...s, mobileSheet: null };
    case "deckChanged":
      return reconcile(s, a.deck);
  }
}

/** The slide a show starts on: the current one, or the first slide that is not skipped (else the first). */
export function presentStartSlide(deck: Pick<DeckState, "slideIds" | "slides">, from: "current" | "start", currentSlideId: string | null): string | null {
  if (from === "current" && currentSlideId && deck.slides.has(currentSlideId)) return currentSlideId;
  return deck.slideIds.find((id) => deck.slides.get(id)?.hidden === false) ?? deck.slideIds[0] ?? null;
}
