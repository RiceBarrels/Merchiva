"use client";

import { ImagePlus } from "lucide-react";

import { useEditorFinalFocus } from "@/components/docs/menubar/doc-menubar";
import { DocMenu, DocMenuContent, DocMenuItem, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import { useT } from "@/lib/i18n/context";
import { ToolbarIconButton } from "./toolbar-button";

export function ImageInsertMenu({ onFile, onUrl, disabled }: { onFile(): void; onUrl(): void; disabled?: boolean }) {
  const t = useT();
  const finalFocus = useEditorFinalFocus();
  return (
    <DocMenu>
      <DocMenuTrigger render={<ToolbarIconButton aria-label={t("docs.insert.image")} title={t("docs.insert.image")} disabled={disabled} />}>
        <ImagePlus className="h-4 w-4" />
      </DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus}>
        <DocMenuItem onClick={onFile}>{t("docs.insert.imageUpload")}</DocMenuItem>
        <DocMenuItem onClick={onUrl}>{t("docs.insert.imageUrl")}</DocMenuItem>
      </DocMenuContent>
    </DocMenu>
  );
}
