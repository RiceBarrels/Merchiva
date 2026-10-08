"use client";

// Insert ▸ Table (slides.md §7.2, §7.3): choose the number of rows and columns, by pointing at the size grid or by
// typing them, then insert (el.insertTable, one undo step). Opens at 3 × 3 every time. The grid is a pointer shortcut;
// the two number fields and the Insert button are the keyboard path.
import { useId, useState } from "react";

import { DialogActions } from "@/components/ui/dialog-actions";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/lib/i18n/context";
import { SLIDES_MAX_TABLE_COLS, SLIDES_MAX_TABLE_ROWS } from "@/lib/slides/constants";
import { cn } from "@/lib/utils";

const DEFAULT_SIZE = 3;
/** The size grid shows this many columns and rows. */
const GRID_COLS = 10;
const GRID_ROWS = 8;

export interface InsertTableDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  onSubmit(rows: number, cols: number): void;
}

/** A whole number in [1, max], or null. */
function parseCount(text: string, max: number): number | null {
  const n = Number.parseInt(text.trim(), 10);
  return Number.isFinite(n) && n >= 1 && n <= max ? n : null;
}

export function InsertTableDialog({ open, onOpenChange, onSubmit }: InsertTableDialogProps): React.JSX.Element {
  const t = useT();
  const rowsId = useId();
  const colsId = useId();
  const [rows, setRows] = useState(String(DEFAULT_SIZE));
  const [cols, setCols] = useState(String(DEFAULT_SIZE));
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRows(String(DEFAULT_SIZE));
      setCols(String(DEFAULT_SIZE));
      setHover(null);
    }
  }

  const r = parseCount(rows, SLIDES_MAX_TABLE_ROWS);
  const c = parseCount(cols, SLIDES_MAX_TABLE_COLS);
  const shown = hover ?? (r !== null && c !== null ? { r, c } : null);

  const insert = (nRows: number, nCols: number) => {
    onSubmit(nRows, nCols);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={(next) => onOpenChange(next)}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("slides.table.insert")}</SheetTitle>
        </SheetHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (r !== null && c !== null) insert(r, c);
          }}
        >
          <div
            aria-hidden
            className="grid w-fit gap-[3px]"
            style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 18px)` }}
            onPointerLeave={() => setHover(null)}
          >
            {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) => {
              const cellRow = Math.floor(i / GRID_COLS) + 1;
              const cellCol = (i % GRID_COLS) + 1;
              const on = shown !== null && cellRow <= shown.r && cellCol <= shown.c;
              return (
                <button
                  key={i}
                  type="button"
                  tabIndex={-1}
                  onPointerEnter={() => setHover({ r: cellRow, c: cellCol })}
                  onClick={() => insert(cellRow, cellCol)}
                  className={cn("h-[18px] w-[18px] rounded-[2px] border", on ? "border-foreground/60 bg-muted-foreground/30" : "border-border bg-background")}
                />
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("slides.table.rows")} htmlFor={rowsId}>
              <Input
                id={rowsId}
                type="number"
                inputMode="numeric"
                min={1}
                max={SLIDES_MAX_TABLE_ROWS}
                value={rows}
                autoFocus
                aria-invalid={r === null || undefined}
                onChange={(event) => setRows(event.target.value)}
                className="font-mono tabular-nums"
              />
            </Field>
            <Field label={t("slides.table.columns")} htmlFor={colsId}>
              <Input
                id={colsId}
                type="number"
                inputMode="numeric"
                min={1}
                max={SLIDES_MAX_TABLE_COLS}
                value={cols}
                aria-invalid={c === null || undefined}
                onChange={(event) => setCols(event.target.value)}
                className="font-mono tabular-nums"
              />
            </Field>
          </div>
          <DialogActions onCancel={() => onOpenChange(false)} confirmType="submit" disabled={r === null || c === null} confirmLabel={t("slides.table.insert")} />
        </form>
      </SheetContent>
    </Sheet>
  );
}
