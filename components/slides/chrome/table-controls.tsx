"use client";

// Table commands (slides.md §3): rows and columns next to the cell being typed in (or at the table's edges), delete,
// even column widths, header row and banding. Shared by the toolbar's table menu and Format ▸ Table.
import { Table2 } from "lucide-react";

import { ToolbarIconButton } from "@/components/docs/toolbar/toolbar-button";
import { DocMenu, DocMenuCheckboxItem, DocMenuContent, DocMenuItem, DocMenuSeparator, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import { useSlidesFinalFocus } from "@/components/slides/chrome/chrome-hooks";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { useT } from "@/lib/i18n/context";
import type { SlidesTableCommand } from "@/lib/slides/editor/table-commands";
import type { TableElement } from "@/lib/slides/model/types";

const INSERTS: ReadonlyArray<{ cmd: SlidesTableCommand; key: string }> = [
  { cmd: "insertRowAbove", key: "slides.table.insertRowAbove" },
  { cmd: "insertRowBelow", key: "slides.table.insertRowBelow" },
  { cmd: "insertColumnLeft", key: "slides.table.insertColumnLeft" },
  { cmd: "insertColumnRight", key: "slides.table.insertColumnRight" },
];

export function TableItems({ table, disabled }: { table: TableElement; disabled: boolean }) {
  const t = useT();
  const { el, ui } = useSlidesEditor();
  // Deleting a row or column goes through the cell being typed in.
  const inCell = ui.editing?.elementId === table.id && ui.editing.cellKey !== undefined;
  const run = (cmd: SlidesTableCommand) => el.tableCommand(cmd);
  return (
    <>
      {INSERTS.map(({ cmd, key }) => (
        <DocMenuItem key={key} disabled={disabled} onClick={() => run(cmd)}>
          {t(key)}
        </DocMenuItem>
      ))}
      <DocMenuSeparator />
      <DocMenuItem disabled={disabled || !inCell || table.rows.length <= 1} onClick={() => run("deleteRow")}>
        {t("slides.table.deleteRow")}
      </DocMenuItem>
      <DocMenuItem disabled={disabled || !inCell || table.cols.length <= 1} onClick={() => run("deleteColumn")}>
        {t("slides.table.deleteColumn")}
      </DocMenuItem>
      {/* A locked table stays, as Edit ▸ Delete leaves locked elements. */}
      <DocMenuItem destructive disabled={disabled || table.locked} onClick={() => run("deleteTable")}>
        {t("slides.table.deleteTable")}
      </DocMenuItem>
      <DocMenuSeparator />
      <DocMenuItem disabled={disabled} onClick={() => run("distributeColumns")}>
        {t("slides.table.distributeColumns")}
      </DocMenuItem>
      <DocMenuCheckboxItem closeOnClick checked={table.style.headerRow} disabled={disabled} onCheckedChange={() => run("toggleHeaderRow")}>
        {t("slides.table.headerRow")}
      </DocMenuCheckboxItem>
      <DocMenuCheckboxItem closeOnClick checked={table.style.banded} disabled={disabled} onCheckedChange={() => run("toggleBanded")}>
        {t("slides.table.banded")}
      </DocMenuCheckboxItem>
    </>
  );
}

export function TableMenu({ table, disabled }: { table: TableElement; disabled: boolean }) {
  const t = useT();
  const finalFocus = useSlidesFinalFocus();
  const label = t("slides.insert.table");
  return (
    <DocMenu>
      <DocMenuTrigger render={<ToolbarIconButton aria-label={label} title={label} />}>
        <Table2 className="h-4 w-4" />
      </DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-56">
        <TableItems table={table} disabled={disabled} />
      </DocMenuContent>
    </DocMenu>
  );
}
