"use client";

// Tables (slides.md §3): an HTML table with fixed layout. Column widths and row heights come from tableGrid, scaled
// to fill the element's frame, so resizing a table stretches it; rows are minimum heights and grow with their text.
// Merges come from the anchors' spans (imported; read-only in Phase 1), a missing cell (the concurrent row + column
// insert race) shows empty, and the header row and banding use the same look as the .pptx export (tableCellLook).
// Every cell carries data-cell-key for the editor's hit testing; the editor target `${tableId}/${cellKey}` renders
// the editor inside that cell.
import type { CSSProperties } from "react";

import type { ElementRenderContext } from "@/components/slides/canvas/element-view";
import { SlideTextBlock } from "@/components/slides/canvas/rich-text-view";
import { TABLE_CELL_INSET, colorCssOf, tableCellLook, tableGrid } from "@/lib/slides/export/render-rules";
import type { Pt, TableElement, VAlign } from "@/lib/slides/model/types";
import { blankTextJson } from "@/lib/slides/text/plain";

const V_ALIGN: Record<VAlign, CSSProperties["verticalAlign"]> = { top: "top", middle: "middle", bottom: "bottom" };

export function TableView({ el, w, h, ctx }: { el: TableElement; w: Pt; h: Pt; ctx: ElementRenderContext }) {
  const grid = tableGrid(el, w, h);
  const border = el.style.border.width > 0 ? `${el.style.border.width}px solid ${colorCssOf(el.style.border.color, ctx.theme)}` : "none";
  const [pl, pt, pr, pb] = TABLE_CELL_INSET;
  return (
    <table
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: w,
        tableLayout: "fixed",
        borderCollapse: "collapse",
        borderSpacing: 0,
      }}
    >
      <colgroup>
        {grid.colWidths.map((width, i) => (
          <col key={el.cols[i].id} style={{ width }} />
        ))}
      </colgroup>
      <tbody>
        {grid.rows.map((line, ri) => (
          <tr key={el.rows[ri].id} style={{ height: grid.rowHeights[ri] }}>
            {line.map((gc) => {
              const look = tableCellLook(el, gc);
              const editing = !ctx.decor && ctx.renderEditor && ctx.editorTargetId === `${el.id}/${gc.key}`;
              return (
                <td
                  key={gc.key}
                  data-cell-key={gc.key}
                  rowSpan={gc.rowSpan > 1 ? gc.rowSpan : undefined}
                  colSpan={gc.colSpan > 1 ? gc.colSpan : undefined}
                  style={{
                    border,
                    padding: `${pt}px ${pr}px ${pb}px ${pl}px`,
                    verticalAlign: V_ALIGN[gc.cell?.vAlign ?? "top"],
                    background: look.fill ? colorCssOf(look.fill, ctx.theme) : undefined,
                    overflow: "hidden",
                  }}
                >
                  <SlideTextBlock
                    json={gc.cell?.text ?? blankTextJson()}
                    defaults={el.style.textStyle}
                    color={look.color}
                    bold={look.bold}
                    onLinkClick={ctx.mode === "present" ? ctx.onLinkClick : undefined}
                    editor={editing && ctx.renderEditor ? ctx.renderEditor(el, gc.key) : undefined}
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
