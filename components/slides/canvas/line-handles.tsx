"use client";

// Endpoint handles of the one selected line (slides.md §5.3). Moving a line as a whole is a Moveable drag (the
// selection layer); these two handles move one end each. A drag writes a frame with explicit endpoints into the
// stage's gesture store (ElementView and the handles render from it), and releasing commits x1/y1/x2/y2 in one
// write (one undo step). Shift snaps the angle to 45° steps; Escape cancels. A focused handle moves with the arrow
// keys (Shift: 10 pt), so the ends are reachable without a pointer.
import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { lineEndpoints } from "@/components/slides/canvas/element-view";
import { useElementFrame, useGestureFrameStore } from "@/components/slides/canvas/gesture-frames";
import { NO_SELECT_ATTR } from "@/components/slides/canvas/selection-layer";
import { endpointFrame, gesturePatch } from "@/lib/slides/editor/gestures";
import { NUDGE_BIG_PT, NUDGE_PT } from "@/lib/slides/editor/keys";
import type { ElementPatchEntry, LineElement } from "@/lib/slides/model/types";

export interface LineHandlesProps {
  line: LineElement;
  scale: number;
  /** The unscaled stage box the handles are positioned in (pointer positions are measured against it). */
  stage: HTMLDivElement | null;
  onCommit(entries: ElementPatchEntry[]): void;
  touch: boolean;
  labels: { start: string; end: string };
}

type End = "start" | "end";

const ARROW_STEP: Readonly<Record<string, [number, number]>> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

export function LineHandles({ line, scale, stage, onCommit, touch, labels }: LineHandlesProps) {
  const frames = useGestureFrameStore();
  const frame = useElementFrame(line.id);
  const drag = useRef<{ end: End; pointerId: number } | null>(null);
  const points = lineEndpoints(line, frame);

  const pointAt = (event: PointerEvent<HTMLElement>) => {
    const rect = stage?.getBoundingClientRect();
    if (!rect || scale <= 0) return null;
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  };
  const moveTo = (end: End, event: PointerEvent<HTMLElement>) => {
    const point = pointAt(event);
    if (point) frames?.update(line.id, endpointFrame(line, end, point, event.shiftKey));
  };
  const finish = (commit: boolean) => {
    const current = frames?.get(line.id) ?? null;
    drag.current = null;
    const entry = commit && current ? gesturePatch(line, current) : null;
    if (!entry) {
      frames?.update(line.id, null);
      return;
    }
    onCommit([entry]);
    // After the deck store's publish of the commit (queued by the write), so the line never jumps back.
    queueMicrotask(() => frames?.update(line.id, null));
  };

  const handle = (end: End) => {
    const x = end === "start" ? points.x1 : points.x2;
    const y = end === "start" ? points.y1 : points.y2;
    const size = touch ? 22 : 10;
    return (
      <div
        key={end}
        role="button"
        tabIndex={0}
        aria-label={end === "start" ? labels.start : labels.end}
        {...{ [NO_SELECT_ATTR]: "" }}
        className="pointer-events-auto absolute box-border cursor-crosshair touch-none border border-primary bg-background focus-visible:outline-2 focus-visible:outline-ring"
        style={{ left: x * scale - size / 2, top: y * scale - size / 2, width: size, height: size }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.stopPropagation();
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          // Keyboard focus follows (preventDefault kept it away), so Escape reaches this handle and cancels.
          event.currentTarget.focus({ preventScroll: true });
          drag.current = { end, pointerId: event.pointerId };
          moveTo(end, event);
        }}
        onPointerMove={(event) => {
          if (drag.current?.pointerId === event.pointerId) moveTo(drag.current.end, event);
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId === event.pointerId) finish(true);
        }}
        onPointerCancel={() => finish(false)}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === "Escape" && drag.current) {
            event.stopPropagation();
            finish(false);
            return;
          }
          const arrow = ARROW_STEP[event.key];
          if (!arrow || event.metaKey || event.ctrlKey || event.altKey) return;
          event.preventDefault();
          event.stopPropagation();
          const step = event.shiftKey ? NUDGE_BIG_PT : NUDGE_PT;
          const moved = endpointFrame(line, end, { x: x + arrow[0] * step, y: y + arrow[1] * step }, false);
          const entry = gesturePatch(line, moved);
          if (entry) onCommit([entry]);
        }}
      />
    );
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      {handle("start")}
      {handle("end")}
    </div>
  );
}
