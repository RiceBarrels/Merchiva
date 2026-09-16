"use client";

import { Maximize2, ZoomIn } from "lucide-react";

import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import {
  DocMenu,
  DocMenuCheckboxItem,
  DocMenuContent,
  DocMenuItem,
  DocMenuRadioGroup,
  DocMenuRadioItem,
  DocMenuSeparator,
  DocMenuSub,
  DocMenuSubContent,
  DocMenuSubTrigger,
  DocMenuTrigger,
} from "@/components/docs/ui/doc-menu";
import { ZOOM_LEVELS } from "@/lib/docs/fonts";
import { useT } from "@/lib/i18n/context";
import { MENUBAR_TRIGGER_CLASS, useEditorFinalFocus } from "./doc-menubar";

export function ViewMenu() {
  const t = useT();
  const finalFocus = useEditorFinalFocus();
  const { ui, actions } = useDocEditor();

  return (
    <DocMenu>
      <DocMenuTrigger className={MENUBAR_TRIGGER_CLASS}>{t("docs.menubar.view")}</DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-56">
        <DocMenuCheckboxItem checked={ui.outlineOpen} onCheckedChange={() => actions.toggleOutline()}>
          {t("docs.view.outline")}
        </DocMenuCheckboxItem>
        <DocMenuCheckboxItem checked={ui.rightPanel === "comments"} onCheckedChange={() => actions.toggleComments()}>
          {t("docs.view.comments")}
        </DocMenuCheckboxItem>
        <DocMenuCheckboxItem checked={ui.showWordCount} onCheckedChange={(checked) => actions.setShowWordCount(checked)}>
          {t("docs.view.wordCount")}
        </DocMenuCheckboxItem>
        <DocMenuCheckboxItem checked={ui.showRuler} onCheckedChange={(checked) => actions.setShowRuler(checked)}>
          {t("docs.view.ruler")}
        </DocMenuCheckboxItem>
        <DocMenuSeparator />
        <DocMenuSub>
          <DocMenuSubTrigger icon={ZoomIn}>{t("docs.view.zoom")}</DocMenuSubTrigger>
          <DocMenuSubContent>
            <DocMenuRadioGroup
              value={String(ui.zoom)}
              onValueChange={(value: string) => actions.setZoom(value === "fit" ? "fit" : Number(value))}
            >
              {ZOOM_LEVELS.map((level) => (
                <DocMenuRadioItem key={level} value={String(level)}>
                  <span dir="ltr" className="font-mono tabular-nums">
                    {level}%
                  </span>
                </DocMenuRadioItem>
              ))}
              <DocMenuRadioItem value="fit">{t("docs.view.zoomFit")}</DocMenuRadioItem>
            </DocMenuRadioGroup>
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuItem icon={Maximize2} onClick={actions.toggleFullScreen}>
          {ui.fullScreen ? t("docs.view.exitFullScreen") : t("docs.view.fullScreen")}
        </DocMenuItem>
      </DocMenuContent>
    </DocMenu>
  );
}
