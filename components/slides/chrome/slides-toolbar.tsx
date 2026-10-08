"use client";

// The Slides toolbar (slides.md §7.3): undo / redo | zoom | new slide, text box, image, shape, line, table |
// contextual text or object controls | theme and format panels. It is a Base UI Toolbar (one Tab stop, arrow keys
// between controls) whose groups move into a ⋮ popover when the row is too narrow. Buttons keep focus where it was
// on a mouse press (the stage or the text being typed in); menus and pickers hand it back when they close.
import { ChevronDown, Minus, MoveRight, Palette, Plus, Redo2, Slash, SlidersHorizontal, Table, Type, Undo2 } from "lucide-react";

import { ToolbarButton, ToolbarIconButton } from "@/components/docs/toolbar/toolbar-button";
import { DocMenu, DocMenuContent, DocMenuItem, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import { useSlidesFinalFocus, useSlidesSelection, useSlidesShortcutLabels } from "@/components/slides/chrome/chrome-hooks";
import { ImageInsertMenu, useImageFilePicker } from "@/components/slides/chrome/image-insert";
import { useShapeFormatGroups } from "@/components/slides/chrome/shape-format-controls";
import { ShapePicker } from "@/components/slides/chrome/shape-picker";
import { useTextFormatGroups } from "@/components/slides/chrome/text-format-controls";
import { OverflowToolbar, ToolbarTextButton, type ToolbarGroupDef } from "@/components/slides/chrome/toolbar-parts";
import { ZoomControl } from "@/components/slides/chrome/zoom-control";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { useT } from "@/lib/i18n/context";
import { LAYOUTS, LAYOUT_LABEL_KEYS } from "@/lib/slides/themes/layouts";

const ICON = 30;

/** "+" adds a slide with the default layout; the chevron next to it picks the layout. */
function NewSlideControl({ disabled }: { disabled: boolean }) {
  const t = useT();
  const label = useSlidesShortcutLabels();
  const finalFocus = useSlidesFinalFocus();
  const { el } = useSlidesEditor();
  return (
    <>
      <ToolbarButton icon={Plus} label={t("slides.slide.new")} shortcut={label("newSlide")} disabled={disabled} onClick={() => el.addSlide()} />
      <DocMenu>
        <DocMenuTrigger
          disabled={disabled}
          render={<ToolbarTextButton aria-label={t("slides.slide.layout")} title={t("slides.slide.layout")} className="-ms-1 w-4 px-0 text-muted-foreground" />}
        >
          <ChevronDown className="h-3 w-3" />
        </DocMenuTrigger>
        <DocMenuContent finalFocus={finalFocus} className="min-w-44">
          {LAYOUTS.map((layout) => (
            <DocMenuItem key={layout} onClick={() => el.addSlide(layout)}>
              {t(LAYOUT_LABEL_KEYS[layout])}
            </DocMenuItem>
          ))}
        </DocMenuContent>
      </DocMenu>
    </>
  );
}

function LineMenu({ disabled }: { disabled: boolean }) {
  const t = useT();
  const finalFocus = useSlidesFinalFocus();
  const { el } = useSlidesEditor();
  const label = t("slides.insert.line");
  return (
    <DocMenu>
      <DocMenuTrigger disabled={disabled} render={<ToolbarIconButton aria-label={label} title={label} />}>
        <Slash className="h-4 w-4" />
      </DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus}>
        <DocMenuItem icon={Minus} onClick={() => el.insertLine(false)}>
          {t("slides.insert.line")}
        </DocMenuItem>
        <DocMenuItem icon={MoveRight} onClick={() => el.insertLine(true)}>
          {t("slides.insert.arrow")}
        </DocMenuItem>
      </DocMenuContent>
    </DocMenu>
  );
}

export function SlidesToolbar() {
  const t = useT();
  const label = useSlidesShortcutLabels();
  const { undo, ui, dispatch, el } = useSlidesEditor();
  const sel = useSlidesSelection();
  const picker = useImageFilePicker();
  const textGroups = useTextFormatGroups(sel);
  const shapeGroups = useShapeFormatGroups(sel);
  const readOnly = !sel.writable;
  const noSlide = readOnly || sel.slide === null;
  const togglePanel = (panel: "theme" | "format") => dispatch({ type: "openPanel", panel });

  const groups: ToolbarGroupDef[] = [
    {
      id: "history",
      width: ICON * 2,
      render: () => (
        <>
          <ToolbarButton icon={Undo2} label={t("slides.edit.undo")} shortcut={label("undo")} disabled={readOnly || !undo.canUndo} onClick={undo.undo} />
          <ToolbarButton icon={Redo2} label={t("slides.edit.redo")} shortcut={label("redo")} disabled={readOnly || !undo.canRedo} onClick={undo.redo} />
        </>
      ),
    },
    { id: "zoom", width: 70, render: () => <ZoomControl zoom={ui.zoom} onChange={(zoom) => dispatch({ type: "setZoom", zoom })} /> },
    {
      id: "insert",
      width: ICON * 6 + 16,
      render: () => (
        <>
          <NewSlideControl disabled={readOnly} />
          <ToolbarButton icon={Type} label={t("slides.insert.textBox")} disabled={noSlide} onClick={() => el.insertTextBox()} />
          <ImageInsertMenu disabled={noSlide} onUpload={picker.open} />
          <ShapePicker disabled={noSlide} onPick={(preset) => el.insertShape(preset)} />
          <LineMenu disabled={noSlide} />
          <ToolbarButton icon={Table} label={t("slides.table.insert")} disabled={noSlide} onClick={() => dispatch({ type: "openDialog", dialog: "insertTable" })} />
        </>
      ),
    },
    ...textGroups,
    ...shapeGroups,
    {
      id: "panels",
      width: ICON * 2,
      render: () => (
        <>
          <ToolbarButton icon={Palette} label={t("slides.panel.theme")} active={ui.rightPanel === "theme"} onClick={() => togglePanel("theme")} />
          <ToolbarButton icon={SlidersHorizontal} label={t("slides.panel.format")} active={ui.rightPanel === "format"} onClick={() => togglePanel("format")} />
        </>
      ),
    },
  ];

  return (
    <div className="flex shrink-0 border-b border-border bg-background">
      <OverflowToolbar label={t("docs.toolbar.label")} groups={groups} />
      {picker.input}
    </div>
  );
}
