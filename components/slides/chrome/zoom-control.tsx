"use client";

// The toolbar's zoom menu (slides.md §7.3): fit, the preset levels, and zoom in / out. The level is a per-viewer
// preference (ui.zoom, kept in localStorage by the editor context).
import { ChevronDown, ZoomIn, ZoomOut } from "lucide-react";

import {
  DocMenu, DocMenuContent, DocMenuItem, DocMenuRadioGroup, DocMenuRadioItem, DocMenuSeparator, DocMenuTrigger,
} from "@/components/docs/ui/doc-menu";
import { useSlidesFinalFocus } from "@/components/slides/chrome/chrome-hooks";
import { ToolbarTextButton } from "@/components/slides/chrome/toolbar-parts";
import { ZOOM_PRESETS, parseZoomValue, stepZoom, zoomPercent, zoomValue } from "@/components/slides/chrome/zoom";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { useT } from "@/lib/i18n/context";
import { ZOOM_MAX, ZOOM_MIN } from "@/lib/slides/editor/ui-state";

export interface ZoomControlProps {
  zoom: number | "fit";
  onChange(zoom: number | "fit"): void;
}

/**
 * The zoom level choices (radio items + zoom in / out), for this control and View ▸ Zoom. Zooming in or out from
 * "fit" steps from the scale this editor's stage shows (refs.stageScale; null while no stage is shown).
 */
export function ZoomMenuItems({ zoom, onChange }: ZoomControlProps) {
  const t = useT();
  const { refs } = useSlidesEditor();
  const step = (dir: 1 | -1) => onChange(stepZoom(zoom, dir, zoom === "fit" ? refs.stageScale.get() : null));
  return (
    <>
      <DocMenuItem icon={ZoomIn} disabled={zoom !== "fit" && zoom >= ZOOM_MAX} onClick={() => step(1)}>
        {t("slides.view.zoomIn")}
      </DocMenuItem>
      <DocMenuItem icon={ZoomOut} disabled={zoom !== "fit" && zoom <= ZOOM_MIN} onClick={() => step(-1)}>
        {t("slides.view.zoomOut")}
      </DocMenuItem>
      <DocMenuSeparator />
      <DocMenuRadioGroup
        value={zoomValue(zoom)}
        onValueChange={(value: string) => {
          const next = parseZoomValue(value);
          if (next !== null) onChange(next);
        }}
      >
        <DocMenuRadioItem closeOnClick value="fit">{t("slides.view.zoomFit")}</DocMenuRadioItem>
        {ZOOM_PRESETS.map((level) => (
          <DocMenuRadioItem closeOnClick key={level} value={zoomValue(level)} label={zoomPercent(level)}>
            <span dir="ltr" className="font-mono tabular-nums">
              {zoomPercent(level)}
            </span>
          </DocMenuRadioItem>
        ))}
      </DocMenuRadioGroup>
    </>
  );
}

export function ZoomControl({ zoom, onChange }: ZoomControlProps) {
  const t = useT();
  const finalFocus = useSlidesFinalFocus();
  const label = t("slides.view.zoom");
  return (
    <DocMenu>
      <DocMenuTrigger render={<ToolbarTextButton title={label} className="min-w-14 justify-between" />}>
        <span className="sr-only">{label}</span>
        <span dir="ltr" className={zoom === "fit" ? undefined : "font-mono tabular-nums"}>
          {zoom === "fit" ? t("slides.view.zoomFit") : zoomPercent(zoom)}
        </span>
        <ChevronDown aria-hidden className="h-3 w-3 text-muted-foreground" />
      </DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-40">
        <ZoomMenuItems zoom={zoom} onChange={onChange} />
      </DocMenuContent>
    </DocMenu>
  );
}
