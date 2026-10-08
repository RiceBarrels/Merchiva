"use client";

// Slide- and element-level commands (slides.md §7.2): Insert, Slide, Arrange and Format menus, the toolbar, the
// phone sheets, the keyboard and the canvas gestures all end here. Each command is one model op (one Yjs
// transaction), fenced with stopCapturing() so it is exactly one undo step; arrow-key nudges are the exception and
// merge a key-repeat burst into one step through the undo capture timeout (only the burst's first nudge is fenced).
// A refused op (SlidesOpError) becomes a toast; nothing writes while the viewer cannot edit, the deck is from a
// newer schema, or a version is previewed (the live deck is out of sight; an upload begun before it lands nowhere).
//
// The returned object is stable for the session and reads the latest state when a command runs.
import { useLayoutEffect, useMemo, useRef, type Dispatch } from "react";
import { toast } from "sonner";
import type * as Y from "yjs";

import { useDriveActor } from "@/components/drive/drive-actor";
import type { SlidesEditorRefs, SlidesUndoState } from "@/components/slides/editor/slides-context";
import { docImageProblemKey, normalizeImageUrl, validateDocImage } from "@/lib/docs/uploads";
import type { DocumentMeta } from "@/lib/docs/types";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { SLIDES_MAX_ELEMENTS_PER_SLIDE, SLIDES_MAX_SLIDES } from "@/lib/slides/constants";
import { SLIDES_CLIPBOARD_MIME, decodeClipboard, encodeClipboard, type SlidesClipboardPayload } from "@/lib/slides/clipboard";
import { targetForNewFromDeck } from "@/lib/slides/create";
import { flipPatches, newImage, newLine, newShape, newTable, newTextBox, type Point } from "@/lib/slides/editor/elements";
import { measureImage, measureImageFile, pasteOffset, plainTextElement } from "@/lib/slides/editor/insert-media";
import { runTableCommand, type SlidesTableCommand } from "@/lib/slides/editor/table-commands";
import { formatElementsText, formatLiveText, type TextFormatCommand } from "@/lib/slides/editor/text-format";
import type { SlidesUiAction, SlidesUiState } from "@/lib/slides/editor/ui-state";
import { alignPatches, distributePatches, nudgePatches, rotatePatch, type AlignMode } from "@/lib/slides/geometry/arrange";
import { uploadSlidesImage } from "@/lib/slides/images";
import type { DeckState } from "@/lib/slides/model/deck-store";
import {
  addElements, deleteElements, duplicateElements, pasteElements, reorderElements, updateElements,
} from "@/lib/slides/model/ops-elements";
import {
  SlidesOpError, applyTheme as applyThemeOp, deleteSlides as deleteSlidesOp, duplicateSlides as duplicateSlidesOp,
  insertSlide, moveSlides as moveSlidesOp, pasteSlides, setSlidesProps,
} from "@/lib/slides/model/ops-slides";
import { safeImageSrc } from "@/lib/slides/model/safe-values";
import { SLIDES_UNDO_CAPTURE_MS } from "@/lib/slides/model/undo";
import type {
  ElementPatch, ElementPatchEntry, Fill, LayoutKind, NewElement, ShapePreset, SlideElement, SlideTransition, StarterThemeId,
} from "@/lib/slides/model/types";
import { DEFAULT_NEW_SLIDE_LAYOUT } from "@/lib/slides/themes/layouts";
import { STARTER_THEMES } from "@/lib/slides/themes/themes";
import { appUploadErrorKeyOr } from "@/lib/storage/app-upload";

export type { TextFormatCommand } from "@/lib/slides/editor/text-format";
export type { SlidesTableCommand } from "@/lib/slides/editor/table-commands";

