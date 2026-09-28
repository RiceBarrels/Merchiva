"use client";

// Font family menu of the Slides toolbar (slides.md §6.1, §7.3). The deck theme's heading and body fonts come first
// and are stored as `theme:heading` / `theme:body`, so text set in them follows a theme change; then the common
// families of ./fonts.ts, and the text's own font when it is none of these (an imported deck's font is document
// data, shown by its name).
import { ChevronDown } from "lucide-react";

import {
  DocMenu, DocMenuContent, DocMenuGroup, DocMenuLabel, DocMenuRadioGroup, DocMenuRadioItem, DocMenuSeparator, DocMenuTrigger,
} from "@/components/docs/ui/doc-menu";
import { useSlidesFinalFocus } from "@/components/slides/chrome/chrome-hooks";
import { SLIDES_FONTS, fontLabel, matchSlidesFont } from "@/components/slides/chrome/fonts";
import { ToolbarTextButton } from "@/components/slides/chrome/toolbar-parts";
import { firstFontFamily } from "@/lib/docs/fonts";
import { useT } from "@/lib/i18n/context";
import { safeFontCss } from "@/lib/slides/model/safe-values";
import type { ThemeSpec } from "@/lib/slides/model/types";

export interface FontMenuProps {
  /** The stored font of the text (FontRef). */
  value: string;
  theme: ThemeSpec;
  disabled?: boolean;
  onChange(font: string): void;
}

export function FontMenu({ value, theme, disabled, onChange }: FontMenuProps) {
  const t = useT();
  const finalFocus = useSlidesFinalFocus();
  const matched = matchSlidesFont(value);
  const own = matched === null && safeFontCss(value) !== null ? value : null;
  const label = t("slides.format.font");
  return (
    <DocMenu>
      <DocMenuTrigger disabled={disabled} render={<ToolbarTextButton title={label} className="w-28 justify-between" />}>
        <span className="sr-only">{label}</span>
        <span className="truncate">{fontLabel(value, t)}</span>
        <ChevronDown aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
      </DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-52">
        <DocMenuRadioGroup value={matched ?? own ?? ""} onValueChange={(next: string) => onChange(next)}>
          <DocMenuGroup>
            <DocMenuLabel>{t("slides.format.themeFonts")}</DocMenuLabel>
            {(["heading", "body"] as const).map((role) => (
              <DocMenuRadioItem closeOnClick key={role} value={`theme:${role}`} label={fontLabel(`theme:${role}`, t)}>
                <span className="flex min-w-0 items-baseline gap-2">
                  <span style={{ fontFamily: theme.fonts[role] }}>{fontLabel(`theme:${role}`, t)}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{firstFontFamily(theme.fonts[role])}</span>
                </span>
              </DocMenuRadioItem>
            ))}
          </DocMenuGroup>
          <DocMenuSeparator />
          {SLIDES_FONTS.map((font) => (
            <DocMenuRadioItem closeOnClick key={font.css} value={font.css} label={font.label}>
              <span style={{ fontFamily: font.css }}>{font.label}</span>
            </DocMenuRadioItem>
          ))}
          {own && (
            <DocMenuRadioItem closeOnClick value={own} label={fontLabel(own, t)}>
              <span style={{ fontFamily: own }}>{fontLabel(own, t)}</span>
            </DocMenuRadioItem>
          )}
        </DocMenuRadioGroup>
      </DocMenuContent>
    </DocMenu>
  );
}
