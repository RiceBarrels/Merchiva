"use client";

// Shown while a saved version is on the grid instead of the live sheet (sheets.md §10.7): which version, Back to
// the spreadsheet, and Restore for the one editing (restoring replaces the content for everyone, so it needs the
// lease; a version of the current content is saved first).

import { useMemo } from "react";
import { History, Loader2 } from "lucide-react";

import { useSheetEditor } from "@/components/sheets/editor/sheet-editor-context";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/docs/format";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useDocumentVersions } from "@/lib/spacetimedb/hooks/useDocs";
import { cn } from "@/lib/utils";
import type { SheetVersionPreviewState } from "./sheet-version-history";

export function VersionPreviewBar({ preview }: { preview: SheetVersionPreviewState }) {
  const { t, locale } = useI18n();
  const { doc, access, editing, mobile, ui, actions } = useSheetEditor();
  const versionId = ui.previewVersionId;
  const { versions } = useDocumentVersions(doc.id, versionId !== null);
  const version = useMemo(() => versions.find((v) => v.id === versionId) ?? null, [versions, versionId]);
  if (!versionId) return null;

  const time = version ? formatDateTime(version.createdAt, locale) : "";
  const label = preview.failed ? t("sheets.versions.loadFailed") : version?.name || fmt(t("sheets.versions.previewing"), { time });

  return (
    <div
      role="status"
      className={cn("flex shrink-0 items-center gap-2 border-b border-border bg-muted px-3", mobile ? "h-11" : "h-10")}
      data-sheet-preview=""
    >
      {preview.loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      ) : (
        <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{label}</span>
      {access.canEdit && !preview.failed && (
        <Button
          type="button"
          size="xs"
          variant="outline"
          disabled={!editing || preview.loading}
          title={editing ? undefined : t("sheets.lease.viewOnlyHint")}
          onClick={() => actions.askRestore(versionId)}
        >
          {t("docs.versions.restore")}
        </Button>
      )}
      <Button type="button" size="xs" onClick={() => actions.previewVersion(null)}>
        {t("sheets.versions.back")}
      </Button>
    </div>
  );
}
