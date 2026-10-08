"use client";

// Selection and transforms on the stage (slides.md §5.3), with react-moveable 0.56 and react-selecto 1.26. The
// React 19.2 spike (StrictMode dev, scale 0.5 / 1 / 2, Chromium and WebKit) passed drag, resize, rotate, group,
// snap, marquee, press-drag hand-off, and line body drags alone and in a mixed selection; iPad Safari is a manual
// check. Two findings shaped this file: guidelines are in screen px of the snap container (pt × scale), and
// the frame store must be written inside flushSync so Moveable, which re-reads the target's rect right after each
// event, never lags a step behind.
//
// React stays the only writer of element style: every gesture step replaces the frames in the stage's
// GestureFrameStore (ElementView renders from them), and the gesture's end turns them into element patches that
// `onCommit` writes in one transaction (one undo step). A remote edit of a dragged element cannot fight the drag.
//
// Moveable positions its control box relative to its own parent, so it is portaled into the viewport (the container
// it measures against), not rendered inside the slide box.
//
// Lines are drag-only targets (their wrapper is the padded endpoint box): with a line in the selection there are no
// resize or rotate handles, and a group drag moves every line by its endpoints. Endpoint editing is line-handles.tsx.
// Locked elements are selectable (so they can be unlocked) but never transform targets; they get a dashed outline.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal, flushSync } from "react-dom";
import Moveable, {
  type OnDrag, type OnDragGroup, type OnDragGroupStart, type OnDragStart, type OnResize, type OnResizeGroup,
  type OnResizeGroupStart, type OnResizeStart, type OnRotate, type OnRotateGroup, type OnRotateGroupStart, type OnRotateStart,
} from "react-moveable";
import Selecto, { type OnDragStart as OnSelectoDragStart, type OnSelectEnd } from "react-selecto";

import { useGestureFrameStore } from "@/components/slides/canvas/gesture-frames";
import { LINE_HIT_PAD } from "@/components/slides/canvas/line-view";
import { frameAfterDrag, frameAfterResize, frameAfterRotate, gesturePatches, startFrame, type GestureFrame } from "@/lib/slides/editor/gestures";
import { elementBounds } from "@/lib/slides/geometry/arrange";
import type { ElementPatchEntry, SlideElement, SlideSnapshot } from "@/lib/slides/model/types";

export interface SelectionLayerProps {
  /** The unscaled box the slide is drawn in (its elements carry data-el-id); the snap container. */
  stage: HTMLDivElement | null;
  /** The scroll container around it: Moveable's and Selecto's container. */
  viewport: HTMLDivElement | null;
  scale: number;
  /** The deck's slide size (pt): its edges and centre lines are snap guides. */
  slideSize: { w: number; h: number };
  slide: SlideSnapshot;
  selection: readonly string[];
  onSelect(ids: string[], additive: boolean): void;
  onCommit(entries: ElementPatchEntry[]): void;
  snap: boolean;
  /** Touch layout: bigger hit areas, corner handles only, no rotate handle. */
  touch: boolean;
  /** Transform handles (false for viewers and read-only decks: selection still works, for copy). */
  editable: boolean;
  /** The element being typed in: pointer drags inside it select text instead of starting a gesture. */
  editingId: string | null;
}

/** Marks overlay controls (line handles…) that a marquee must not start from. */
export const NO_SELECT_ATTR = "data-slides-no-select";

/** Snap distance in screen px. */
const SNAP_PX = 5;
const DESKTOP_DIRECTIONS = ["nw", "n", "ne", "w", "e", "sw", "s", "se"];
const TOUCH_DIRECTIONS = ["nw", "ne", "sw", "se"];
const SNAP_DIRECTIONS = { left: true, top: true, right: true, bottom: true, center: true, middle: true };
/** Moveable and Selecto paint with the app's neutral primary (their default is a bright blue), with sharp handles. */
const MOVEABLE_CLASS = "[--moveable-color:var(--primary)]! [&_.moveable-control]:rounded-[2px]!";
const SELECTO_WRAP_CLASS = "contents [&_.selecto-selection]:border-primary! [&_.selecto-selection]:bg-primary/10!";

type ElementRef = () => HTMLElement;

/** A lazy lookup of an element's wrapper inside the stage (never a document-wide selector: tabs are kept alive). */
function wrapperRef(stage: HTMLDivElement | null, id: string): ElementRef {
  // Moveable resolves refs when it renders and again after commit, so a wrapper that mounts in the same commit
  // is found on the second pass; a missing one is skipped (null).
  return (() => stage?.querySelector<HTMLElement>(`[data-el-id="${id}"]`) ?? null) as unknown as ElementRef;
}

const idOf = (target: HTMLElement | SVGElement) => target.getAttribute("data-el-id") ?? "";

