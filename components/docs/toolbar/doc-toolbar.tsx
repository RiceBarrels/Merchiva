"use client";

/**
 * Formatting toolbar (docs-editor-ui spec §4.6) on Base UI Toolbar (roving focus). Groups are laid out left to right
 * by fixed widths; groups that don't fit move, whole, into the ⋮ overflow popover (ResizeObserver).
 * Read-only: everything but zoom and print is disabled.
 */
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Toolbar } from "@base-ui/react/toolbar";
import {
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  MessageSquarePlus,
  MoreVertical,
  Printer,
  Redo2,
  RemoveFormatting,
  Underline,
  Undo2,
} from "lucide-react";

import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDocShortcutLabels } from "@/lib/docs/shortcut-label";
import { useT } from "@/lib/i18n/context";
import { AlignMenu } from "./align-menu";
import { ColorPicker } from "./color-picker";
import { FontFamilySelect } from "./font-family-select";
import { FontSizeControl } from "./font-size-control";
import { ImageInsertMenu } from "./image-insert";
import { LineSpacingMenu } from "./line-spacing-menu";
import { StyleSelect } from "./style-select";
import { ToolbarButton, ToolbarIconButton, ToolbarPlacementContext } from "./toolbar-button";
import { useToolbarState } from "./use-toolbar-state";
import { ZoomSelect } from "./zoom-select";

interface ToolbarGroupDef {
  readonly id: string;
  readonly width: number;
  render(): ReactNode;
}

const ICON = 30;
const SEPARATOR = 11;
const MORE = 36;
const PADDING = 16;

