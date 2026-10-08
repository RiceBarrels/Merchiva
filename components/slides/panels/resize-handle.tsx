"use client";

// The drag edge of a resizable region of the Slides editor (slides.md §7.3): the slide rail's inline-end edge
// (160-280 px) and the speaker notes' top edge (80-320 px). A focusable separator: the arrow keys move it (Shift
// for bigger steps), Home and End go to the limits. While a pointer drags it, `onPreview` gets the live value (the
// region resizes without re-rendering the whole editor) and `onCommit` gets the final one, which the editor keeps
// as a per-viewer preference.
import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { cn } from "@/lib/utils";

const STEP = 8;
const BIG_STEP = 32;

export interface ResizeHandleProps {
  /** `end`: the inline-end edge of a column (resizes its width); `top`: the top edge of a bottom panel (its height). */
  edge: "end" | "top";
  value: number;
  min: number;
  max: number;
  /** Names the region being resized. */
  label: string;
  onPreview(value: number | null): void;
  onCommit(value: number): void;
  className?: string;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function ResizeHandle({ edge, value, min, max, label, onPreview, onCommit, className }: ResizeHandleProps) {
  const drag = useRef<{ pointerId: number; start: number; from: number; sign: number; last: number } | null>(null);

  /** +1 when moving the pointer right (or down) grows the region, -1 when it shrinks it. */
  const signOf = (el: HTMLElement) => {
    if (edge === "top") return -1;
    return getComputedStyle(el).direction === "rtl" ? -1 : 1;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    const el = event.currentTarget;
    el.setPointerCapture(event.pointerId);
    const start = edge === "top" ? event.clientY : event.clientX;
    drag.current = { pointerId: event.pointerId, start, from: value, sign: signOf(el), last: value };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const pos = edge === "top" ? event.clientY : event.clientX;
    const next = clamp(Math.round(d.from + (pos - d.start) * d.sign), min, max);
    if (next === d.last) return;
    d.last = next;
    onPreview(next);
  };

  const finish = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onPreview(null);
    if (commit && d.last !== d.from) onCommit(d.last);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const sign = signOf(event.currentTarget);
    let next: number | null = null;
    if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    else if (edge === "top" && (event.key === "ArrowUp" || event.key === "ArrowDown")) next = value + (event.key === "ArrowUp" ? step : -step);
    else if (edge === "end" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) next = value + (event.key === "ArrowRight" ? step : -step) * sign;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    const clamped = clamp(next, min, max);
    if (clamped !== value) onCommit(clamped);
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={edge === "top" ? "horizontal" : "vertical"}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event, true)}
      onPointerCancel={(event) => finish(event, false)}
      onKeyDown={onKeyDown}
      className={cn(
        "group absolute z-20 touch-none outline-none",
        edge === "top" ? "inset-x-0 -top-1 h-2 cursor-row-resize" : "inset-y-0 -end-1 w-2 cursor-col-resize",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute bg-transparent transition-colors group-hover:bg-ring group-focus-visible:bg-ring",
          edge === "top" ? "inset-x-0 top-1/2 h-px" : "inset-y-0 start-1/2 w-px",
        )}
      />
    </div>
  );
}
