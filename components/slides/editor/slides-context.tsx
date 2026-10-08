"use client";

// Editor context of one open deck (slides.md §7.2). The session (slides-session.tsx) builds the value once the
// provider synced and renders the desktop or phone layout inside SlidesEditorContext; every region reads it
// through useSlidesEditor(). The building blocks it needs live here:
//
//   const store = …new DeckStore(ydoc)…;  const deck = useDeckState(store);
//   const [ui, dispatch] = useSlidesUiState(deck, { initialSlideId, startPresenting }, canEditNow);
//   const undo = useSlidesUndo(ydoc, ui, dispatch);
//   const refs = useSlidesEditorRefs();
//   const actions = useSlidesActions({ … });  const el = useElementActions({ … });
//   const peers = useSlidesPresence(provider, slidesAwarenessOf(ui));
//
// The UI state and its reducer are pure (lib/slides/editor/ui-state.ts) and re-exported from here. Per-viewer
// preferences (notes, rail width, zoom, snap) persist in localStorage under SLIDES_PREFS_KEY, every access in
// try/catch.
import {
  createContext, useContext, useEffect, useEffectEvent, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore,
  type Dispatch, type RefObject,
} from "react";
import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import type * as Y from "yjs";

import type { SlideViewLabels } from "@/components/slides/canvas/slide-view";
import type { SlideTextEditorHandle } from "@/components/slides/canvas/text-edit-overlay";
import type { DocSaveState } from "@/components/docs/editor/use-save-state";
import type { SpacetimeYjsProvider } from "@/lib/docs/spacetime-provider";
import type { DocAccess, DocumentMeta } from "@/lib/docs/types";
import type { DocumentCollaboration } from "@/lib/docs/use-document-collaboration";
import { useT } from "@/lib/i18n/context";
import type { DeckState, DeckStore } from "@/lib/slides/model/deck-store";
import type { SlideSnapshot } from "@/lib/slides/model/types";
import { Latest } from "@/lib/slides/editor/latest";
import { undoHolderFor, type UndoSelectionBinding } from "@/lib/slides/editor/undo-holder";
import { elementTextFragment, textTargetKey } from "@/lib/slides/editor/text-target";
import type { SlidesPeersState } from "@/lib/slides/editor/peers";
import type { SlidesAwareness } from "@/lib/slides/presence";
import {
  SLIDES_PREFS_KEY, initSlidesUiState, sanitizeSlidesPrefs, slidesUiReducer,
  type SlidesPrefs, type SlidesUiAction, type SlidesUiInit, type SlidesUiState,
} from "@/lib/slides/editor/ui-state";
import type { SlidesDocActions } from "@/components/slides/editor/use-slides-actions";
import type { SlidesElementActions } from "@/components/slides/editor/use-element-actions";

export {
  DEFAULT_SLIDES_PREFS, SLIDES_PREFS_KEY, initSlidesUiState, sanitizeSlidesPrefs, slidesUiReducer,
  type SlidesDialog, type SlidesEditingTarget, type SlidesMobileSheet, type SlidesPrefs, type SlidesRightPanel,
  type SlidesUiAction, type SlidesUiInit, type SlidesUiState, type SpeakerMode,
} from "@/lib/slides/editor/ui-state";
export type { SlidesPeersState } from "@/lib/slides/editor/peers";

// ── Preferences ───────────────────────────────────────────────────────────────────────────────────────────────────

export function readSlidesPrefs(): SlidesPrefs {
  try {
    const raw = window.localStorage.getItem(SLIDES_PREFS_KEY);
    return sanitizeSlidesPrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeSlidesPrefs(null);
  }
}

