"use client";

// Responses ▸ Export: .csv (formula-injection safe, lib/forms/export.ts — never lib/export.ts downloadCSV), .xlsx
// (the Sheets file IO, loaded on click), and "Open as spreadsheet" — a new sheet in the builder's My files — only
// when the Sheets plugin is installed. Every cell comes from buildResponseTable, so option ids show as labels.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, FileText, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/loaders/geometric";
import { isEditorInstalled } from "@/lib/device-apps";
import { DRIVE_GENERIC_ERROR_KEY, driveErrorKey } from "@/lib/drive/errors";
import { sheetHref } from "@/lib/drive/hrefs";
import { saveBlob } from "@/lib/docs/download";
import { buildResponseTable, responseTableToCsv } from "@/lib/forms/export";
import type { FormDefinitionV1, FormResponseView } from "@/lib/forms/types";
import { useI18n } from "@/lib/i18n/context";
import { useDeviceApps } from "@/lib/spacetimedb/hooks/useDeviceApps";

type ExportKind = "csv" | "xlsx" | "sheet";

/** A download name from the form title: no path or control characters, never empty. */
export function exportBaseName(title: string, fallback: string): string {
  const clean = title.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return clean || fallback;
}

export function ResponsesExportMenu({ definition, title, organizationId, responses, onError }: {
  definition: FormDefinitionV1;
  title: string;
  organizationId: string;
  responses: readonly FormResponseView[];
  /** An already translated failure. */
  onError: (message: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { installed } = useDeviceApps();
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const sheetsOn = isEditorInstalled("sheet", installed);
  const name = exportBaseName(title, t("forms.responses.fileName"));

  const run = async (kind: ExportKind) => {
    setBusy(kind);
    onError(null);
    try {
      if (kind === "csv") {
        const csv = responseTableToCsv(buildResponseTable(definition, responses, { t }));
        await saveBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${name}.csv`);
        return;
      }
      const [{ responseTableWorkbook }, { univerLocaleOf }] = await Promise.all([
        import("@/components/forms/responses/response-workbook"),
        import("@/lib/sheets/create"),
      ]);
      const wb = responseTableWorkbook(buildResponseTable(definition, responses, { t }), {
        name, sheetName: t("forms.responses.sheetName"), locale: univerLocaleOf(locale),
      });
      if (kind === "xlsx") {
        const { writeXlsx } = await import("@/lib/sheets/xlsx/client");
        const { blob } = await writeXlsx(wb);
        await saveBlob(blob, `${name}.xlsx`);
        return;
      }
      const { createSheetFromWorkbook, SHEET_IMPORT_TEMPLATE_ID } = await import("@/lib/sheets/create");
      const id = await createSheetFromWorkbook(
        wb,
        { organizationId, space: "my", folderId: "", actingMemberId: "" },
        { templateId: SHEET_IMPORT_TEMPLATE_ID, title: name },
      );
      router.push(sheetHref(id, { isNew: true }));
    } catch (err) {
      const key = driveErrorKey(err);
      onError(t(key.startsWith("drive.") && key !== DRIVE_GENERIC_ERROR_KEY ? key : "forms.responses.exportFailed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1.5" disabled={busy !== null || responses.length === 0} />}>
        {busy ? <Spinner size={14} /> : <Download className="h-4 w-4" />}
        {t("forms.responses.export")}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void run("csv")}>
          <FileText className="h-4 w-4" />
          {t("forms.responses.exportCsv")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void run("xlsx")}>
          <FileSpreadsheet className="h-4 w-4" />
          {t("forms.responses.exportXlsx")}
        </DropdownMenuItem>
        {sheetsOn && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void run("sheet")}>
              <Table2 className="h-4 w-4" />
              {t("forms.responses.openAsSheet")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
