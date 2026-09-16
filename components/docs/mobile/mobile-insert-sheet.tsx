"use client";

/** Mobile Insert sheet and the table size / table commands sheet (docs-editor-ui spec §7.3). */
import { useState } from "react";
import {
  CalendarDays,
  Image as ImageIcon,
  ImagePlus,
  Link as LinkIcon,
  ListChecks,
  MessageSquarePlus,
  Minus,
  Plus,
  SeparatorHorizontal,
  Table as TableIcon,
} from "lucide-react";

import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import type { TableCommand } from "@/components/docs/editor/use-doc-actions";
import { useToolbarState } from "@/components/docs/toolbar/use-toolbar-state";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
import { MobileDrawer, SheetDivider, SheetRow } from "./mobile-drawer";

export function MobileInsertSheet({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const t = useT();
  const { access, dispatch, actions, editable } = useDocEditor();
  const run = (fn: () => void) => () => {
    dispatch({ type: "closeMobileSheet" });
    fn();
  };

  return (
    <MobileDrawer open={open} onOpenChange={onOpenChange} title={t("docs.mobile.insert")}>
      <SheetRow icon={ImagePlus} label={t("docs.insert.imageUpload")} disabled={!editable} onSelect={run(actions.pickImageFile)} />
      <SheetRow icon={ImageIcon} label={t("docs.insert.imageUrl")} disabled={!editable} onSelect={run(() => dispatch({ type: "openDialog", dialog: "imageUrl" }))} />
      <SheetRow icon={TableIcon} label={t("docs.insert.table")} chevron disabled={!editable} onSelect={() => dispatch({ type: "openMobileSheet", sheet: "table" })} />
      <SheetRow icon={LinkIcon} label={t("docs.insert.link")} chevron disabled={!editable} onSelect={() => dispatch({ type: "openMobileSheet", sheet: "link" })} />
      <SheetRow icon={Minus} label={t("docs.insert.horizontalLine")} disabled={!editable} onSelect={run(actions.insertHorizontalRule)} />
      <SheetRow icon={SeparatorHorizontal} label={t("docs.insert.pageBreak")} disabled={!editable} onSelect={run(actions.insertPageBreak)} />
      <SheetRow icon={ListChecks} label={t("docs.insert.checklist")} disabled={!editable} onSelect={run(() => actions.toggleList("task"))} />
      <SheetRow icon={CalendarDays} label={t("docs.insert.date")} disabled={!editable} onSelect={run(() => dispatch({ type: "openDialog", dialog: "insertDate" }))} />
      <SheetDivider />
      <SheetRow icon={MessageSquarePlus} label={t("docs.insert.comment")} disabled={!access.canComment} onSelect={run(actions.startComment)} />
    </MobileDrawer>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange(value: number): void }) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[15px] text-foreground">{label}</span>
      <div className="flex items-center gap-2" dir="ltr">
        <Button type="button" variant="outline" size="icon" aria-label={`${label} −`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-8 text-center font-mono text-[15px] tabular-nums" aria-live="polite">
          {value}
        </span>
        <Button type="button" variant="outline" size="icon" aria-label={`${label} +`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <span className="sr-only">{t("docs.insert.table")}</span>
    </div>
  );
}

export function MobileTableSheet({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const t = useT();
  const { editor, dispatch, actions } = useDocEditor();
  const s = useToolbarState(editor);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const table = (command: TableCommand) => () => {
    dispatch({ type: "closeMobileSheet" });
    actions.tableCommand(command);
  };

  return (
    <MobileDrawer open={open} onOpenChange={onOpenChange} title={t("docs.insert.table")}>
      <div className="grid gap-3 px-4 pb-3">
        <Stepper label={t("docs.table.rows")} value={rows} min={1} max={20} onChange={setRows} />
        <Stepper label={t("docs.table.columns")} value={cols} min={1} max={10} onChange={setCols} />
        <Button
          type="button"
          onClick={() => {
            dispatch({ type: "closeMobileSheet" });
            actions.insertTable(rows, cols);
          }}
        >
          {t("docs.insert.insertButton")}
        </Button>
      </div>
      {s.inTable && (
        <>
          <SheetDivider />
          <SheetRow icon={TableIcon} label={t("docs.table.rowAbove")} onSelect={table("addRowBefore")} />
          <SheetRow icon={TableIcon} label={t("docs.table.rowBelow")} onSelect={table("addRowAfter")} />
          <SheetRow icon={TableIcon} label={t("docs.table.colLeft")} onSelect={table("addColumnBefore")} />
          <SheetRow icon={TableIcon} label={t("docs.table.colRight")} onSelect={table("addColumnAfter")} />
          <SheetRow icon={TableIcon} label={t("docs.table.deleteRow")} onSelect={table("deleteRow")} />
          <SheetRow icon={TableIcon} label={t("docs.table.deleteCol")} onSelect={table("deleteColumn")} />
          <SheetRow icon={TableIcon} label={t("docs.table.headerRow")} onSelect={table("toggleHeaderRow")} />
          <SheetRow icon={TableIcon} label={t("docs.table.deleteTable")} destructive onSelect={table("deleteTable")} />
        </>
      )}
    </MobileDrawer>
  );
}
