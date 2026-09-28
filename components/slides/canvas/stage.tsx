"use client";

// The editing stage (slides.md §5, §6.2, §7.3): the current slide at the fit (or chosen) zoom inside a scrolling
// viewport, with selection and transforms, line end handles, other people's outlines, the pre-mounted text editor,
// picture drops, and the keyboard / clipboard target. It reads everything from the editor context.
//
// One GestureFrameStore per stage (not a module singleton: the browser shell keeps tabs alive, and the same deck
// in two tabs must not share a drag) wraps the slide and every gesture writer. The stage publishes the scale it
// shows the slide at through refs.stageScale (the zoom menus step from it).
//
// Text entry: whenever exactly one text box or shape is selected, the stage renders its SlideTextEditor
// (read-only) in place of the text; a double-click, a second tap, Enter or the first typed key then calls
// enterEditing() synchronously in that event (see text-edit-overlay.tsx), so iOS raises the keyboard and an IME
// composition starts inside the box. A table cell mounts its editor when it is double-clicked (or, while another
// cell of the same table is being typed in, clicked).
//
// While a box is being typed in, a press on its empty space or on its transform handles gives the caret back to its
// editor (Chromium blurs the editor on such a press), so editing never outlives keyboard focus.
//
// Keyboard and clipboard: after a mouse click the stage focuses a hidden text field holding a selected space, the one
// target on which every browser (Safari included) fires copy / cut / paste; the shortcut hook listens on the editor
// root, where those events and keydown bubble. Touch and pen presses skip it in every layout (an iPad gets the
// desktop layout), so a tap never raises the soft keyboard.
import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent,
  type TouchEvent,
} from "react";
import { flushSync } from "react-dom";
import { Presentation } from "lucide-react";

import { GestureFrameStore, GestureFramesContext } from "@/components/slides/canvas/gesture-frames";
import { LineHandles } from "@/components/slides/canvas/line-handles";
import { PresenceLayer } from "@/components/slides/canvas/presence-layer";
import { SelectionLayer } from "@/components/slides/canvas/selection-layer";
import { SlideView, type SlideViewLabels } from "@/components/slides/canvas/slide-view";
import { SlideTextEditor } from "@/components/slides/canvas/text-edit-overlay";
import { useStageFit } from "@/components/slides/canvas/use-stage-fit";
import { currentSlideOf, useSlideViewLabels, useSlidesEditor } from "@/components/slides/editor/slides-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { isTextCapable } from "@/lib/slides/editor/elements";
import { elementTextFragment, textTargetKey } from "@/lib/slides/editor/text-target";
import type { ElementPatchEntry, SlideElement } from "@/lib/slides/model/types";
import { cn } from "@/lib/utils";

export interface SlidesStageProps {
  /** Phone / tablet layout: bigger handles, no rotate handle, double-tap to type, no hidden keyboard target. */
  touch?: boolean;
  className?: string;
}

/** Marks the hidden keyboard / clipboard target (the shortcut hook treats it as the stage, not as a text field). */
export const STAGE_KEYS_ATTR = "data-slides-keys";
/** Marks the stage's scrolling viewport (keys pressed on it act on the slide). */
export const STAGE_VIEWPORT_ATTR = "data-slides-viewport";
/** Space around the slide at "fit" (CSS px). */
const FIT_PADDING = { desktop: 32, touch: 12 };
/** The slide frame's border (CSS px per side): "fit" leaves room for it, so the viewport never scrolls at fit. */
const FRAME_BORDER = 1;
/** Moveable's transform handles (portaled into the viewport). */
const MOVEABLE_CONTROLS = ".moveable-control-box";
/** Two taps on the same element closer than this are a double tap (ms, CSS px). */
const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_PX = 24;

function selectedWrapperId(target: EventTarget | null): string | null {
  return target instanceof Element ? (target.closest("[data-el-id]")?.getAttribute("data-el-id") ?? null) : null;
}

function cellKeyOf(target: EventTarget | null): string | undefined {
  return target instanceof Element ? (target.closest("[data-cell-key]")?.getAttribute("data-cell-key") ?? undefined) : undefined;
}

