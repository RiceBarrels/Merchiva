"use client";

/**
 * Editor banners (docs-editor-ui spec §4.4): trashed (+ Restore for managers) · access lost · schema error (+ Reload)
 * · sync errors that need attention (e.g. too large) · view only.
 */
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DOC_ERROR_I18N_KEYS } from "@/lib/docs/errors";
import type { DocErrorCode } from "@/lib/docs/types";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { useDocEditor } from "./doc-editor-context";

const BLOCKING_ERRORS: ReadonlySet<string> = new Set<DocErrorCode>(["too_large", "invalid"]);

export function DocBanners({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const { doc, access, collab, ui, actions, isMobile, previewVersionId } = useDocEditor();

  const trashed = !!doc.trashedAt;
  const accessLost = collab.accessLost;
  const syncError = collab.error && BLOCKING_ERRORS.has(collab.error.code) ? (collab.error.code as DocErrorCode) : null;
  const viewOnly = !access.canEdit && !trashed && !accessLost && !previewVersionId && !isMobile;

  if (!trashed && !accessLost && !ui.fatal && !syncError && !viewOnly) return null;

  return (
    <div className={cn("flex shrink-0 flex-col gap-2 border-b border-border bg-background", compact ? "px-3 py-2" : "px-3 py-2")}>
      {trashed && (
        <Callout
          tone="warning"
          action={
            access.canManage ? (
              <Button type="button" size="sm" variant="outline" onClick={() => void actions.restoreFromTrash()}>
                {t("docs.menu.restore")}
              </Button>
            ) : undefined
          }
        >
          {t("docs.editor.trashedBanner")}
        </Callout>
      )}
      {accessLost && !trashed && (
        <Callout tone="danger" title={t("docs.editor.accessLostTitle")}>
          {t(DOC_ERROR_I18N_KEYS[accessLost])}
        </Callout>
      )}
      {ui.fatal === "schema" && (
        <Callout
          tone="danger"
          action={
            <Button type="button" size="sm" variant="outline" onClick={() => window.location.reload()}>
              {t("docs.editor.reload")}
            </Button>
          }
        >
          {t("docs.editor.schemaError")}
        </Callout>
      )}
      {syncError && <Callout tone="danger">{t(DOC_ERROR_I18N_KEYS[syncError])}</Callout>}
      {viewOnly && (
        <Callout tone="neutral" className="py-1.5">
          {access.canComment ? t("docs.editor.commentOnlyBanner") : t("docs.editor.viewOnlyBanner")}
        </Callout>
      )}
    </div>
  );
}
