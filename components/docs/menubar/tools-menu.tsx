"use client";

import { WholeWord } from "lucide-react";

import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import { DocMenu, DocMenuContent, DocMenuItem, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import { useDocShortcutLabels } from "@/lib/docs/shortcut-label";
import { useT } from "@/lib/i18n/context";
import { MENUBAR_TRIGGER_CLASS, useEditorFinalFocus } from "./doc-menubar";

export function ToolsMenu() {
  const t = useT();
  const label = useDocShortcutLabels();
  const finalFocus = useEditorFinalFocus();
  const { actions, contentEditor } = useDocEditor();
  return (
    <DocMenu>
      <DocMenuTrigger className={MENUBAR_TRIGGER_CLASS}>{t("docs.menubar.tools")}</DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-56">
        <DocMenuItem icon={WholeWord} shortcut={label("wordCount")} disabled={!contentEditor} onClick={actions.openWordCount}>
          {t("docs.tools.wordCount")}
        </DocMenuItem>
      </DocMenuContent>
    </DocMenu>
  );
}
