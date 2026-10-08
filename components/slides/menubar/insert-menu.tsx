"use client";

// Insert menu (slides.md §3, §7.2): picture, text box, shape, line, arrow, table, and a new slide with a chosen
// layout. New items go on the current slide and end up selected (a text box starts in typing mode).
import { ImagePlus, Minus, MoveRight, Plus, Shapes, Table, Type } from "lucide-react";

import { MENUBAR_TRIGGER_CLASS } from "@/components/docs/menubar/doc-menubar";
import {
  DocMenu, DocMenuContent, DocMenuItem, DocMenuSeparator, DocMenuSub, DocMenuSubContent, DocMenuSubTrigger, DocMenuTrigger,
} from "@/components/docs/ui/doc-menu";
import { useSlidesFinalFocus, useSlidesSelection, useSlidesShortcutLabels } from "@/components/slides/chrome/chrome-hooks";
import { ImageSourceItems } from "@/components/slides/chrome/image-insert";
import { SHAPE_GLYPHS } from "@/components/slides/chrome/shape-picker";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { useT } from "@/lib/i18n/context";
import { SHAPE_PRESETS } from "@/lib/slides/geometry/presets";
import { DEFAULT_NEW_SLIDE_LAYOUT, LAYOUTS, LAYOUT_LABEL_KEYS } from "@/lib/slides/themes/layouts";

export function InsertMenu({ onUploadImage }: { onUploadImage(): void }) {
  const t = useT();
  const label = useSlidesShortcutLabels();
  const finalFocus = useSlidesFinalFocus();
  const { el, dispatch } = useSlidesEditor();
  const sel = useSlidesSelection();
  const readOnly = !sel.writable;
  const noSlide = readOnly || sel.slide === null;

  return (
    <DocMenu>
      <DocMenuTrigger className={MENUBAR_TRIGGER_CLASS}>{t("slides.menubar.insert")}</DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-56">
        <DocMenuSub>
          <DocMenuSubTrigger icon={ImagePlus} disabled={noSlide}>
            {t("slides.insert.image")}
          </DocMenuSubTrigger>
          <DocMenuSubContent>
            <ImageSourceItems onUpload={onUploadImage} />
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuItem icon={Type} disabled={noSlide} onClick={() => el.insertTextBox()}>
          {t("slides.insert.textBox")}
        </DocMenuItem>
        <DocMenuSub>
          <DocMenuSubTrigger icon={Shapes} disabled={noSlide}>
            {t("slides.insert.shape")}
          </DocMenuSubTrigger>
          <DocMenuSubContent className="max-h-[min(70vh,var(--available-height))]">
            {SHAPE_PRESETS.map((preset) => (
              <DocMenuItem key={preset} icon={SHAPE_GLYPHS[preset]} onClick={() => el.insertShape(preset)}>
                {t(`slides.shapes.${preset}`)}
              </DocMenuItem>
            ))}
          </DocMenuSubContent>
        </DocMenuSub>
        <DocMenuItem icon={Minus} disabled={noSlide} onClick={() => el.insertLine(false)}>
          {t("slides.insert.line")}
        </DocMenuItem>
        <DocMenuItem icon={MoveRight} disabled={noSlide} onClick={() => el.insertLine(true)}>
          {t("slides.insert.arrow")}
        </DocMenuItem>
        <DocMenuItem icon={Table} disabled={noSlide} onClick={() => dispatch({ type: "openDialog", dialog: "insertTable" })}>
          {t("slides.insert.table")}
        </DocMenuItem>
        <DocMenuSeparator />
        <DocMenuSub>
          <DocMenuSubTrigger icon={Plus} disabled={readOnly}>
            {t("slides.insert.newSlide")}
          </DocMenuSubTrigger>
          <DocMenuSubContent>
            {LAYOUTS.map((layout) => (
              <DocMenuItem key={layout} shortcut={layout === DEFAULT_NEW_SLIDE_LAYOUT ? label("newSlide") : undefined} onClick={() => el.addSlide(layout)}>
                {t(LAYOUT_LABEL_KEYS[layout])}
              </DocMenuItem>
            ))}
          </DocMenuSubContent>
        </DocMenuSub>
      </DocMenuContent>
    </DocMenu>
  );
}
