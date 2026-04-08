"use client";

import { useEffect, useRef } from "react";
import {
  Copy,
  Scissors,
  ClipboardPaste,
  CopyPlus,
  ArrowUp,
  ArrowDown,
  ChevronsUp,
  ChevronsDown,
  Trash2,
  MousePointerClick,
} from "lucide-react";

type MenuItem = {
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
};

type Props = {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
};

export function CanvasContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside or escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Clamp to viewport bounds
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - items.length * 36 - 16),
    zIndex: 1000,
  };

  return (
    <div
      ref={ref}
      style={style}
      className="w-48 rounded-sm border border-border bg-background shadow-lg py-1 text-sm"
    >
      {items.map((item, i) =>
        item.label === "---" ? (
          <div key={i} className="my-1 border-t border-border" />
        ) : (
          <button
            key={i}
            onClick={() => { item.action(); onClose(); }}
            disabled={item.disabled}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors disabled:opacity-30 ${
              item.danger
                ? "text-destructive hover:bg-destructive/10"
                : "text-foreground hover:bg-muted"
            }`}
          >
            {item.icon && <span className="shrink-0 w-4 text-muted-foreground">{item.icon}</span>}
            <span className="flex-1 truncate text-[12px]">{item.label}</span>
            {item.shortcut && (
              <span className="shrink-0 text-[10px] text-muted-foreground font-mono">{item.shortcut}</span>
            )}
          </button>
        )
      )}
    </div>
  );
}

// Helper to build menu items for selected element
export function buildElementMenuItems(ops: {
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onDelete: () => void;
  hasClipboard: boolean;
}): MenuItem[] {
  const mod = navigator.platform.includes("Mac") ? "\u2318" : "Ctrl+";
  return [
    { label: "Cut", icon: <Scissors className="h-3.5 w-3.5" />, shortcut: `${mod}X`, action: ops.onCut },
    { label: "Copy", icon: <Copy className="h-3.5 w-3.5" />, shortcut: `${mod}C`, action: ops.onCopy },
    { label: "Paste", icon: <ClipboardPaste className="h-3.5 w-3.5" />, shortcut: `${mod}V`, action: ops.onPaste, disabled: !ops.hasClipboard },
    { label: "Duplicate", icon: <CopyPlus className="h-3.5 w-3.5" />, shortcut: `${mod}D`, action: ops.onDuplicate },
    { label: "---", action: () => {} },
    { label: "Bring Forward", icon: <ArrowUp className="h-3.5 w-3.5" />, shortcut: `${mod}\u2191`, action: ops.onBringForward },
    { label: "Send Backward", icon: <ArrowDown className="h-3.5 w-3.5" />, shortcut: `${mod}\u2193`, action: ops.onSendBackward },
    { label: "Bring to Front", icon: <ChevronsUp className="h-3.5 w-3.5" />, action: ops.onBringToFront },
    { label: "Send to Back", icon: <ChevronsDown className="h-3.5 w-3.5" />, action: ops.onSendToBack },
    { label: "---", action: () => {} },
    { label: "Delete", icon: <Trash2 className="h-3.5 w-3.5" />, shortcut: "Del", action: ops.onDelete, danger: true },
  ];
}

export function buildCanvasMenuItems(ops: {
  onPaste: () => void;
  hasClipboard: boolean;
}): MenuItem[] {
  const mod = navigator.platform.includes("Mac") ? "\u2318" : "Ctrl+";
  return [
    { label: "Paste", icon: <ClipboardPaste className="h-3.5 w-3.5" />, shortcut: `${mod}V`, action: ops.onPaste, disabled: !ops.hasClipboard },
  ];
}
