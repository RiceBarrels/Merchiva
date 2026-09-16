"use client";

/**
 * Link bubble (docs-editor-ui spec §4.9): shown while the caret sits in a link (editable desktop editor).
 * Open · Copy · Edit · Remove.
 */
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { Copy, ExternalLink, Link2Off, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/context";
import { useDocEditor } from "./doc-editor-context";

const SAFE = /^(https?:|mailto:|tel:)/i;

export function LinkBubble({ editor }: { editor: Editor }) {
  const t = useT();
  const { actions, ui } = useDocEditor();
  const href = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      const value: unknown = ed?.getAttributes("link").href;
      return typeof value === "string" ? value : "";
    },
  });

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="docLinkBubble"
      shouldShow={({ editor: ed }) => ed.isEditable && ed.isActive("link") && ed.state.selection.empty && !ui.linkEditorOpen}
      options={{ placement: "bottom-start", offset: 6 }}
      className="z-40 flex max-w-[min(90vw,420px)] items-center gap-1 rounded-lg border border-border bg-popover px-2 py-1 text-[12.5px] text-popover-foreground shadow-md"
    >
      <a
        href={SAFE.test(href) ? href : undefined}
        target="_blank"
        rel="noopener noreferrer nofollow"
        dir="ltr"
        className="min-w-0 max-w-56 truncate text-foreground underline underline-offset-2"
      >
        {href}
      </a>
      <span aria-hidden className="mx-1 h-4 w-px bg-border" />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t("docs.link.open")}
        disabled={!SAFE.test(href)}
        onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t("docs.link.copy")}
        onClick={() => {
          navigator.clipboard
            ?.writeText(href)
            .then(() => toast.success(t("docs.link.copied")))
            .catch(() => toast.error(t("docs.errors.generic")));
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={t("docs.link.edit")} onClick={actions.openLinkEditor}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={t("docs.link.remove")} onClick={actions.unsetLink}>
        <Link2Off className="h-3.5 w-3.5" />
      </Button>
    </BubbleMenu>
  );
}
