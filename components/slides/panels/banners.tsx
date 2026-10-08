"use client";

// Banners above the Slides workspace (slides.md §6.4, §7.3): access to the deck was lost after it opened (it stays
// open read-only, as in Docs), the deck is in the trash (with Restore for someone who manages it), it was saved by a
// newer version of the app (read-only until the app is updated), or the viewer can only view it. A deck that no
// longer exists is the session's full-page state, not a banner.
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { DOC_ERROR_I18N_KEYS } from "@/lib/docs/errors";
import { useT } from "@/lib/i18n/context";

export function SlidesBanners() {
  const t = useT();
  const { doc, access, deck, ui, collab, actions } = useSlidesEditor();
  const trashed = doc.trashedAt !== null;
  const tooNew = deck.schemaTooNew;
  const lost = collab.accessLost;
  // A deck in the trash has its own banner; not_found / not_published are the session's full page.
  const accessLost = lost !== null && lost !== "not_found" && lost !== "not_published" && !trashed ? lost : null;
  const viewOnly = !access.canEdit && !trashed && !tooNew && lost === null && ui.previewVersionId === null;
  if (accessLost === null && !trashed && !tooNew && !viewOnly) return null;

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-background px-3 py-2">
      {accessLost !== null && (
        <Callout tone="danger" title={t("slides.editor.accessLostTitle")} data-slides-access-lost="">
          {t(DOC_ERROR_I18N_KEYS[accessLost])}
        </Callout>
      )}
      {trashed && (
        <Callout
          tone="warning"
          action={
            access.canManage ? (
              <Button type="button" size="sm" variant="outline" onClick={() => void actions.restoreFromTrash()}>
                {t("slides.editor.restore")}
              </Button>
            ) : undefined
          }
        >
          {t("slides.editor.trashedBanner")}
        </Callout>
      )}
      {tooNew && (
        <Callout tone="warning" title={t("slides.editor.schemaTooNewTitle")}>
          {t("slides.editor.schemaTooNewDescription")}
        </Callout>
      )}
      {viewOnly && (
        <Callout tone="neutral" className="py-1.5">
          {t("slides.editor.viewOnlyBanner")}
        </Callout>
      )}
    </div>
  );
}
