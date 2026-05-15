"use client";

import {
  Pencil,
  Copy,
  Scissors,
  ClipboardPaste,
  Trash2,
  ArrowUp,
  ArrowDown,
  PackageOpen,
  Square,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useT } from "@/lib/i18n/context";

export interface CanvasMenuTarget {
  selector: string;
  tag: string;
  isText: boolean;
  // Viewport coords (already translated from iframe-relative)
  x: number;
  y: number;
}

interface CanvasContextMenuProps {
  target: CanvasMenuTarget | null;
  hasClipboard: boolean;
  onClose: () => void;
  onEditText: (target: CanvasMenuTarget) => void;
  onDuplicate: (target: CanvasMenuTarget) => void;
  onCopy: (target: CanvasMenuTarget) => void;
  onCut: (target: CanvasMenuTarget) => void;
  onPaste: (target: CanvasMenuTarget) => void;
  onMoveUp: (target: CanvasMenuTarget) => void;
  onMoveDown: (target: CanvasMenuTarget) => void;
  onWrap: (target: CanvasMenuTarget) => void;
  onDelete: (target: CanvasMenuTarget) => void;
}

// Renders shadcn's ContextMenu programmatically. The right-click happens in
// the canvas iframe, so we can't wrap a normal trigger element — instead the
// parent passes us viewport coordinates and we mount a 1×1 invisible Trigger
// at those coords. The menu positioner then anchors against it.
//
// Open state is fully controlled via `target` prop: non-null = open.
export function CanvasContextMenu({
  target,
  hasClipboard,
  onClose,
  onEditText,
  onDuplicate,
  onCopy,
  onCut,
  onPaste,
  onMoveUp,
  onMoveDown,
  onWrap,
  onDelete,
}: CanvasContextMenuProps) {
  const t = useT();
  const open = target !== null;

  const wrap = (fn: (t: CanvasMenuTarget) => void) => () => {
    if (target) fn(target);
    onClose();
  };

  return (
    <ContextMenu
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      {/* Invisible anchor at the right-click coords. Base UI's positioner
          anchors content against this element's bounding rect. */}
      <ContextMenuTrigger
        // Render as a span we control; pointer-events:none so it never
        // intercepts mouse interactions with the canvas.
        render={(props) => (
          <span
            {...props}
            aria-hidden="true"
            style={{
              position: "fixed",
              left: target?.x ?? -9999,
              top: target?.y ?? -9999,
              width: 1,
              height: 1,
              pointerEvents: "none",
            }}
          />
        )}
      />
      <ContextMenuContent className="min-w-[200px]" align="start" side="right" sideOffset={2}>
        {target && (
          <ContextMenuLabel className="font-mono text-[10px] uppercase tracking-wider">
            &lt;{target.tag}&gt;
          </ContextMenuLabel>
        )}

        {target?.isText && (
          <ContextMenuItem onClick={wrap(onEditText)}>
            <Pencil />
            <span>{t("builder.canvasMenu.editText")}</span>
            <ContextMenuShortcut>T</ContextMenuShortcut>
          </ContextMenuItem>
        )}

        <ContextMenuItem onClick={wrap(onDuplicate)}>
          <Square />
          <span>{t("builder.canvasMenu.duplicate")}</span>
          <ContextMenuShortcut>⌘D</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem onClick={wrap(onCopy)}>
          <Copy />
          <span>{t("builder.canvasMenu.copy")}</span>
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem onClick={wrap(onCut)}>
          <Scissors />
          <span>{t("builder.canvasMenu.cut")}</span>
          <ContextMenuShortcut>⌘X</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem disabled={!hasClipboard} onClick={wrap(onPaste)}>
          <ClipboardPaste />
          <span>{t("builder.canvasMenu.paste")}</span>
          <ContextMenuShortcut>⌘V</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={wrap(onMoveUp)}>
          <ArrowUp />
          <span>{t("builder.canvasMenu.moveUp")}</span>
        </ContextMenuItem>

        <ContextMenuItem onClick={wrap(onMoveDown)}>
          <ArrowDown />
          <span>{t("builder.canvasMenu.moveDown")}</span>
        </ContextMenuItem>

        <ContextMenuItem onClick={wrap(onWrap)}>
          <PackageOpen />
          <span>{t("builder.canvasMenu.wrap")}</span>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem variant="destructive" onClick={wrap(onDelete)}>
          <Trash2 />
          <span>{t("builder.canvasMenu.delete")}</span>
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
