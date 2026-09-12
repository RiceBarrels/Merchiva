"use client";

// Scrollable message feed for the walkie-talkie surfaces.

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { fmtHM } from "./time";
import type { ChannelMessage } from "./types";

export interface MessageListProps {
  messages: ChannelMessage[];
  className?: string;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(d: Date, t: (k: string) => string): string {
  const now = new Date();
  if (dayKey(d) === dayKey(now)) return t("device.today");
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (dayKey(d) === dayKey(y)) return t("device.yesterday");
  return d.toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" }).toUpperCase();
}

const WAVE = [6, 12, 18, 9, 15, 7, 13];

function Pill({ children, outline }: { children: React.ReactNode; outline?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 items-center gap-1 whitespace-nowrap rounded px-[5px] text-[9.5px] font-semibold tracking-[0.04em] text-muted-foreground",
        outline ? "border border-border bg-transparent" : "bg-muted",
      )}
    >
      {children}
    </span>
  );
}

function MessageRow({ m }: { m: ChannelMessage }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const isVoice = m.attachmentType === "audio" && !m.content;
  const hasOriginal = !!m.voiceTranscript;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      onClick={() => {
        if (!hasOriginal) return;
        hapticLight();
        setOpen((v) => !v);
      }}
      className={cn(
        "flex gap-2.5 border-b border-border px-4 py-3",
        hasOriginal && "cursor-pointer",
        m.isMe && "bg-muted",
      )}
    >
      <div
        className={cn(
          "grid h-7 w-7 flex-none place-items-center rounded text-[10.5px] font-semibold",
          m.isMe || m.isMerchiva
            ? "border border-border bg-background text-foreground"
            : "bg-primary text-primary-foreground",
        )}
      >
        {m.senderInitials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center justify-between gap-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{m.isMe ? t("device.you") : m.senderName}</span>
            {hasOriginal && <Pill>AI</Pill>}
            {m.isMerchiva && <Pill outline>{t("device.merchivaName")}</Pill>}
          </span>
          <span className="font-mono text-[10.5px] font-medium normal-case tracking-normal tabular-nums">{fmtHM(m.createdAt)}</span>
        </div>
        {isVoice ? (
          <div className="mt-0.5 flex flex-col gap-1.5">
            <div className="inline-flex items-center gap-1.5 text-[13px]">
              <span className="flex h-[18px] items-center gap-[2px]">
                {WAVE.map((h, i) => (
                  <i key={i} className="w-[2px] rounded-[1px] bg-current opacity-60" style={{ height: h }} />
                ))}
              </span>
              <span className="text-muted-foreground">· {t("device.originalVoice")}</span>
            </div>
            {m.attachmentUrl && (
              <audio controls preload="none" src={m.attachmentUrl} className="h-8 w-full max-w-[280px]" onClick={(e) => e.stopPropagation()} />
            )}
          </div>
        ) : (
          <>
            <div className="text-[14px] leading-[1.45] text-foreground">{m.content}</div>
            {m.attachmentUrl && m.attachmentType === "audio" && open && (
              <audio controls preload="none" src={m.attachmentUrl} className="mt-2 h-8 w-full max-w-[280px]" onClick={(e) => e.stopPropagation()} />
            )}
            {hasOriginal && (
              <div className="mt-1.5 text-[12px] text-muted-foreground">
                {open ? `${t("device.hideOriginal")} ˅` : `${t("device.showOriginal")} ›`}
              </div>
            )}
            {hasOriginal && open && (
              <div className="mt-2 border-l-2 border-border px-2.5 py-2 text-[13px] leading-[1.45] text-muted-foreground">
                {m.voiceTranscript}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

export function MessageList({ messages, className }: MessageListProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lastId, messages.length]);

  const groups: { label: string; items: ChannelMessage[] }[] = [];
  for (const m of messages) {
    const label = dayLabel(m.createdAt, t);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(m);
    else groups.push({ label, items: [m] });
  }

  return (
    <div ref={ref} className={cn("min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}>
      {groups.length === 0 && (
        <div className="flex h-full min-h-[160px] items-center justify-center px-6 text-center text-[13px] text-muted-foreground">
          {t("device.noMessages")}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.label}>
          <div className="sticky top-0 z-[1] flex h-7 items-center justify-center border-b border-border bg-muted text-[10px] font-semibold tracking-[0.08em] text-muted-foreground">
            {g.label}
          </div>
          {g.items.map((m) => (
            <MessageRow key={m.id} m={m} />
          ))}
        </div>
      ))}
    </div>
  );
}