export interface SlidesElementActions {
  insertTextBox(at?: Point): void;
  insertShape(preset: ShapePreset): void;
  insertLine(arrow: boolean): void;
  /** Uploads and inserts pictures (`at`: the drop point, else centred). */
  insertImageFiles(files: readonly File[], at?: Point): Promise<void>;
  /** Resolves true when inserted; shows `docs.image.urlInvalid` otherwise. */
  insertImageUrl(url: string): Promise<boolean>;
  insertTable(rows: number, cols: number): void;
  addSlide(layout?: LayoutKind): void;
  duplicateSlides(): void;
  deleteSlides(): void;
  moveSlides(ids: readonly string[], before: string | null): void;
  toggleSkip(): void;
  setBackground(fill: Fill | null, all?: boolean): void;
  applyTheme(id: StarterThemeId): void;
  setTransition(t: SlideTransition | null, all?: boolean): void;
  deleteSelection(): void;
  duplicateSelection(): void;
  /** Copies the selected elements, or the rail's slides when no element is selected. */
  copy(e?: ClipboardEvent): void;
  cut(e?: ClipboardEvent): void;
  paste(e?: ClipboardEvent): Promise<void>;
  arrange(op: "front" | "forward" | "backward" | "back"): void;
  align(mode: AlignMode): void;
  distribute(axis: "h" | "v"): void;
  rotate(delta: 90 | -90): void;
  flip(axis: "h" | "v"): void;
  setLocked(locked: boolean): void;
  /** Writes element patches as one undo step (the canvas gestures commit through this). */
  patch(entries: ElementPatchEntry[]): void;
  /** The same patch on every selected element (format controls). */
  patchSelected(patch: ElementPatch): void;
  /** Arrow-key nudge; a key-repeat burst is one undo step. */
  nudge(dx: number, dy: number): void;
  formatText(cmd: TextFormatCommand): void;
  tableCommand(cmd: SlidesTableCommand): void;
}

export interface SlidesElementActionDeps {
  doc: DocumentMeta;
  canEditNow: boolean;
  ydoc: Y.Doc;
  deck: DeckState;
  ui: SlidesUiState;
  dispatch: Dispatch<SlidesUiAction>;
  refs: SlidesEditorRefs;
  undo: Pick<SlidesUndoState, "stopCapturing">;
}

/** The refusals a person can cause and fix (the rest are bugs or races: a generic message). */
const OP_ERROR_KEYS: Record<string, string> = { tooManySlides: "slides.editor.tooManySlides", tooManyElements: "slides.editor.tooManyElements", lastSlide: "slides.editor.lastSlide" };