export function writeSlidesPrefs(prefs: SlidesPrefs): void {
  try {
    window.localStorage.setItem(SLIDES_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked (private mode, quota): preferences just don't persist.
  }
}

/**
 * The UI state of a session: the reducer, reconciled with every new DeckState during render (a deleted current
 * slide, vanished selections), with editing forced off while the viewer cannot edit, preferences persisted, and the
 * elementRemoved notice shown as a toast.
 */
export function useSlidesUiState(deck: DeckState, init: Omit<SlidesUiInit, "deck" | "prefs">, canEditNow: boolean): [SlidesUiState, Dispatch<SlidesUiAction>] {
  const t = useT();
  const [state, dispatch] = useReducer(slidesUiReducer, null, () => initSlidesUiState({ ...init, deck, prefs: readSlidesPrefs() }));
  const [seenDeck, setSeenDeck] = useState(deck);
  if (seenDeck !== deck) {
    setSeenDeck(deck);
    dispatch({ type: "deckChanged", deck });
  }
  const ui = useMemo(() => (canEditNow || state.editing === null ? state : { ...state, editing: null }), [state, canEditNow]);

  const { notesOpen, notesHeight, railWidth, zoom, snap } = state;
  useEffect(() => {
    writeSlidesPrefs({ notesOpen, notesHeight, railWidth, zoom, snap });
  }, [notesOpen, notesHeight, railWidth, zoom, snap]);

  // Once per notice: not again on a locale change, nor when a hidden <Activity> (a background tab) is shown again and
  // re-runs its effects.
  const noticeSeq = state.notice?.seq ?? 0;
  const shownSeq = useRef(0);
  const showElementRemoved = useEffectEvent(() => toast(t("slides.editor.elementRemoved")));
  useEffect(() => {
    if (noticeSeq <= shownSeq.current) return;
    shownSeq.current = noticeSeq;
    showElementRemoved();
  }, [noticeSeq]);

  return [ui, dispatch];
}

/** The awareness this viewer publishes (slides.md §4.7): current slide, selection, and what it types in. */
export function slidesAwarenessOf(ui: Pick<SlidesUiState, "currentSlideId" | "selection" | "editing">): SlidesAwareness {
  const edit = ui.editing ? (ui.editing.cellKey ? `${ui.editing.elementId}/${ui.editing.cellKey}` : ui.editing.elementId) : null;
  return { v: 1, slideId: ui.currentSlideId, sel: ui.selection, edit };
}

// ── Undo ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SlidesUndoState {
  canUndo: boolean;
  canRedo: boolean;
  undo(): void;
  redo(): void;
  /** Ends the current capture group, so the next edit is its own undo step (gesture boundaries). */
  stopCapturing(): void;
}

/**
 * The deck's one undo stack (text and object edits, slides.md §4.5). Popping a step restores the selection it was
 * made with (the reconciliation drops ids that no longer exist). Starting or leaving text editing ends the capture
 * group, so typing never merges with a move made just before or after it.
 */
export function useSlidesUndo(ydoc: Y.Doc, ui: SlidesUiState, dispatch: Dispatch<SlidesUiAction>): SlidesUndoState {
  const [latestUi] = useState(() => new Latest(ui));
  useLayoutEffect(() => {
    latestUi.set(ui);
  });
  const holder = useMemo(() => undoHolderFor(ydoc), [ydoc]);
  const [binding] = useState<UndoSelectionBinding>(() => ({
    get: () => ({ slideId: latestUi.get().currentSlideId, elementIds: latestUi.get().selection }),
    restore: (m) => dispatch({ type: "restoreSelection", slideId: m.slideId, elementIds: m.elementIds }),
  }));
  useLayoutEffect(() => holder.bind(binding), [holder, binding]);
  const flags = useSyncExternalStore(holder.subscribe, holder.getSnapshot, holder.getSnapshot);

  const editKey = ui.editing ? textTargetKey(ui.editing.elementId, ui.editing.cellKey) : null;
  useEffect(() => {
    holder.stopCapturing();
  }, [holder, editKey]);

  return useMemo(() => {
    // An undo that removes the box being typed in (undoing its insert) is this person's own doing: leave editing
    // before the deck publishes, so it is not reported as someone else's delete.
    const leaveIfGone = () => {
      const { editing, currentSlideId } = latestUi.get();
      if (editing && currentSlideId && !elementTextFragment(ydoc, currentSlideId, editing.elementId, editing.cellKey)) dispatch({ type: "endEdit" });
    };
    return {
      canUndo: flags.canUndo,
      canRedo: flags.canRedo,
      undo: () => {
        holder.undo(binding);
        leaveIfGone();
      },
      redo: () => {
        holder.redo(binding);
        leaveIfGone();
      },
      stopCapturing: () => holder.stopCapturing(),
    };
  }, [flags, holder, binding, latestUi, ydoc, dispatch]);
}

// ── Refs shared by the stage, the shortcuts and the actions ────────────────────────────────────────────────────────

/**
 * The mounted slide text editor's handle, as a ref object whose changes can be subscribed to (the formatting
 * toolbar re-renders when an editor appears or goes).
 */
export class TextEditorRef implements RefObject<SlideTextEditorHandle | null> {
  declare current: SlideTextEditorHandle | null;
  private value: SlideTextEditorHandle | null = null;
  private readonly listeners = new Set<() => void>();