export function DocToolbar() {
  const t = useT();
  const label = useDocShortcutLabels();
  const { editor, editable, access, ui, actions, dispatch } = useDocEditor();
  const s = useToolbarState(editor);
  const disabled = !editable;
  const refocus = () => {
    if (editor && !editor.isDestroyed && editable) editor.commands.focus();
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect.width ?? 0);
      setWidth((prev) => (prev === next ? prev : next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const groups: ToolbarGroupDef[] = [
    {
      id: "history",
      width: ICON * 3,
      render: () => (
        <>
          <ToolbarButton icon={Undo2} label={t("docs.edit.undo")} shortcut={label("undo")} disabled={disabled || !s.canUndo} onClick={actions.undo} />
          <ToolbarButton icon={Redo2} label={t("docs.edit.redo")} shortcut={label("redo")} disabled={disabled || !s.canRedo} onClick={actions.redo} />
          <ToolbarButton icon={Printer} label={t("docs.file.print")} shortcut={label("print")} onClick={() => void actions.print()} />
        </>
      ),
    },
    { id: "zoom", width: 76, render: () => <ZoomSelect value={ui.zoom} onChange={actions.setZoom} onClosed={refocus} /> },
    { id: "style", width: 132, render: () => <StyleSelect value={s.blockStyle} onChange={actions.setBlockStyle} disabled={disabled} onClosed={refocus} /> },
    { id: "font", width: 116, render: () => <FontFamilySelect value={s.fontFamily} onChange={actions.setFontFamily} disabled={disabled} onClosed={refocus} /> },
    {
      id: "size",
      width: 96,
      render: () => <FontSizeControl value={s.fontSizePt} onChange={actions.setFontSize} onStep={actions.stepFontSize} disabled={disabled} />,
    },
    {
      id: "text",
      width: ICON * 5,
      render: () => (
        <>
          <ToolbarButton icon={Bold} label={t("docs.format.bold")} shortcut={label("bold")} active={s.bold} disabled={disabled} onClick={() => actions.toggleMark("bold")} />
          <ToolbarButton icon={Italic} label={t("docs.format.italic")} shortcut={label("italic")} active={s.italic} disabled={disabled} onClick={() => actions.toggleMark("italic")} />
          <ToolbarButton
            icon={Underline}
            label={t("docs.format.underline")}
            shortcut={label("underline")}
            active={s.underline}
            disabled={disabled}
            onClick={() => actions.toggleMark("underline")}
          />
          <ColorPicker kind="text" value={s.color} onChange={actions.setTextColor} disabled={disabled} />
          <ColorPicker kind="highlight" value={s.highlight} onChange={actions.setHighlight} disabled={disabled} />
        </>
      ),
    },
    {
      id: "insert",
      width: ICON * 3,
      render: () => (
        <>
          <ToolbarButton icon={LinkIcon} label={t("docs.insert.link")} shortcut={label("link")} active={s.link} disabled={disabled} onClick={actions.openLinkEditor} />
          <ToolbarButton icon={MessageSquarePlus} label={t("docs.comments.add")} shortcut={label("comment")} disabled={!access.canComment} onClick={actions.startComment} />
          <ImageInsertMenu disabled={disabled} onFile={actions.pickImageFile} onUrl={() => dispatch({ type: "openDialog", dialog: "imageUrl" })} />
        </>
      ),
    },
    {
      id: "paragraph",
      width: ICON * 2,
      render: () => (
        <>
          <AlignMenu value={s.align} onChange={actions.setAlign} disabled={disabled} />
          <LineSpacingMenu value={s.lineSpacing} onChange={actions.setLineSpacing} disabled={disabled} />
        </>
      ),
    },
    {
      id: "lists",
      width: ICON * 5,
      render: () => (
        <>
          <ToolbarButton icon={ListChecks} label={t("docs.insert.checklist")} shortcut={label("taskList")} active={s.taskList} disabled={disabled} onClick={() => actions.toggleList("task")} />
          <ToolbarButton icon={List} label={t("docs.format.bulletList")} shortcut={label("bulletList")} active={s.bulletList} disabled={disabled} onClick={() => actions.toggleList("bullet")} />
          <ToolbarButton
            icon={ListOrdered}
            label={t("docs.format.numberedList")}
            shortcut={label("orderedList")}
            active={s.orderedList}
            disabled={disabled}
            onClick={() => actions.toggleList("ordered")}
          />
          <ToolbarButton icon={IndentDecrease} label={t("docs.format.indentLess")} disabled={disabled} onClick={actions.outdent} />
          <ToolbarButton icon={IndentIncrease} label={t("docs.format.indentMore")} disabled={disabled} onClick={actions.indent} />
        </>
      ),
    },
    {
      id: "clear",
      width: ICON,
      render: () => <ToolbarButton icon={RemoveFormatting} label={t("docs.format.clear")} shortcut={label("clear")} disabled={disabled} onClick={actions.clearFormatting} />,
    },
  ];

  let visibleCount = groups.length;
  if (width > 0) {
    const total = groups.reduce((sum, g, i) => sum + g.width + (i > 0 ? SEPARATOR : 0), PADDING);
    if (total > width) {
      let used = PADDING + MORE;
      visibleCount = 0;
      for (let i = 0; i < groups.length; i++) {
        const next = used + groups[i].width + (i > 0 ? SEPARATOR : 0);
        if (next > width) break;
        used = next;
        visibleCount++;
      }
    }
  }
  const visible = groups.slice(0, visibleCount);
  const hidden = groups.slice(visibleCount);

  return (
    <div ref={containerRef} className="shrink-0 border-b border-border bg-background">
      <Toolbar.Root aria-label={t("docs.toolbar.label")} className="flex h-10 items-center gap-0.5 overflow-hidden px-2">
        {visible.map((group, index) => (
          <Fragment key={group.id}>
            {index > 0 && <Toolbar.Separator className="mx-1 h-5 w-px shrink-0 bg-border" />}
            <Toolbar.Group aria-label={group.id} className="flex shrink-0 items-center gap-0.5">
              {group.render()}
            </Toolbar.Group>
          </Fragment>
        ))}
        {hidden.length > 0 && (
          <Popover>
            <PopoverTrigger render={<ToolbarIconButton aria-label={t("docs.toolbar.more")} title={t("docs.toolbar.more")} className="ms-auto" />}>
              <MoreVertical className="h-4 w-4" />
            </PopoverTrigger>
            <PopoverContent align="end" className="flex max-w-[340px] flex-wrap items-center gap-1 p-1.5">
              <ToolbarPlacementContext.Provider value="overflow">
                {hidden.map((group) => (
                  <div key={group.id} className="flex items-center gap-0.5">
                    {group.render()}
                  </div>
                ))}
              </ToolbarPlacementContext.Provider>
            </PopoverContent>
          </Popover>
        )}
      </Toolbar.Root>
    </div>
  );
}
