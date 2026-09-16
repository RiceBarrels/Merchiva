"use client";

/**
 * Mobile link sheet (docs-editor-ui spec §7.4): while editing, the link form for the selection; while reading, the
 * tapped link's actions (Open · Copy · Edit).
 */
import { Copy, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";

import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import { LinkFields, readLinkSelection } from "@/components/docs/editor/link-fields";
import { useT } from "@/lib/i18n/context";
import { MobileDrawer, SheetRow } from "./mobile-drawer";

export function MobileLinkSheet({
  open,
  onOpenChange,
  tappedLink,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  tappedLink: string | null;
}) {
  const t = useT();
  const { editor, editable, canEditNow, dispatch, actions } = useDocEditor();
  const close = () => dispatch({ type: "closeMobileSheet" });
  const initial = open && editor && !editor.isDestroyed && editable ? readLinkSelection(editor) : null;

  return (
    <MobileDrawer open={open} onOpenChange={onOpenChange} title={t("docs.insert.link")}>
      {initial ? (
        <div className="px-4 pb-4">
          <LinkFields
            initialHref={initial.href}
            initialText={initial.text}
            hasLink={initial.hasLink}
            onApply={(href, text) => {
              const ok = actions.applyLink(href, text);
              if (ok) close();
              return ok;
            }}
            onRemove={() => {
              actions.unsetLink();
              close();
            }}
          />
        </div>
      ) : tappedLink ? (
        <>
          <p className="truncate px-4 pb-2 text-[13px] text-muted-foreground" dir="ltr">
            {tappedLink}
          </p>
          <SheetRow
            icon={ExternalLink}
            label={t("docs.link.open")}
            onSelect={() => {
              close();
              window.open(tappedLink, "_blank", "noopener,noreferrer");
            }}
          />
          <SheetRow
            icon={Copy}
            label={t("docs.link.copy")}
            onSelect={() => {
              close();
              navigator.clipboard
                ?.writeText(tappedLink)
                .then(() => toast.success(t("docs.link.copied")))
                .catch(() => toast.error(t("docs.errors.generic")));
            }}
          />
          {canEditNow && (
            <SheetRow
              icon={Pencil}
              label={t("docs.link.edit")}
              onSelect={() => {
                close();
                actions.enterEditing();
              }}
            />
          )}
        </>
      ) : null}
    </MobileDrawer>
  );
}
