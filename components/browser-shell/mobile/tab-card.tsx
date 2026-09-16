"use client";

import { useRef, useState } from "react";
import { Loader2, Pin, X } from "lucide-react";
import { animate, motion, useMotionValue, type PanInfo } from "motion/react";
import { useTabPresentation, type BrowserTab } from "@/lib/browser-shell";
import { CARD_EXIT, CARD_LAYOUT_SPRING, GESTURE, INSTANT } from "@/lib/browser-shell/mobile/geometry";
import { useLongPress } from "@/lib/browser-shell/mobile/use-long-press";
import { hapticLight } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import { TabPreviewArt } from "./tab-preview-art";

/** Card key used for the current page while the tab store is not ready (no real tabs yet). */
export const CURRENT_PAGE_CARD_KEY = "__current";

export interface TabCardProps {
  /** `null` renders the current page (tab store not ready). */
  tab: BrowserTab | null;
  cardKey: string;
  active: boolean;
  /** Hidden while the zoom proxy stands in for this card. */
  concealed: boolean;
  aspect: number;
  dir: "ltr" | "rtl";
  reducedMotion: boolean;
  closable: boolean;
  onOpen(card: HTMLElement): void;
  onClose(): void;
  onLongPress(): void;
}

/**
 * Overview card (mobile-safari spec §11): title row with favicon and close button over neutral
 * preview art. Tap opens, X or a swipe toward the inline-start edge closes, long-press opens the
 * tab actions sheet.
 */
export function TabCard({
  tab,
  cardKey,
  active,
  concealed,
  aspect,
  dir,
  reducedMotion,
  closable,
  onOpen,
  onClose,
  onLongPress,
}: TabCardProps) {
  const t = useT();
  const presentation = useTabPresentation(tab);
  const rootRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);
  const closingRef = useRef(false);
  const [swiped, setSwiped] = useState(false);
  const x = useMotionValue(0);
  const opacity = useMotionValue(1);
  const longPress = useLongPress(onLongPress, { disabled: tab === null });
  const Icon = presentation.icon;

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const card = rootRef.current;
    if (!card || closingRef.current) return;
    const towardStart = dir === "ltr" ? info.offset.x < 0 : info.offset.x > 0;
    const flungTowardStart = dir === "ltr" ? info.velocity.x < 0 : info.velocity.x > 0;
    const far = Math.abs(info.offset.x) > GESTURE.cardCloseFraction * card.offsetWidth;
    const fast = flungTowardStart && Math.abs(info.velocity.x) > GESTURE.cardCloseVelocity;
    if (!towardStart || !(far || fast)) return; // dragConstraints spring the card back
    closingRef.current = true;
    void hapticLight();
    const transition = reducedMotion ? INSTANT : CARD_EXIT;
    const target = (dir === "ltr" ? -1 : 1) * window.innerWidth;
    const finish = () => {
      setSwiped(true);
      onClose();
    };
    Promise.all([animate(x, target, transition), animate(opacity, 0, transition)]).then(finish, finish);
  };

  return (
    <motion.div
      ref={rootRef}
      layout="position"
      data-tab-card={cardKey}
      exit={swiped || reducedMotion ? { opacity: 0, transition: INSTANT } : { opacity: 0, scale: 0.9, transition: CARD_EXIT }}
      transition={{ layout: reducedMotion ? INSTANT : CARD_LAYOUT_SPRING }}
      drag={closable ? "x" : false}
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={dir === "ltr" ? { left: 0.9, right: 0.1 } : { left: 0.1, right: 0.9 }}
      onDragStart={() => {
        draggedRef.current = true;
      }}
      onDragEnd={handleDragEnd}
      onPointerDownCapture={() => {
        draggedRef.current = false;
      }}
      style={{ x, opacity, aspectRatio: aspect, visibility: concealed ? "hidden" : "visible" }}
      className={cn(
        "relative flex touch-pan-y flex-col overflow-hidden rounded-lg border border-border bg-background",
        active && "ring-2 ring-foreground ring-offset-2 ring-offset-muted",
      )}
      {...longPress}
    >
      <button
        type="button"
        data-tab-card-open=""
        aria-label={presentation.title}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          if (draggedRef.current) return;
          const card = rootRef.current;
          if (card) onOpen(card);
        }}
        className="absolute inset-0 z-0 rounded-lg !min-h-0 !min-w-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <div className="pointer-events-none relative flex h-[28px] shrink-0 items-center gap-1.5 border-b border-border ps-2 pe-0.5">
        {presentation.pending ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Icon className="h-3.5 w-3.5 shrink-0 text-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-foreground">{presentation.title}</span>
        {tab?.pinned && <Pin aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />}
        {closable && (
          <button
            type="button"
            aria-label={fmt(t("browserMobile.closeTabNamed"), { title: presentation.title })}
            onClick={() => {
              void hapticLight();
              onClose();
            }}
            className="pointer-events-auto relative z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded text-muted-foreground !min-h-0 !min-w-0 outline-none before:absolute before:-inset-2 before:content-[''] focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <TabPreviewArt kind={presentation.isNewTab ? "blank" : presentation.route?.previewKind ?? "list"} />
    </motion.div>
  );
}