function LockedOutline({ el, scale }: { el: SlideElement; scale: number }) {
  const b = el.type === "line" ? elementBounds(el) : el;
  const rot = el.type === "line" ? 0 : el.rot;
  const style: CSSProperties = {
    position: "absolute",
    left: b.x * scale,
    top: b.y * scale,
    width: Math.max(1, b.w * scale),
    height: Math.max(1, b.h * scale),
    transform: rot ? `rotate(${rot}deg)` : undefined,
    pointerEvents: "none",
  };
  return <div aria-hidden="true" className="border border-dashed border-foreground/60" style={style} />;
}

export function SelectionLayer({ stage, viewport, scale, slideSize, slide, selection, onSelect, onCommit, snap, touch, editable, editingId }: SelectionLayerProps) {
  const frames = useGestureFrameStore();
  const moveableRef = useRef<Moveable>(null);
  const selectoRef = useRef<Selecto>(null);
  const gesture = useRef<{ start: Map<string, GestureFrame>; current: Map<string, GestureFrame> }>({ start: new Map(), current: new Map() });
  const [shift, setShift] = useState(false);

  const byId = useMemo(() => new Map(slide.elements.map((el) => [el.id, el])), [slide.elements]);
  const selected = selection.flatMap((id) => byId.get(id) ?? []);
  const movable = editable ? selected.filter((el) => !el.locked) : [];
  const locked = selected.filter((el) => !movable.includes(el));
  const hasLine = movable.some((el) => el.type === "line");
  const onlyPictures = movable.length > 0 && movable.every((el) => el.type === "image");
  const selectionKey = selection.join(",");
  const movableKey = movable.map((el) => el.id).join(",");

  // Lazy lookups, rebuilt each render: Moveable compares what they resolve to, not the functions.
  const targets = movable.map((el) => wrapperRef(stage, el.id));
  const selectedIds = new Set(selection);
  const guides = snap && editable ? slide.elements.filter((el) => !selectedIds.has(el.id)).map((el) => wrapperRef(stage, el.id)) : [];

  // Shift keeps the ratio (pictures: releases it) and rotates in 15° steps while held.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => setShift(event.shiftKey);
    const onBlur = () => setShift(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // The stage moved or the elements changed under a selection: re-read the handles' positions.
  useLayoutEffect(() => {
    moveableRef.current?.updateRect();
  }, [scale, slide, movableKey]);

  // Selecto keeps its own list (for Shift-click toggling); keep it equal to the editor's selection.
  useEffect(() => {
    const nodes = selectionKey === "" ? [] : selectionKey.split(",").flatMap((id) => stage?.querySelector<HTMLElement>(`[data-el-id="${id}"]`) ?? []);
    selectoRef.current?.setSelectedTargets(nodes);
  }, [selectionKey, slide, stage]);

  // A gesture cut short (unmount, slide change) leaves no frames behind.
  useEffect(() => () => frames?.clear(), [frames, slide.id]);

  const seed = (ids: readonly string[]) => {
    const start = new Map<string, GestureFrame>();
    for (const id of ids) {
      const el = byId.get(id);
      if (el) start.set(id, startFrame(el));
    }
    gesture.current = { start, current: new Map(start) };
    flushSync(() => frames?.set(new Map(start)));
  };
  const step = (next: Map<string, GestureFrame>) => {
    gesture.current.current = next;
    flushSync(() => frames?.set(next));
  };
  const end = () => {
    const entries = gesturePatches(slide.elements, gesture.current.current);
    gesture.current = { start: new Map(), current: new Map() };
    if (entries.length === 0) {
      frames?.clear();
      return;
    }
    onCommit(entries);
    // The deck store publishes the commit in a microtask queued by the write above; clearing after it means the
    // element never flashes back to its old place.
    queueMicrotask(() => frames?.clear());
  };
  const startOf = (target: HTMLElement | SVGElement) => {
    const id = idOf(target);
    const s = gesture.current.start.get(id);
    return s ? { id, s, line: byId.get(id)?.type === "line" } : null;
  };
  const dragged = (e: OnDrag): [string, GestureFrame] | null => {
    const hit = startOf(e.target);
    return hit ? [hit.id, frameAfterDrag(hit.s, e.beforeTranslate, hit.line, LINE_HIT_PAD)] : null;
  };
  const resized = (e: OnResize): [string, GestureFrame] | null => {
    const hit = startOf(e.target);
    return hit ? [hit.id, frameAfterResize(hit.s, e.width, e.height, e.drag.beforeTranslate)] : null;
  };
  const rotated = (e: OnRotate): [string, GestureFrame] | null => {
    const hit = startOf(e.target);
    return hit ? [hit.id, frameAfterRotate(hit.s, e.rotation, e.drag.beforeTranslate)] : null;
  };
  const stepAll = <E,>(events: readonly E[], fn: (e: E) => [string, GestureFrame] | null) =>
    step(new Map(events.flatMap((e) => {
      const entry = fn(e);
      return entry ? [entry] : [];
    })));

  const onSelectoDragStart = (e: OnSelectoDragStart) => {
    const target = e.inputEvent.target;
    if (!(target instanceof Element)) return;
    const moveable = moveableRef.current;
    const wrapper = target.closest("[data-el-id]");
    const onSelected = wrapper !== null && selection.includes(wrapper.getAttribute("data-el-id") ?? "");
    const inEditor = editingId !== null && wrapper?.getAttribute("data-el-id") === editingId;
    if (target.closest(`[${NO_SELECT_ATTR}]`) || (moveable && moveable.isMoveableElement(target)) || onSelected || inEditor) e.stop();
  };
  const onSelectEnd = (e: OnSelectEnd) => {
    const ids = e.selected.map(idOf).filter((id) => id !== "");
    const input = e.inputEvent as MouseEvent | TouchEvent | undefined;
    const additive = !!input && "shiftKey" in input && input.shiftKey;
    const moveable = moveableRef.current;
    const handOff = e.isDragStart && editable && moveable && input ? moveable.waitToChangeTarget() : null;
    flushSync(() => onSelect(ids, additive));
    if (handOff && moveable && input) {
      input.preventDefault();
      handOff.then(() => moveable.dragStart(input)).catch(() => undefined);
    }
  };

  const keepRatio = onlyPictures ? !shift : shift;
  const target = targets.length === 1 ? targets[0] : targets.length > 1 ? targets : null;
  // Slide edges and centre lines, in screen px of the snap container (the spike: guideline values are not scaled).
  const guideLinesX = [0, slideSize.w / 2, slideSize.w].map((v) => v * scale);
  const guideLinesY = [0, slideSize.h / 2, slideSize.h].map((v) => v * scale);

  const handles =
    viewport && stage ? (
      <Moveable
        ref={moveableRef}
        className={MOVEABLE_CLASS}
        target={target}
        container={viewport}
        rootContainer={viewport}
        flushSync={flushSync}
        origin={false}
        checkInput
        useResizeObserver
        useMutationObserver
        draggable={editable}
        resizable={editable && !hasLine}
        rotatable={editable && !hasLine && !touch}
        keepRatio={keepRatio}
        throttleRotate={shift ? 15 : 1}
        renderDirections={touch ? TOUCH_DIRECTIONS : DESKTOP_DIRECTIONS}
        controlPadding={touch ? 12 : undefined}
        snappable={snap && editable}
        snapContainer={stage}
        snapThreshold={SNAP_PX}
        snapDirections={SNAP_DIRECTIONS}
        elementSnapDirections={SNAP_DIRECTIONS}
        verticalGuidelines={guideLinesX}
        horizontalGuidelines={guideLinesY}
        elementGuidelines={guides}
        isDisplaySnapDigit={false}
        onDragStart={(e: OnDragStart) => seed([idOf(e.target)])}
        onDrag={(e: OnDrag) => stepAll([e], dragged)}
        onDragEnd={end}
        onDragGroupStart={(e: OnDragGroupStart) => seed(e.targets.map(idOf))}
        onDragGroup={(e: OnDragGroup) => stepAll(e.events, dragged)}
        onDragGroupEnd={end}
        onResizeStart={(e: OnResizeStart) => seed([idOf(e.target)])}
        onResize={(e: OnResize) => stepAll([e], resized)}
        onResizeEnd={end}
        onResizeGroupStart={(e: OnResizeGroupStart) => seed(e.targets.map(idOf))}
        onResizeGroup={(e: OnResizeGroup) => stepAll(e.events, resized)}
        onResizeGroupEnd={end}
        onRotateStart={(e: OnRotateStart) => seed([idOf(e.target)])}
        onRotate={(e: OnRotate) => stepAll([e], rotated)}
        onRotateEnd={end}
        onRotateGroupStart={(e: OnRotateGroupStart) => seed(e.targets.map(idOf))}
        onRotateGroup={(e: OnRotateGroup) => stepAll(e.events, rotated)}
        onRotateGroupEnd={end}
      />
    ) : null;

  return (
    <>
      {locked.map((el) => (
        <LockedOutline key={el.id} el={el} scale={scale} />
      ))}
      {handles && viewport ? createPortal(handles, viewport) : null}
      {viewport && stage ? (
        <span className={SELECTO_WRAP_CLASS}>
          <Selecto
            ref={selectoRef}
            dragContainer={viewport}
            selectableTargets={[() => Array.from(stage.querySelectorAll<HTMLElement>("[data-el-id]"))]}
            selectByClick
            selectFromInside={false}
            toggleContinueSelect={["shift"]}
            hitRate={0}
            checkInput
            onDragStart={onSelectoDragStart}
            onSelectEnd={onSelectEnd}
          />
        </span>
      ) : null}
    </>
  );
}
