"use client";

// Channel chip + dropdown menu, with a right-hand slot for a badge. A
// conversation with something new puts the notification dot on the chip's
// corner and before its name in the menu (`dots`, from useDeviceChatDots in
// ./use-device-dots.ts, where the walkie reading it also clears it).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { MerchivaLogo } from "@/components/logo";
import { NotificationDot } from "@/components/ui/notification-dot";
import { useT } from "@/lib/i18n/context";
import type { Channel } from "./types";

/** Which conversations have something new (useDeviceChatDots). */
export interface ChannelDots {
  /** Any chat row: the chip's dot. */
  readonly any: boolean;
  /** Conversation ids: the menu rows' dots. */
  readonly conversations: ReadonlySet<string>;
}

export interface ChannelHeaderProps {
  channels: Channel[];
  activeIndex: number;
  onSelect: (index: number) => void;
  right?: ReactNode;
  dots?: ChannelDots;
  /** Dark variant for the idle screen (non-interactive). */
  readOnly?: boolean;
  className?: string;
}

export function ChannelChip({
  name,
  open,
  readOnly,
  switching,
  dot,
  dotLabel,
  onClick,
}: {
  name: string;
  open?: boolean;
  readOnly?: boolean;
  switching?: boolean;
  /** A conversation has something new (top inline-end corner). */
  dot?: boolean;
  /** Screen-reader text for the dot. */
  dotLabel?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-8 items-center gap-[7px] whitespace-nowrap rounded-lg border px-2.5 text-[13px] font-medium transition-opacity duration-200",
        readOnly
          ? "cursor-default border-border bg-card text-muted-foreground"
          : "border-border bg-background text-foreground",
        switching && "opacity-30",
      )}
    >
      <MerchivaLogo size={14} />
      <span className="max-w-[180px] truncate">{name}</span>
      {!readOnly && (
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
      )}
      <NotificationDot show={!!dot} label={dotLabel} />
    </button>
  );
}

/** One conversation in the menu: the dot before the name, the active marker at the end. */
function ChannelMenuRow({ channel, active, dot, onPick }: { channel: Channel; active: boolean; dot: boolean; onPick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex h-11 w-full items-center justify-between gap-3 border-b border-border px-3 text-start text-[13px] font-medium last:border-b-0 active:bg-muted"
    >
      <span className="flex min-w-0 items-center gap-2">
        <NotificationDot show={dot} inline label={t("notify.dot.label")} />
        <span className="truncate">{channel.name}</span>
      </span>
      {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />}
    </button>
  );
}

export function ChannelHeader({ channels, activeIndex, onSelect, right, dots, readOnly, className }: ChannelHeaderProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = channels[activeIndex];
  const name = active?.name ?? t("device.noChannel");

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler, true);
    return () => document.removeEventListener("pointerdown", handler, true);
  }, [open]);

  const pick = (i: number) => {
    setOpen(false);
    if (i === activeIndex) return;
    hapticLight();
    setSwitching(true);
    setTimeout(() => {
      onSelect(i);
      setSwitching(false);
    }, 180);
  };

  return (
    <div ref={rootRef} className={cn("relative flex h-[54px] shrink-0 items-center justify-between border-b border-border bg-background px-4", className)}>
      <ChannelChip
        name={name}
        open={open}
        readOnly={readOnly || channels.length === 0}
        switching={switching}
        dot={!readOnly && !!dots?.any}
        dotLabel={t("notify.dot.label")}
        onClick={() => {
          hapticLight();
          setOpen((v) => !v);
        }}
      />
      {right}
      <AnimatePresence>
        {open && !readOnly && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute left-4 top-[50px] z-20 min-w-[220px] max-w-[calc(100%-32px)] overflow-hidden rounded-lg border border-border bg-background shadow-md"
          >
            {channels.map((c, i) => (
              <ChannelMenuRow key={c.id} channel={c} active={i === activeIndex} dot={!!dots?.conversations.has(c.id)} onPick={() => pick(i)} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
