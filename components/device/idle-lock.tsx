"use client";

// Full-bleed dark lock screen with clock, info card and a swipe-to-unlock pill.

import { useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { ChannelChip } from "./channel-header";
import { BigClock } from "./clock-card";
import { fmtStatusClock, useNow } from "./time";

export interface IdleLockProps {
  active: boolean;
  onUnlock: () => void;
  channelName?: string;
  /** Card content rendered between the clock and the slider. */
  card?: ReactNode;
  /** Optional phone status strip (clock) at the very top. */
  showStatusStrip?: boolean;
  className?: string;
}

const KNOB = 52;
const PAD = 6;

export function IdleLock({ active, onUnlock, channelName, card, showStatusStrip, className }: IdleLockProps) {
  const t = useT();
  const now = useNow(1000);
  const pillRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ startX: number; dx: number } | null>(null);
  const [nudge, setNudge] = useState(0);
  const [travel, setTravel] = useState(240);

  const measure = () => {
    const w = pillRef.current ? pillRef.current.clientWidth - KNOB - PAD * 2 : 240;
    setTravel(w);
    return w;
  };
  const dx = drag?.dx ?? 0;
  const progress = Math.min(1, dx / Math.max(1, travel));

  const onKnobDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    measure();
    setDrag({ startX: e.clientX, dx: 0 });
  };
  const onKnobMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (!drag) return;
    const next = Math.max(0, Math.min(travel, e.clientX - drag.startX));
    setDrag({ startX: drag.startX, dx: next });
  };
  const onKnobUp = () => {
    if (!drag) return;
    const ok = drag.dx > travel * 0.8;
    setDrag(null);
    if (ok) {
      hapticSuccess();
      onUnlock();
    }
  };

  const stagger = (delay: number) => ({
    initial: { opacity: 0, y: 24 },
    animate: active ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 },
    transition: { opacity: { duration: 0.5, delay: active ? delay : 0 }, y: { duration: 0.7, delay: active ? delay : 0, ease: [0.2, 0.7, 0.2, 1] as const } },
  });

  return (
    <div
      className={cn(
        "dark fixed inset-0 z-50 grid place-items-center bg-[rgb(10_10_10)] text-[rgb(250_250_250)] transition-opacity duration-500",
        active ? "opacity-100" : "pointer-events-none opacity-0",
        className,
      )}
      style={{ colorScheme: "dark" }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest("[data-knob]")) return;
        hapticLight();
        setNudge((n) => n + 1);
      }}
    >
      {showStatusStrip && (
        <div className="absolute left-7 right-7 top-[18px] flex justify-between text-[13px] font-semibold text-[rgb(161_161_161)]">
          <span>{fmtStatusClock(now)}</span>
          <span className="font-mono font-medium">▮▮▮</span>
        </div>
      )}
      {channelName && (
        <motion.div {...stagger(0.2)} className="absolute left-4 top-14">
          <ChannelChip name={channelName} readOnly />
        </motion.div>
      )}
      <div className="flex w-full max-w-[420px] flex-col items-center gap-7 px-4">
        <motion.div {...stagger(0.3)}>
          <BigClock size="lg" />
        </motion.div>
        {card && (
          <motion.div {...stagger(0.42)} className="w-full">
            {card}
          </motion.div>
        )}
        <motion.div
          {...stagger(0.54)}
          className="w-full"
          key={`n${nudge}`}
        >
          <motion.div
            ref={pillRef}
            animate={nudge > 0 && !drag ? { x: [0, 10, -7, 4, 0] } : { x: 0 }}
            transition={{ duration: 0.5, ease: [0.36, 0.07, 0.19, 0.97] }}
            className="flex h-16 w-full touch-none items-center gap-4 rounded-full border border-[rgb(40_40_40)] bg-[rgb(38_38_38)] px-1.5 text-[16px] font-medium text-[rgb(161_161_161)]"
          >
            <span
              data-knob
              onPointerDown={onKnobDown}
              onPointerMove={onKnobMove}
              onPointerUp={onKnobUp}
              onPointerCancel={onKnobUp}
              style={{
                transform: `translateX(${dx}px)`,
                transition: drag ? "none" : "transform .25s",
              }}
              className="grid h-[52px] w-[52px] flex-none cursor-grab place-items-center rounded-full bg-[rgb(250_250_250)] text-[rgb(10_10_10)] active:cursor-grabbing"
            >
              <ChevronRight className="h-[22px] w-[22px]" strokeWidth={2.5} />
            </span>
            <span style={{ opacity: Math.max(0, 1 - progress * 1.5), transition: drag ? "none" : "opacity .2s" }}>
              {t("device.swipeToUnlock")}
            </span>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
