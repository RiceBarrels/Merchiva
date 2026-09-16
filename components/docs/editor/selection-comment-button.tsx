"use client";

/**
 * Desktop "Add comment" button in the page's end margin next to a text selection (docs-editor-ui spec §4.9).
 */
import { NodeSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { MessageSquarePlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDocShortcutLabels } from "@/lib/docs/shortcut-label";
import { useI18n, useT } from "@/lib/i18n/context";
import { useDocEditor } from "./doc-editor-context";

export function SelectionCommentButton({ editor }: { editor: Editor }) {
  const t = useT();
  const { dir } = useI18n();
  const { access, ui, actions, sheetRef } = useDocEditor();
  const shortcut = useDocShortcutLabels();

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="docSelectionComment"
      updateDelay={120}
      shouldShow={({ state }) =>
        access.canComment && ui.draftQuote === null && !state.selection.empty && !(state.selection instanceof NodeSelection)
      }
      getReferencedVirtualElement={() => {
        if (editor.isDestroyed) return null;
        const sheet = sheetRef.current?.getBoundingClientRect();
        const coords = editor.view.coordsAtPos(editor.state.selection.from);
        const x = sheet ? (dir === "rtl" ? sheet.left - 44 : sheet.right + 8) : coords.left;
        return { getBoundingClientRect: () => new DOMRect(x, coords.top, 1, Math.max(1, coords.bottom - coords.top)) };
      }}
      options={{ placement: "right-start", offset: 0, flip: false, shift: false }}
      className="z-30"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="bg-background"
              aria-label={t("docs.comments.add")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={actions.startComment}
            />
          }
        >
          <MessageSquarePlus className="h-4 w-4" />
        </TooltipTrigger>
        <TooltipContent side={dir === "rtl" ? "left" : "right"}>
          {t("docs.comments.add")} <span dir="ltr" className="opacity-70">{shortcut("comment")}</span>
        </TooltipContent>
      </Tooltip>
    </BubbleMenu>
  );
}