/** What the stage's text editor needs besides the editor context. */
interface StageEditorValue {
  slideId: string | null;
  labels: SlideViewLabels;
  exitEditing(): void;
  markBroken(key: string): void;
}

const StageEditorContext = createContext<StageEditorValue | null>(null);

/**
 * The slide text editor of one element or table cell, reading the editor context itself, so SlideView's
 * `renderEditor` can be one stable function (SlideView is memoized on it).
 */
function StageTextEditor({ element, cellKey }: { element: SlideElement; cellKey?: string }) {
  const { ydoc, ui, dispatch, refs, undo, el: actions } = useSlidesEditor();
  const stage = useContext(StageEditorContext);
  const slideId = stage?.slideId ?? null;
  const fragment = slideId ? elementTextFragment(ydoc, slideId, element.id, cellKey) : null;
  if (!stage || !fragment) return null;
  const key = textTargetKey(element.id, cellKey);
  const editingKey = ui.editing ? textTargetKey(ui.editing.elementId, ui.editing.cellKey) : null;
  const placeholder = isTextCapable(element) && element.placeholder !== "" ? stage.labels.placeholders[element.placeholder] : "";
  return (
    <SlideTextEditor
      key={key}
      fragment={fragment}
      element={element}
      cellKey={cellKey}
      placeholder={placeholder}
      editing={editingKey === key}
      handleRef={refs.textEditor}
      onExit={stage.exitEditing}
      onStartEditing={() => {
        // Typing is its own undo step, apart from a nudge or a drag made just before.
        undo.stopCapturing();
        dispatch({ type: "startEdit", elementId: element.id, cellKey });
      }}
      onUndo={undo.undo}
      onRedo={undo.redo}
      // Mod-B takes the toolbar's path: without `on`, formatLiveText turns bold off where it shows (a bold default too).
      onBold={() => actions.formatText({ kind: "mark", mark: "bold" })}
      onContentError={() => stage.markBroken(key)}
    />
  );
}

const renderStageEditor = (element: SlideElement, cellKey?: string) => <StageTextEditor element={element} cellKey={cellKey} />;