export function useElementActions(deps: SlidesElementActionDeps): SlidesElementActions {
  const t = useT();
  const actor = useDriveActor();
  const latest = useRef({ ...deps, t, actor });
  useLayoutEffect(() => {
    latest.current = { ...deps, t, actor };
  });

  return useMemo<SlidesElementActions>(() => {
    const cur = () => latest.current;
    const writable = () => cur().canEditNow && !cur().deck.schemaTooNew && cur().ui.previewVersionId === null;
    const slide = () => {
      const { deck, ui } = cur();
      const id = ui.currentSlideId && deck.slides.has(ui.currentSlideId) ? ui.currentSlideId : deck.slideIds[0];
      return id ? (deck.slides.get(id) ?? null) : null;
    };
    const selected = (): SlideElement[] => {
      const ids = new Set(cur().ui.selection);
      return slide()?.elements.filter((el) => ids.has(el.id)) ?? [];
    };
    const railSlides = (): string[] => {
      const { deck, ui } = cur();
      const picked = new Set(ui.slideSelection.length > 0 ? ui.slideSelection : ui.currentSlideId ? [ui.currentSlideId] : []);
      return deck.slideIds.filter((id) => picked.has(id));
    };
    const fail = (err: unknown) => {
      const tr = cur().t;
      if (err instanceof SlidesOpError && OP_ERROR_KEYS[err.code]) {
        const n = err.code === "tooManySlides" ? SLIDES_MAX_SLIDES : SLIDES_MAX_ELEMENTS_PER_SLIDE;
        toast.error(fmt(tr(OP_ERROR_KEYS[err.code]), { n }));
      } else {
        console.error("[slides] edit failed", err);
        toast.error(tr("docs.errors.generic"));
      }
    };
    /** Runs one command as one undo step; null when refused or failed. */
    function run<T>(fn: (doc: Y.Doc) => T): T | null {
      if (!writable()) return null;
      const { ydoc, undo } = cur();
      undo.stopCapturing();
      try {
        return fn(ydoc);
      } catch (err) {
        fail(err);
        return null;
      } finally {
        undo.stopCapturing();
      }
    }
    const select = (ids: readonly string[]) => cur().dispatch({ type: "select", ids });
    /** Adds elements to the current slide (or `slideId`, if it still exists) and selects them there. */
    const addToSlide = (els: readonly NewElement[], slideId?: string): string[] => {
      const s = slideId && cur().deck.slides.has(slideId) ? (cur().deck.slides.get(slideId) ?? null) : slide();
      if (!s || els.length === 0) return [];
      const ids = run((doc) => addElements(doc, s.id, els)) ?? [];
      if (ids.length === 0) return ids;
      if (s.id !== cur().ui.currentSlideId) cur().dispatch({ type: "selectSlide", slideId: s.id });
      select(ids);
      return ids;
    };
    const patchOnSlide = (entries: ElementPatchEntry[]) => {
      const s = slide();
      if (s && entries.length > 0) run((doc) => updateElements(doc, s.id, entries));
    };
    const size = () => cur().deck.meta.size;
    const imageContext = () => ({ documentId: cur().doc.id, target: targetForNewFromDeck(cur().doc, cur().actor) });

    const insertImageFiles = async (files: readonly File[], at?: Point) => {
      const tr = cur().t;
      if (!writable()) return;
      const images = files.filter((file) => file.type.startsWith("image/"));
      if (images.length === 0) return;
      const problem = images.map(validateDocImage).find((p) => p !== null);
      if (problem) {
        toast.error(tr(docImageProblemKey(problem)));
        return;
      }
      const id = toast.loading(tr("docs.image.uploading"));
      // The pictures go to the slide that was shown when they were chosen, even if the upload outlasts a slide change.
      const slideId = slide()?.id;
      try {
        const els: NewElement[] = [];
        for (const [i, file] of images.entries()) {
          const [natural, url] = await Promise.all([measureImageFile(file), uploadSlidesImage(file, imageContext())]);
          const offset = i * 16;
          els.push(newImage(url, natural, size(), at ? { x: at.x + offset, y: at.y + offset } : null));
        }
        toast.dismiss(id);
        addToSlide(els, slideId);
      } catch (err) {
        console.error("[slides] image upload failed", err);
        toast.error(tr(appUploadErrorKeyOr(err, "docs.image.failed")), { id });
      }
    };

    const copy = (e?: ClipboardEvent) => {
      const { deck, refs } = cur();
      const els = selected();
      let payload: SlidesClipboardPayload;
      if (els.length > 0) payload = { v: 1, kind: "elements", size: deck.meta.size, theme: deck.meta.theme, elements: els };
      else {
        const slides = railSlides().flatMap((id) => deck.slides.get(id) ?? []);
        if (slides.length === 0) return;
        payload = { v: 1, kind: "slides", size: deck.meta.size, theme: deck.meta.theme, slides };
      }
      const encoded = encodeClipboard(payload);
      refs.clipboard.write(encoded.json);
      if (e?.clipboardData) {
        e.preventDefault();
        e.clipboardData.setData(SLIDES_CLIPBOARD_MIME, encoded.json);
        e.clipboardData.setData("text/plain", encoded.plain);
        if (encoded.html) e.clipboardData.setData("text/html", encoded.html);
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        // A menu command: the system clipboard gets the text; the in-memory copy keeps the slides data.
        navigator.clipboard.writeText(encoded.plain).catch(() => undefined);
      }
    };

    /** Leaves editing first when the edited element is one of `ids` (so its removal is not reported as someone else's). */
    const leaveEditing = (ids: readonly string[]) => {
      const { ui, dispatch } = cur();
      if (ui.editing && ids.includes(ui.editing.elementId)) dispatch({ type: "endEdit" });
    };

    const deleteSelection = () => {
      const s = slide();
      const ids = selected().filter((el) => !el.locked).map((el) => el.id);
      if (!s || ids.length === 0) return;
      leaveEditing(ids);
      run((doc) => deleteElements(doc, s.id, ids));
      select([]);
    };

    const deleteSlides = () => {
      const { ui, dispatch } = cur();
      const ids = railSlides();
      if (ids.length === 0) return;
      // Deleting the slide being typed on is this person's own doing, not someone else's delete.
      if (ui.editing && ui.currentSlideId && ids.includes(ui.currentSlideId)) dispatch({ type: "endEdit" });
      run((doc) => deleteSlidesOp(doc, ids));
    };

    /** When the last nudge was written (ms): a nudge after a longer pause starts its own undo step. */
    let lastNudgeAt = 0;

    const formatSelection = (cmd: TextFormatCommand) => {
      const s = slide();
      if (s) run((doc) => formatElementsText(doc, s.id, selected(), cmd));
    };

    return {
      insertTextBox: (at) => {
        const [id] = addToSlide([newTextBox(size(), at)]);
        if (id) cur().dispatch({ type: "startEdit", elementId: id });
      },
      insertShape: (preset) => void addToSlide([newShape(preset, size())]),
      insertLine: (arrow) => void addToSlide([newLine(arrow, size())]),
      insertImageFiles,
      insertImageUrl: async (raw) => {
        const tr = cur().t;
        const src = safeImageSrc(normalizeImageUrl(raw) ?? "");
        const natural = src ? await measureImage(src) : null;
        if (!src || !natural) {
          toast.error(tr("docs.image.urlInvalid"));
          return false;
        }
        return addToSlide([newImage(src, natural, size())]).length > 0;
      },
      insertTable: (rows, cols) => void addToSlide([newTable(rows, cols, size())]),
      addSlide: (layout) => {
        const id = run((doc) => insertSlide(doc, { afterSlideId: slide()?.id ?? null, layout: layout ?? DEFAULT_NEW_SLIDE_LAYOUT }));
        if (id) cur().dispatch({ type: "selectSlide", slideId: id });
      },
      duplicateSlides: () => {
        const ids = railSlides();
        const copies = ids.length > 0 ? run((doc) => duplicateSlidesOp(doc, ids)) : null;
        if (copies && copies.length > 0) cur().dispatch({ type: "selectSlides", slideIds: copies, current: copies[copies.length - 1] });
      },
      deleteSlides,
      moveSlides: (ids, before) => void run((doc) => moveSlidesOp(doc, ids, before)),
      toggleSkip: () => {
        const { deck } = cur();
        const ids = railSlides();
        const hidden = !ids.every((id) => deck.slides.get(id)?.hidden === true);
        if (ids.length > 0) run((doc) => setSlidesProps(doc, ids, { hidden }));
      },
      setBackground: (fill, all) => {
        const ids = all ? cur().deck.slideIds : railSlides();
        if (ids.length > 0) run((doc) => setSlidesProps(doc, ids, { background: fill }));
      },
      applyTheme: (id) => void run((doc) => applyThemeOp(doc, STARTER_THEMES[id])),
      setTransition: (transition, all) => {
        const ids = all ? cur().deck.slideIds : railSlides();
        if (ids.length > 0) run((doc) => setSlidesProps(doc, ids, { transition }));
      },
      deleteSelection,
      duplicateSelection: () => {
        const s = slide();
        const ids = selected().map((el) => el.id);
        const copies = s && ids.length > 0 ? run((doc) => duplicateElements(doc, s.id, ids)) : null;
        if (copies && copies.length > 0) select(copies);
      },
      copy,
      cut: (e) => {
        if (!writable()) return;
        copy(e);
        if (selected().length > 0) deleteSelection();
        else deleteSlides();
      },
      paste: async (e) => {
        if (!writable()) return;
        const { refs } = cur();
        const data = e?.clipboardData ?? null;
        const payload = decodeClipboard(data, refs.clipboard.read());
        const s = slide();
        if (payload?.kind === "slides") {
          e?.preventDefault();
          const ids = run((doc) => pasteSlides(doc, s?.id ?? null, payload)) ?? [];
          if (ids.length > 0) cur().dispatch({ type: "selectSlides", slideIds: ids, current: ids[ids.length - 1] });
          return;
        }
        if (payload && s) {
          e?.preventDefault();
          const at = pasteOffset(s.elements, payload.elements ?? []);
          const ids = run((doc) => pasteElements(doc, s.id, payload, at ?? undefined)) ?? [];
          if (ids.length > 0) select(ids);
          return;
        }
        const files = data ? Array.from(data.files ?? []).filter((file) => file.type.startsWith("image/")) : [];
        if (files.length > 0) {
          e?.preventDefault();
          await insertImageFiles(files);
          return;
        }
        let text = data ? data.getData("text/plain") : "";
        if (!data && typeof navigator !== "undefined" && navigator.clipboard?.readText) text = await navigator.clipboard.readText().catch(() => "");
        if (text.trim() !== "") {
          e?.preventDefault();
          addToSlide([plainTextElement(text, size())]);
        }
      },
      arrange: (op) => {
        const s = slide();
        const ids = selected().map((el) => el.id);
        if (s && ids.length > 0) run((doc) => reorderElements(doc, s.id, ids, op));
      },
      align: (mode) => {
        const els = selected();
        patchOnSlide(alignPatches(els, mode, els.length > 1 ? "selection" : "slide", size()));
      },
      distribute: (axis) => patchOnSlide(distributePatches(selected(), axis)),
      rotate: (delta) => patchOnSlide(selected().filter((el) => !el.locked).map((el) => rotatePatch(el, delta))),
      flip: (axis) => patchOnSlide(flipPatches(selected(), axis)),
      setLocked: (locked) => patchOnSlide(selected().map((el) => ({ id: el.id, patch: { locked } }))),
      patch: patchOnSlide,
      patchSelected: (patch) => patchOnSlide(selected().map((el) => ({ id: el.id, patch }))),
      nudge: (dx, dy) => {
        const s = slide();
        const entries = nudgePatches(selected(), dx, dy);
        if (!s || entries.length === 0 || !writable()) return;
        const now = Date.now();
        if (now - lastNudgeAt > SLIDES_UNDO_CAPTURE_MS) cur().undo.stopCapturing();
        lastNudgeAt = now;
        try {
          updateElements(cur().ydoc, s.id, entries);
        } catch (err) {
          fail(err);
        }
      },
      formatText: (cmd) => {
        const { ui, refs } = cur();
        const handle = refs.textEditor.current;
        const editing = ui.editing;
        const target = editing ? (editing.cellKey ? `${editing.elementId}/${editing.cellKey}` : editing.elementId) : null;
        if (handle && target && handle.target === target) {
          // The editor's text edit and a bold default written with it are one undo step (run fences them).
          const s = slide();
          const el = s?.elements.find((x) => x.id === editing?.elementId);
          if (s && el) run((doc) => formatLiveText(doc, s.id, handle.editor, el, editing?.cellKey, cmd));
          return;
        }
        formatSelection(cmd);
      },
      tableCommand: (cmd) => {
        const s = slide();
        const { ui } = cur();
        const table = selected().find((el) => el.type === "table");
        // A locked table is not deleted, as deleteSelection leaves locked elements.
        if (!s || !table || table.type !== "table" || (cmd === "deleteTable" && table.locked)) return;
        const cellKey = ui.editing?.elementId === table.id ? ui.editing.cellKey : undefined;
        // Leave the cell first when its row or column is about to go (it would read as someone else's delete).
        if (cellKey && (cmd === "deleteRow" || cmd === "deleteColumn" || cmd === "deleteTable")) leaveEditing([table.id]);
        run((doc) => runTableCommand(doc, s.id, table, cmd, cellKey));
        if (cmd === "deleteTable") select([]);
      },
    };
  }, []);
}
