"use client";

// One entry of a lite Drive list (drive-ui §14.3): the 64px LiteRow look (kind icon tile, big name, one short
// line under it) with its own "Actions" button at the end. Holding the row for half a second opens the same
// actions, as a long press does on a phone; the tap that ends a long press does not also open the entry.

import { useEffect, useRef, type PointerEvent } from "react";
import { EllipsisVertical } from "lucide-react";
import { EntryIcon } from "@/components/drive/list/entry-icon";
import type { DriveEntry } from "@/components/drive/model/types";
import { hapticLight } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/** How long a press lasts before it counts as "show the actions". */
export const LITE_LONG_PRESS_MS = 500;
/** A finger that moves further than this is scrolling, not pressing. */
const PRESS_SLOP_PX = 10;

export interface LiteEntryRowProps {
  entry: DriveEntry;
  /** The name to show (the untitled label when the entry has none). */
  title: string;
  sub?: string;
  onOpen(): void;
  /** The actions drawer; omitted → no Actions button and no long press. */
  onMore?: () => void;
  /** Accessible name of the Actions button. */
  moreLabel: string;
  className?: string;
}

export function LiteEntryRow({ entry, title, sub, onOpen, onMore, moreLabel, className }: LiteEntryRowProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  // A press still pending when the row goes (the list changed under the finger) never opens anything.
  useEffect(() => {
    const pending = timer;
    return () => {
      if (pending.current !== null) clearTimeout(pending.current);
    };
  }, []);

  const cancelPress = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    fired.current = false;
    if (!onMore || (event.pointerType === "mouse" && event.button !== 0)) return;
    cancelPress();
    origin.current = { x: event.clientX, y: event.clientY };
    timer.current = setTimeout(() => {
      timer.current = null;
      fired.current = true;
      hapticLight();
      onMore();
    }, LITE_LONG_PRESS_MS);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const from = origin.current;
    if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > PRESS_SLOP_PX) cancelPress();
  };

  const onClick = () => {
    if (fired.current) {
      fired.current = false;
      return;
    }
    hapticLight();
    onOpen();
  };

  return (
    <div className={cn("flex min-h-16 w-full items-stretch rounded-lg border border-border bg-card", className)}>
      <button
        type="button"
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        onContextMenu={(event) => {
          if (!onMore) return;
          event.preventDefault();
          // A touch long press fires this as well as the timer: open the actions once, and not the entry after.
          const already = fired.current;
          cancelPress();
          fired.current = true;
          if (!already) onMore();
        }}
        className="flex min-w-0 flex-1 select-none items-center gap-3 rounded-s-lg px-3 py-2.5 text-start [-webkit-touch-callout:none] active:bg-muted"
      >
        <span className="grid h-10 w-10 flex-none place-items-center rounded bg-muted">
          <EntryIcon entry={entry} className="h-5 w-5 text-foreground" />
        </span>
        <span className="min-w-0 flex-1">
          <span dir="auto" className="block truncate text-[15px] font-semibold">{title}</span>
          {sub && <span dir="auto" className="block truncate text-[13px] text-muted-foreground">{sub}</span>}
        </span>
      </button>
      {onMore && (
        <button
          type="button"
          aria-label={moreLabel}
          title={moreLabel}
          onClick={() => {
            hapticLight();
            onMore();
          }}
          className="grid w-12 flex-none place-items-center rounded-e-lg border-s border-border text-muted-foreground active:bg-muted"
        >
          <EllipsisVertical className="h-5 w-5" aria-hidden />
        </button>
      )}
    </div>
  );
}