  constructor() {
    // An own `current` property (React's useImperativeHandle checks for one) whose writes notify subscribers.
    Object.defineProperty(this, "current", {
      enumerable: true,
      get: () => this.value,
      set: (next: SlideTextEditorHandle | null) => {
        if (next === this.value) return;
        this.value = next;
        for (const listener of [...this.listeners]) listener();
      },
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): SlideTextEditorHandle | null => this.value;
}

/** The last copied payload (JSON), for browsers that drop custom clipboard types. */
export class ClipboardMemory {
  private json: string | null = null;

  read(): string | null {
    return this.json;
  }

  write(json: string | null): void {
    this.json = json;
  }
}

/** Puts keyboard focus back on the stage (its clipboard / shortcut target); the mounted stage registers itself. */
export class StageFocus {
  private target: (() => void) | null = null;

  register(fn: () => void): () => void {
    this.target = fn;
    return () => {
      if (this.target === fn) this.target = null;
    };
  }

  focus(): void {
    this.target?.();
  }
}

/**
 * The scale (CSS px per slide pt) the mounted stage shows its slide at, for the zoom menus (zooming from "fit" steps
 * from it). Null while no stage is mounted or the fit is not measured yet.
 */
export class StageScale {
  private read: (() => number | null) | null = null;

  register(fn: () => number | null): () => void {
    this.read = fn;
    return () => {
      if (this.read === fn) this.read = null;
    };
  }

  get(): number | null {
    const scale = this.read?.() ?? null;
    return scale !== null && Number.isFinite(scale) && scale > 0 ? scale : null;
  }
}

export interface SlidesEditorRefs {
  /** The pre-mounted or editing slide text editor (at most one): the keyboard hand-off calls enterEditing(). */
  textEditor: TextEditorRef;
  clipboard: ClipboardMemory;
  stageFocus: StageFocus;
  stageScale: StageScale;
}

export function useSlidesEditorRefs(): SlidesEditorRefs {
  const [refs] = useState<SlidesEditorRefs>(() => ({
    textEditor: new TextEditorRef(),
    clipboard: new ClipboardMemory(),
    stageFocus: new StageFocus(),
    stageScale: new StageScale(),
  }));
  return refs;
}

// ── Context ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SlidesEditorContextValue {
  doc: DocumentMeta;
  access: DocAccess;
  isStarred: boolean;
  memberId: string;
  canEditNow: boolean;
  ydoc: Y.Doc;
  provider: SpacetimeYjsProvider;
  collab: DocumentCollaboration;
  store: DeckStore;
  deck: DeckState;
  undo: SlidesUndoState;
  ui: SlidesUiState;
  dispatch: Dispatch<SlidesUiAction>;
  actions: SlidesDocActions;
  el: SlidesElementActions;
  peers: SlidesPeersState;
  saveState: { state: DocSaveState; showLabel: boolean };
  isMobile: boolean;
  locale: string;
  refs: SlidesEditorRefs;
}

export const SlidesEditorContext = createContext<SlidesEditorContextValue | null>(null);
SlidesEditorContext.displayName = "SlidesEditorContext";

export function useSlidesEditor(): SlidesEditorContextValue {
  const value = useContext(SlidesEditorContext);
  if (!value) throw new Error("useSlidesEditor must be used inside SlidesEditorContext");
  return value;
}

/** The TipTap editor of the mounted slide text editor (while one is), for the formatting controls. */
export function useLiveTextEditor(): Editor | null {
  const { refs } = useSlidesEditor();
  const handle = useSyncExternalStore(refs.textEditor.subscribe, refs.textEditor.getSnapshot, () => null);
  return handle?.editor ?? null;
}

/** The strings SlideView takes as props (it never calls useT), for the stage, thumbnails and exports. */
export function useSlideViewLabels(touch = false): SlideViewLabels {
  const t = useT();
  return useMemo(
    () => ({
      placeholders: {
        title: t(touch ? "slides.placeholder.titleTouch" : "slides.placeholder.title"),
        subtitle: t("slides.placeholder.subtitle"),
        body: t(touch ? "slides.placeholder.bodyTouch" : "slides.placeholder.body"),
      },
      chart: t("slides.import.chartPlaceholderLabel"),
      imageMissing: t("slides.import.imagePlaceholderLabel"),
    }),
    [t, touch],
  );
}

/** The slide the editor shows: the current one, else the first; null for an empty deck. */
export function currentSlideOf(deck: DeckState, ui: Pick<SlidesUiState, "currentSlideId">): SlideSnapshot | null {
  const id = ui.currentSlideId && deck.slides.has(ui.currentSlideId) ? ui.currentSlideId : deck.slideIds[0];
  return (id ? deck.slides.get(id) : undefined) ?? null;
}
