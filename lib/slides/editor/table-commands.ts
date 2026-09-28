// Table commands of the Format menu and the table toolbar (slides.md §3): rows and columns relative to the cell
// being typed in (or the table's edges when none is), header row, banding, cell colour. Each command is one op, so
// the caller runs it as one undo step.
import type * as Y from "yjs";

import { deleteElements } from "@/lib/slides/model/ops-elements";
import {
  deleteTableCols, deleteTableRows, distributeTableCols, insertTableCols, insertTableRows, setCellsFill, setTableStyle,
} from "@/lib/slides/model/ops-table";
import { parseTableCellKey, tableCellKey } from "@/lib/slides/model/sanitize-table";
import type { ColorValue, TableElement } from "@/lib/slides/model/types";

export type SlidesTableCommand =
  | "insertRowAbove"
  | "insertRowBelow"
  | "insertColumnLeft"
  | "insertColumnRight"
  | "deleteRow"
  | "deleteColumn"
  | "deleteTable"
  | "distributeColumns"
  | "toggleHeaderRow"
  | "toggleBanded"
  | { cellFill: ColorValue | null };

/**
 * Runs `cmd` on `table` (the snapshot the editor shows). `cellKey` ("rowId:colId") is the cell being typed in:
 * rows and columns are inserted next to it and deleted through it; without one, inserts go at the table's edge and
 * deletes do nothing, and a cell colour applies to every cell. A locked table is never deleted.
 */
export function runTableCommand(doc: Y.Doc, slideId: string, table: TableElement, cmd: SlidesTableCommand, cellKey?: string): void {
  const cell = cellKey ? parseTableCellKey(cellKey) : null;
  const firstRow = table.rows[0]?.id;
  const lastRow = table.rows[table.rows.length - 1]?.id;
  const firstCol = table.cols[0]?.id;
  const lastCol = table.cols[table.cols.length - 1]?.id;
  if (typeof cmd === "object") {
    const keys = cellKey && cell ? [cellKey] : table.rows.flatMap((r) => table.cols.map((c) => tableCellKey(r.id, c.id)));
    setCellsFill(doc, slideId, table.id, keys, cmd.cellFill);
    return;
  }
  switch (cmd) {
    case "insertRowAbove": {
      const ref = cell?.rowId ?? firstRow;
      if (ref) insertTableRows(doc, slideId, table.id, ref, "before");
      return;
    }
    case "insertRowBelow": {
      const ref = cell?.rowId ?? lastRow;
      if (ref) insertTableRows(doc, slideId, table.id, ref, "after");
      return;
    }
    case "insertColumnLeft": {
      const ref = cell?.colId ?? firstCol;
      if (ref) insertTableCols(doc, slideId, table.id, ref, "before");
      return;
    }
    case "insertColumnRight": {
      const ref = cell?.colId ?? lastCol;
      if (ref) insertTableCols(doc, slideId, table.id, ref, "after");
      return;
    }
    case "deleteRow":
      if (cell) deleteTableRows(doc, slideId, table.id, [cell.rowId]);
      return;
    case "deleteColumn":
      if (cell) deleteTableCols(doc, slideId, table.id, [cell.colId]);
      return;
    case "deleteTable":
      // A locked table stays, as a locked element does on Delete.
      if (!table.locked) deleteElements(doc, slideId, [table.id]);
      return;
    case "distributeColumns":
      distributeTableCols(doc, slideId, table.id);
      return;
    case "toggleHeaderRow":
      setTableStyle(doc, slideId, table.id, { headerRow: !table.style.headerRow });
      return;
    case "toggleBanded":
      setTableStyle(doc, slideId, table.id, { banded: !table.style.banded });
      return;
  }
}
