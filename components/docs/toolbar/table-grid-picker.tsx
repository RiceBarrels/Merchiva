"use client";

/**
 * Table size picker (Insert ▸ Table): hover or use arrow keys over a 10 × 8 grid, click / Enter inserts.
 * Cells are presentational spans so the touch-size rule for buttons doesn't blow the grid up.
 */
import { useState } from "react";

import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";

export function TableGridPicker({
  onPick,
  maxRows = 8,
  maxCols = 10,
}: {
  onPick(rows: number, cols: number): void;
  maxRows?: number;
  maxCols?: number;
}) {
  const t = useT();
  const [size, setSize] = useState({ rows: 1, cols: 1 });
  const sizeLabel = fmt(t("docs.insert.tableSize"), { cols: size.cols, rows: size.rows });

  const cellFrom = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return null;
    const cell = target.closest<HTMLElement>("[data-cell]");
    if (!cell) return null;
    return { rows: Number(cell.dataset.row), cols: Number(cell.dataset.col) };
  };

  return (
    <div className="p-2">
      <div
        role="slider"
        tabIndex={0}
        aria-label={t("docs.insert.table")}
        aria-valuetext={sizeLabel}
        aria-valuemin={1}
        aria-valuemax={maxRows * maxCols}
        aria-valuenow={size.rows * size.cols}
        className="grid w-max gap-0.5 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        style={{ gridTemplateColumns: `repeat(${maxCols}, 1rem)` }}
        onPointerMove={(event) => {
          const next = cellFrom(event.target);
          if (next && (next.rows !== size.rows || next.cols !== size.cols)) setSize(next);
        }}
        onClick={(event) => {
          const picked = cellFrom(event.target);
          if (picked) onPick(picked.rows, picked.cols);
        }}
        onKeyDown={(event) => {
          const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
          let { rows, cols } = size;
          switch (event.key) {
            case "ArrowRight":
              cols += rtl ? -1 : 1;
              break;
            case "ArrowLeft":
              cols += rtl ? 1 : -1;
              break;
            case "ArrowDown":
              rows += 1;
              break;
            case "ArrowUp":
              rows -= 1;
              break;
            case "Enter":
            case " ":
              event.preventDefault();
              event.stopPropagation();
              onPick(size.rows, size.cols);
              return;
            default:
              return;
          }
          event.preventDefault();
          event.stopPropagation();
          setSize({ rows: Math.max(1, Math.min(maxRows, rows)), cols: Math.max(1, Math.min(maxCols, cols)) });
        }}
      >
        {Array.from({ length: maxRows }, (_, r) =>
          Array.from({ length: maxCols }, (_, c) => (
            <span
              key={`${r}-${c}`}
              data-cell=""
              data-row={r + 1}
              data-col={c + 1}
              className={cn(
                "block h-4 w-4 rounded-[2px] border",
                r < size.rows && c < size.cols ? "border-foreground/50 bg-foreground/15" : "border-border bg-background",
              )}
            />
          )),
        )}
      </div>
      <p className="mt-1.5 text-center font-mono text-[11px] tabular-nums text-muted-foreground" dir="ltr" aria-hidden>
        {sizeLabel}
      </p>
    </div>
  );
}
