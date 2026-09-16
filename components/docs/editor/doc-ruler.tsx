"use client";

/**
 * Page rulers — the horizontal one above the sheets and the vertical one beside them.
 *
 * They do two jobs: show where the text column sits on the paper, and let a member drag the four things Word puts
 * on a ruler — the page margins, and the current paragraph's left, right and first-line indents. Margins are shared
 * (they go to the page setup on the Y.Doc); indents belong to the selected blocks.
 *
 * Everything is measured in inches and drawn at `PX_PER_INCH * zoom`, matching the sheet exactly, and positioned
 * physically (left/right, not inline-start/end) because paper geometry does not mirror with the text direction.
 */
import { useCallback, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";

import { INDENT_STEP_IN, type IndentSide } from "@/lib/docs/extensions/indent";
import {
  CM_PER_INCH,
  MIN_CONTENT_IN,
  PX_PER_INCH,
  pageMetricsPx,
  pageSizeIn,
  type DocPageSetup,
} from "@/lib/docs/page-setup";
import type { PaginationLayout } from "@/lib/docs/pagination/measure";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

/** Margins snap to 1/16in (1mm in metric); indents to 1/8in, matching Word. */
const MARGIN_SNAP_IN = 1 / 16;
const MARGIN_SNAP_CM = 0.1 / CM_PER_INCH;
const INDENT_SNAP_IN = 1 / 8;

export interface BlockIndents {
  readonly left: number;
  readonly right: number;
  readonly first: number;
}

const NO_INDENTS: BlockIndents = { left: 0, right: 0, first: 0 };

/** Left / right / first-line indent of the block at the selection head, in 0.5in steps. */
export function useBlockIndents(editor: Editor | null): BlockIndents {
  return useEditorState({
    editor,
    selector: ({ editor: ed }): BlockIndents => {
      if (!ed) return NO_INDENTS;
      const parent = ed.state.selection.$head.parent;
      return {
        left: Number(parent.attrs.indent) || 0,
        right: Number(parent.attrs.indentRight) || 0,
        first: Number(parent.attrs.indentFirst) || 0,
      };
    },
    equalityFn: (a, b) => !!a && !!b && a.left === b.left && a.right === b.right && a.first === b.first,
  }) ?? NO_INDENTS;
}

type DragTarget = "marginLeft" | "marginRight" | "marginTop" | "marginBottom" | "indentLeft" | "indentRight" | "indentFirst";

interface RulerDragState {
  readonly target: DragTarget;
  readonly startClient: number;
  readonly startValue: number;
  /** Left indent moves the first line with it, so the drag carries both. */
  readonly startCompanion: number;
}

function snap(valueIn: number, step: number): number {
  return Math.round(valueIn / step) * step;
}

function ticks(lengthIn: number, unit: "in" | "cm"): { at: number; major: boolean; label: string | null }[] {
  const out: { at: number; major: boolean; label: string | null }[] = [];
  const minor = unit === "in" ? 1 / 8 : 0.25 / CM_PER_INCH;
  const major = unit === "in" ? 1 : 1 / CM_PER_INCH;
  const count = Math.ceil(lengthIn / minor);
  for (let i = 0; i <= count; i++) {
    const at = i * minor;
    if (at > lengthIn + 1e-6) break;
    const majorIndex = at / major;
    const isMajor = Math.abs(majorIndex - Math.round(majorIndex)) < 1e-6;
    out.push({ at, major: isMajor, label: isMajor && Math.round(majorIndex) > 0 ? String(Math.round(majorIndex)) : null });
  }
  return out;
}

export function DocRuler({
  setup,
  zoom,
  unit,
  canEdit,
  editor,
  onSetupChange,
}: {
  setup: DocPageSetup;
  zoom: number;
  unit: "in" | "cm";
  canEdit: boolean;
  editor: Editor | null;
  onSetupChange: (next: DocPageSetup) => void;
}) {
  const t = useT();
  const indents = useBlockIndents(editor);
  const size = pageSizeIn(setup);
  const scale = PX_PER_INCH * zoom;
  const drag = useRef<RulerDragState | null>(null);
  const [dragging, setDragging] = useState<DragTarget | null>(null);
  const marginSnap = unit === "in" ? MARGIN_SNAP_IN : MARGIN_SNAP_CM;

  const setIndent = useCallback(
    (side: IndentSide, steps: number) => {
      if (!editor || editor.isDestroyed) return;
      editor.chain().setBlockIndent(side, steps).run();
    },
    [editor],
  );

  const onPointerDown = (target: DragTarget, startValue: number, startCompanion: number) => (event: React.PointerEvent) => {
    if (!canEdit) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      target,
      startClient: target === "marginTop" || target === "marginBottom" ? event.clientY : event.clientX,
      startValue,
      startCompanion,
    };
    setDragging(target);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const vertical = state.target === "marginTop" || state.target === "marginBottom";
    const client = vertical ? event.clientY : event.clientX;
    // Right-hand handles grow as the pointer moves left.
    const direction = state.target === "marginRight" || state.target === "marginBottom" ? -1 : 1;
    const deltaIn = ((client - state.startClient) / scale) * direction;

    switch (state.target) {
      case "marginLeft":
      case "marginRight":
      case "marginTop":
      case "marginBottom": {
        const key = state.target === "marginLeft" ? "left" : state.target === "marginRight" ? "right" : state.target === "marginTop" ? "top" : "bottom";
        const extent = key === "top" || key === "bottom" ? size.height : size.width;
        const opposite = key === "left" ? setup.margins.right : key === "right" ? setup.margins.left : key === "top" ? setup.margins.bottom : setup.margins.top;
        const next = Math.max(0, Math.min(extent - opposite - MIN_CONTENT_IN, snap(state.startValue + deltaIn, marginSnap)));
        onSetupChange({ ...setup, margins: { ...setup.margins, [key]: Math.round(next * 1000) / 1000 } });
        break;
      }
      case "indentLeft": {
        const steps = snap(state.startValue * INDENT_STEP_IN + deltaIn, INDENT_SNAP_IN) / INDENT_STEP_IN;
        setIndent("left", steps);
        // Word carries the first line with the left indent so a hanging indent keeps its shape.
        setIndent("first", state.startCompanion);
        break;
      }
      case "indentFirst":
        setIndent("first", snap((state.startValue + state.startCompanion) * INDENT_STEP_IN + deltaIn, INDENT_SNAP_IN) / INDENT_STEP_IN - state.startCompanion);
        break;
      case "indentRight":
        setIndent("right", snap(state.startValue * INDENT_STEP_IN + deltaIn, INDENT_SNAP_IN) / INDENT_STEP_IN);
        break;
    }
  };

  const endDrag = (event: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const marginLeftPx = setup.margins.left * scale;
  const marginRightPx = setup.margins.right * scale;
  const widthPx = size.width * scale;
  const indentLeftPx = marginLeftPx + indents.left * INDENT_STEP_IN * scale;
  const indentFirstPx = marginLeftPx + (indents.left + indents.first) * INDENT_STEP_IN * scale;
  const indentRightPx = widthPx - marginRightPx - indents.right * INDENT_STEP_IN * scale;

  return (
    <div
      className={cn("doc-ruler doc-ruler-h", dragging && "is-dragging")}
      style={{ width: widthPx }}
      role="presentation"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="doc-ruler-band" style={{ left: 0, width: marginLeftPx }} />
      <div className="doc-ruler-band" style={{ left: widthPx - marginRightPx, width: marginRightPx }} />
      {ticks(size.width, unit).map((tick, index) => (
        <span key={index} className={cn("doc-ruler-tick", tick.major && "is-major")} style={{ left: tick.at * scale }}>
          {tick.label && <i>{tick.label}</i>}
        </span>
      ))}
      {canEdit && (
        <>
          <button
            type="button"
            className="doc-ruler-margin"
            style={{ left: marginLeftPx }}
            title={t("docs.ruler.leftMargin")}
            aria-label={t("docs.ruler.leftMargin")}
            onPointerDown={onPointerDown("marginLeft", setup.margins.left, 0)}
          />
          <button
            type="button"
            className="doc-ruler-margin"
            style={{ left: widthPx - marginRightPx }}
            title={t("docs.ruler.rightMargin")}
            aria-label={t("docs.ruler.rightMargin")}
            onPointerDown={onPointerDown("marginRight", setup.margins.right, 0)}
          />
          <button
            type="button"
            className="doc-ruler-marker is-first"
            style={{ left: indentFirstPx }}
            title={t("docs.ruler.firstLineIndent")}
            aria-label={t("docs.ruler.firstLineIndent")}
            onPointerDown={onPointerDown("indentFirst", indents.left, indents.first)}
          />
          <button
            type="button"
            className="doc-ruler-marker is-left"
            style={{ left: indentLeftPx }}
            title={t("docs.ruler.leftIndent")}
            aria-label={t("docs.ruler.leftIndent")}
            onPointerDown={onPointerDown("indentLeft", indents.left, indents.first)}
          />
          <button
            type="button"
            className="doc-ruler-marker is-right"
            style={{ left: indentRightPx }}
            title={t("docs.ruler.rightIndent")}
            aria-label={t("docs.ruler.rightIndent")}
            onPointerDown={onPointerDown("indentRight", indents.right, 0)}
          />
        </>
      )}
    </div>
  );
}

export function DocVerticalRuler({
  setup,
  zoom,
  unit,
  layout,
  canEdit,
  onSetupChange,
}: {
  setup: DocPageSetup;
  zoom: number;
  unit: "in" | "cm";
  layout: PaginationLayout | null;
  canEdit: boolean;
  onSetupChange: (next: DocPageSetup) => void;
}) {
  const t = useT();
  const size = pageSizeIn(setup);
  const metrics = pageMetricsPx(setup);
  const scale = PX_PER_INCH * zoom;
  const pages = layout?.pages ?? [{ top: 0, height: metrics.pageHeight }];
  const totalHeight = (layout?.totalHeight ?? metrics.pageHeight) * zoom;
  const drag = useRef<{ target: "marginTop" | "marginBottom"; startClient: number; startValue: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const marginSnap = unit === "in" ? MARGIN_SNAP_IN : MARGIN_SNAP_CM;

  const onPointerDown = (target: "marginTop" | "marginBottom", startValue: number) => (event: React.PointerEvent) => {
    if (!canEdit) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { target, startClient: event.clientY, startValue };
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const state = drag.current;
    if (!state) return;
    const direction = state.target === "marginBottom" ? -1 : 1;
    const deltaIn = ((event.clientY - state.startClient) / scale) * direction;
    const key = state.target === "marginTop" ? "top" : "bottom";
    const opposite = key === "top" ? setup.margins.bottom : setup.margins.top;
    const next = Math.max(0, Math.min(size.height - opposite - MIN_CONTENT_IN, snap(state.startValue + deltaIn, marginSnap)));
    onSetupChange({ ...setup, margins: { ...setup.margins, [key]: Math.round(next * 1000) / 1000 } });
  };

  const endDrag = (event: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div
      className={cn("doc-ruler doc-ruler-v", dragging && "is-dragging")}
      style={{ height: totalHeight }}
      role="presentation"
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {pages.map((page, index) => (
        <div key={index}>
          <div className="doc-ruler-band" style={{ top: page.top * zoom, height: metrics.marginTop * zoom }} />
          <div className="doc-ruler-band" style={{ top: (page.top + page.height - metrics.marginBottom) * zoom, height: metrics.marginBottom * zoom }} />
          {ticks(page.height / PX_PER_INCH, unit).map((tick, tickIndex) => (
            <span key={tickIndex} className={cn("doc-ruler-tick", tick.major && "is-major")} style={{ top: page.top * zoom + tick.at * scale }}>
              {tick.label && <i>{tick.label}</i>}
            </span>
          ))}
        </div>
      ))}
      {canEdit && (
        <>
          <button
            type="button"
            className="doc-ruler-margin"
            style={{ top: metrics.marginTop * zoom }}
            title={t("docs.ruler.topMargin")}
            aria-label={t("docs.ruler.topMargin")}
            onPointerDown={onPointerDown("marginTop", setup.margins.top)}
          />
          <button
            type="button"
            className="doc-ruler-margin"
            style={{ top: (pages[0].height - metrics.marginBottom) * zoom }}
            title={t("docs.ruler.bottomMargin")}
            aria-label={t("docs.ruler.bottomMargin")}
            onPointerDown={onPointerDown("marginBottom", setup.margins.bottom)}
          />
        </>
      )}
    </div>
  );
}
