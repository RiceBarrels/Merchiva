"use client";

import { ArrowUpDown } from "lucide-react";

import { lineSpacingLabel } from "@/components/docs/menubar/format-menu";
import { useEditorFinalFocus } from "@/components/docs/menubar/doc-menubar";
import { DocMenu, DocMenuContent, DocMenuRadioGroup, DocMenuRadioItem, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import { LINE_SPACINGS, type LineSpacing } from "@/lib/docs/fonts";
import { useT } from "@/lib/i18n/context";
import { ToolbarIconButton } from "./toolbar-button";

export function LineSpacingMenu({
  value,
  onChange,
  disabled,
}: {
  value: LineSpacing | null;
  onChange(value: LineSpacing): void;
  disabled?: boolean;
}) {
  const t = useT();
  const finalFocus = useEditorFinalFocus();
  return (
    <DocMenu>
      <DocMenuTrigger render={<ToolbarIconButton aria-label={t("docs.format.lineSpacing")} title={t("docs.format.lineSpacing")} disabled={disabled} />}>
        <ArrowUpDown className="h-4 w-4" />
      </DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus}>
        <DocMenuRadioGroup value={value ?? "1.15"} onValueChange={(next: LineSpacing) => onChange(next)}>
          {LINE_SPACINGS.map((spacing) => (
            <DocMenuRadioItem key={spacing} value={spacing}>
              {lineSpacingLabel(spacing, t)}
            </DocMenuRadioItem>
          ))}
        </DocMenuRadioGroup>
      </DocMenuContent>
    </DocMenu>
  );
}