export function SlidesStage({ touch = false, className }: SlidesStageProps) {
  const { deck, ui, dispatch, el: actions, canEditNow, refs, peers } = useSlidesEditor();
  const t = useT();
  const labels = useSlideViewLabels(touch);
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const [frames] = useState(() => new GestureFrameStore());
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const keysRef = useRef<HTMLTextAreaElement>(null);
  const lastTap = useRef<{ id: string; at: number; x: number; y: number } | null>(null);

  const slide = currentSlideOf(deck, ui);
  const size = deck.meta.size;
  const fit = useStageFit(viewport, size, { padding: (touch ? FIT_PADDING.touch : FIT_PADDING.desktop) + FRAME_BORDER });
  const scale = ui.zoom === "fit" ? fit.scale : ui.zoom;
  const editable = canEditNow && !deck.schemaTooNew;

  const byId = new Map((slide?.elements ?? []).map((e) => [e.id, e]));
  const single = ui.selection.length === 1 ? byId.get(ui.selection[0]) : undefined;
  const editingKey = ui.editing ? textTargetKey(ui.editing.elementId, ui.editing.cellKey) : null;
  const premount = editable && single && isTextCapable(single) && !single.locked ? single.id : null;
  const targetKey = editable ? (editingKey ?? premount) : null;
  const editorTargetId = targetKey && !broken.has(targetKey) ? targetKey : null;
  const slideId = slide?.id ?? null;

  const focusKeys = useCallback(() => {
    const keys = keysRef.current;
    if (!keys) return;
    keys.focus({ preventScroll: true });
    keys.select();
  }, []);
  useEffect(() => refs.stageFocus.register(focusKeys), [refs, focusKeys]);
  // The scale the slide is shown at, for the zoom menus (null until "fit" is measured).
  const shownScale = ui.zoom === "fit" && !fit.measured ? null : scale;
  useEffect(() => refs.stageScale.register(() => shownScale), [refs, shownScale]);

  // The hidden target holds a selected space only while elements are selected: Safari fires copy / cut only with a
  // selection, and with nothing selected a copy must not put that space on the clipboard.
  const armed = ui.selection.length > 0;
  useEffect(() => {
    const keys = keysRef.current;
    if (!keys) return;
    keys.value = armed ? " " : "";
    if (armed && document.activeElement === keys) keys.select();
  }, [armed]);

  const exitEditing = useCallback(() => {
    dispatch({ type: "endEdit" });
    refs.stageFocus.focus();
  }, [dispatch, refs]);

  const markBroken = useCallback((key: string) => {
    setBroken((prev) => new Set(prev).add(key));
    dispatch({ type: "endEdit" });
  }, [dispatch]);
  const stageEditor: StageEditorValue = { slideId, labels, exitEditing, markBroken };

  const onSelect = useCallback((ids: string[]) => dispatch({ type: "select", ids }), [dispatch]);
  const onCommit = useCallback((entries: ElementPatchEntry[]) => actions.patch(entries), [actions]);

  /**
   * Starts typing in element `id` (a table: its cell `cellKey`) at a viewport point, inside the current event,
   * mounting its editor first if needed.
   */
  const editAt = (id: string, point: { x: number; y: number }, cellKey?: string) => {
    const element = byId.get(id);
    if (!editable || !element || element.locked) return;
    const key = textTargetKey(id, element.type === "table" ? cellKey : undefined);
    if (element.type === "table") {
      if (!cellKey) return;
      if (refs.textEditor.current?.target !== key) flushSync(() => dispatch({ type: "startEdit", elementId: id, cellKey }));
    } else {
      if (!isTextCapable(element)) return;
      if (refs.textEditor.current?.target !== key) flushSync(() => dispatch({ type: "select", ids: [id] }));
    }
    const handle = refs.textEditor.current;
    if (handle?.target === key) handle.enterEditing({ at: point });
  };

  /** True when the press names the target being typed in (the same box, or the same table cell). */
  const isEditingTarget = (id: string, cellKey?: string) => editingKey !== null && editingKey === textTargetKey(id, cellKey);

  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const id = selectedWrapperId(event.target);
    const cellKey = cellKeyOf(event.target);
    if (!id || isEditingTarget(id, cellKey)) return;
    editAt(id, { x: event.clientX, y: event.clientY }, cellKey);
  };

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const touchPoint = event.changedTouches[0];
    const id = selectedWrapperId(event.target);
    if (!touchPoint || !id || event.touches.length > 0) return;
    const now = event.timeStamp;
    const prev = lastTap.current;
    const again = prev && prev.id === id && now - prev.at < DOUBLE_TAP_MS && Math.hypot(touchPoint.clientX - prev.x, touchPoint.clientY - prev.y) < DOUBLE_TAP_PX;
    lastTap.current = again ? null : { id, at: now, x: touchPoint.clientX, y: touchPoint.clientY };
    const cellKey = cellKeyOf(event.target);
    if (!again || isEditingTarget(id, cellKey)) return;
    editAt(id, { x: touchPoint.clientX, y: touchPoint.clientY }, cellKey);
  };

  /**
   * A press on the box being typed in, outside its text (its empty space, another cell of its table), or on its
   * transform handles: typing goes on there. False when the press was elsewhere.
   */
  const keepTyping = (target: Element, point: { x: number; y: number }): boolean => {
    const editing = ui.editing;
    if (!editing) return false;
    const inBox = selectedWrapperId(target) === editing.elementId;
    if (!inBox && !target.closest(MOVEABLE_CONTROLS)) return false;
    const cellKey = inBox ? cellKeyOf(target) : undefined;
    if (editing.cellKey && cellKey && cellKey !== editing.cellKey) {
      editAt(editing.elementId, point, cellKey);
      return true;
    }
    const handle = refs.textEditor.current;
    if (!handle || handle.target !== editingKey || handle.editor.isDestroyed) {
      // No live editor to give the caret to: leave editing rather than keep a state no key can reach.
      dispatch({ type: "endEdit" });
      return false;
    }
    if (handle.editor.view.hasFocus()) return true;
    if (inBox) handle.enterEditing({ at: point });
    else handle.editor.view.focus();
    return true;
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest("[contenteditable='true'], input, textarea, select, button, [role='button']")) return;
    if (keepTyping(target, { x: event.clientX, y: event.clientY })) return;
    // Anywhere else the keys go back to the stage, after a mouse press only: focusing a text field inside a touch or
    // pen gesture raises the soft keyboard.
    if (event.pointerType === "mouse") focusKeys();
  };

  const hasFiles = (event: DragEvent<HTMLDivElement>) => Array.from(event.dataTransfer.types).includes("Files");
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!editable || !hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!editable || !hasFiles(event)) return;
    event.preventDefault();
    const rect = stage?.getBoundingClientRect();
    const at = rect && scale > 0 ? { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale } : undefined;
    void actions.insertImageFiles(Array.from(event.dataTransfer.files), at);
  };

  if (!slide) {
    return (
      <div className={cn("flex h-full w-full items-center justify-center bg-muted", className)}>
        <EmptyState
          icon={Presentation}
          title={t("slides.editor.emptyDeckTitle")}
          action={
            editable ? (
              <Button variant="outline" size="sm" onClick={() => actions.addSlide()}>
                {t("slides.editor.emptyDeckAction")}
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const line = single && single.type === "line" && editable && !single.locked ? single : null;
  const index = deck.slideIds.indexOf(slide.id) + 1;
  return (
    <div
      ref={setViewport}
      {...{ [STAGE_VIEWPORT_ATTR]: "" }}
      className={cn("relative h-full w-full overflow-auto bg-muted select-none", className)}
      onPointerUp={onPointerUp}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {touch ? null : (
        <textarea
          ref={keysRef}
          {...{ [STAGE_KEYS_ATTR]: "" }}
          aria-label={fmt(t("slides.rail.slideN"), { n: index })}
          className="peer sr-only"
          defaultValue=""
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onInput={(event) => {
            // Whatever was typed here was not for a text box (none was selected): drop it.
            event.currentTarget.value = armed ? " " : "";
            event.currentTarget.select();
          }}
        />
      )}
      <div
        className="flex min-h-full w-max min-w-full peer-focus-visible:*:outline-2 peer-focus-visible:*:outline-ring"
        style={{ padding: touch ? FIT_PADDING.touch : FIT_PADDING.desktop }}
      >
        <div
          className="m-auto shrink-0 border border-border bg-background"
          style={{ visibility: ui.zoom === "fit" && !fit.measured ? "hidden" : undefined }}
        >
          {/* The slide box itself has no border, so its client rect is the slide's origin (snap guides, drops). */}
          <div
            ref={setStage}
            data-slides-stage=""
            className="relative"
            style={{ width: size.w * scale, height: size.h * scale }}
            onDoubleClick={onDoubleClick}
            onTouchEnd={onTouchEnd}
          >
            <GestureFramesContext.Provider value={frames}>
              <StageEditorContext.Provider value={stageEditor}>
                <SlideView deck={deck} slide={slide} scale={scale} mode="edit" editorTargetId={editorTargetId} renderEditor={renderStageEditor} labels={labels} />
              </StageEditorContext.Provider>
              <PresenceLayer slide={slide} peers={peers} scale={scale} />
              {line ? (
                <LineHandles
                  line={line}
                  scale={scale}
                  stage={stage}
                  onCommit={onCommit}
                  touch={touch}
                  labels={{ start: t("slides.format.arrowStart"), end: t("slides.format.arrowEnd") }}
                />
              ) : null}
              <SelectionLayer
                stage={stage}
                viewport={viewport}
                scale={scale}
                slideSize={size}
                slide={slide}
                selection={ui.selection}
                onSelect={onSelect}
                onCommit={onCommit}
                snap={ui.snap}
                touch={touch}
                editable={editable}
                editingId={ui.editing?.elementId ?? null}
              />
            </GestureFramesContext.Provider>
          </div>
        </div>
      </div>
    </div>
  );
}
