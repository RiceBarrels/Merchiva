"use client";

import { AlignCenter, AlignJustify, AlignLeft, AlignRight } from "lucide-react";

import type { AlignValue } from "@/components/docs/editor/use-doc-actions";
import { useEditorFinalFocus } from "@/components/docs/menubar/doc-menubar";
import { DocMenu, DocMenuContent, DocMenuRadioGroup, DocMenuRadioItem, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import { useDocShortcutLabels } from "@/lib/docs/shortcut-label";
import { useT } from "@/lib/i18n/context";
import { ToolbarIconButton } from "./toolbar-button";

const ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight, justify: AlignJustify } as const;

export function AlignMenu({ value, onChange, disabled }: { value: AlignValue; onChange(align: AlignValue): void; disabled?: boolean }) {
  const t = useT();
  const label = useDocShortcutLabels();
  const finalFocus = useEditorFinalFocus();
  const Icon = ICONS[value];
  const options: ReadonlyArray<{ value: AlignValue; key: string; shortcut?: string }> = [
    { value: "left", key: "docs.format.alignLeft", shortcut: label("alignLeft") },
    { value: "center", key: "docs.format.alignCenter", shortcut: label("alignCenter") },
    { value: "right", key: "docs.format.alignRight" },
    { value: "justify", key: "docs.format.alignJustify", shortcut: label("alignJustify") },
  ];
  return (
    <DocMenu>
      <DocMenuTrigger render={<ToolbarIconButton aria-label={t("docs.toolbar.align")} title={t("docs.toolbar.align")} disabled={disabled} />}>
        <Icon className="h-4 w-4" />
      </DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus}>
        <DocMenuRadioGroup value={value} onValueChange={(next: AlignValue) => onChange(next)}>
          {options.map((option) => {
            const OptionIcon = ICONS[option.value];
            return (
              <DocMenuRadioItem key={option.value} value={option.value} shortcut={option.shortcut}>
                <OptionIcon className="me-2 inline size-4 text-muted-foreground" aria-hidden />
                {t(option.key)}
              </DocMenuRadioItem>
            );
          })}
        </DocMenuRadioGroup>
      </DocMenuContent>
    </DocMenu>
  );
}
