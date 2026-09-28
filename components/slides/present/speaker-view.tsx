"use client";

// The speaker view (slides.md §9): the current slide, the next one, the speaker notes (their text size adjustable),
// a stopwatch (pause, reset), the clock, "n of N", previous / next, black and white screen, and exit. It renders
// in the presenter's popup window (variant "window") or split inside the slideshow overlay (variant "inline").
//
// Rules for everything here, since it may live in the popup's realm: plain buttons only (no Base UI popover, menu
// or tooltip: they portal into the main document), clocks paced by the realm's own timers, no instanceof checks.
// A click on a button leaves the keyboard with the show (keepKeysWithShow): Space after Pause is still "next".
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, Pause, Play, Plus, RotateCcw, Square, SquareDashed, X } from "lucide-react";

import { RichTextView } from "@/components/slides/canvas/rich-text-view";
import { SLIDE_TEXT_CLASS } from "@/components/slides/canvas/slide-text-class";
import type { SlideViewLabels } from "@/components/slides/canvas/slide-view";
import { PresentSlide } from "@/components/slides/present/present-slide";
import { usePresenterWindow } from "@/components/slides/present/presenter-window-context";
import { PRESENT_SHOW_ATTR, keepKeysWithShow } from "@/components/slides/present/use-presenter-keys";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useDateFormat } from "@/lib/i18n/use-date-format";
import type { DeckState } from "@/lib/slides/model/deck-store";
import {
  formatElapsed, pauseTimer, resetTimer, resumeTimer, showSlideId, timerElapsed, type ShowAction, type ShowState, type ShowTimer,
} from "@/lib/slides/present/show";
import { isEmptyText } from "@/lib/slides/text/plain";
import { cn } from "@/lib/utils";

export interface SpeakerViewProps {
  deck: DeckState;
  show: ShowState;
  labels: SlideViewLabels;
  onLinkClick?: (href: string) => void;
  timer: ShowTimer;
  onTimer(timer: ShowTimer): void;
  onShow(action: ShowAction): void;
  onExit(): void;
  variant: "inline" | "window";
  /** Inline only: back to the audience view. */
  onHide?(): void;
}

const NOTES_PREFS_KEY = "merchiva:slides:presenter:v1";
const NOTES_PX = { min: 12, max: 40, step: 2, initial: 18 } as const;

function readNotesPx(): number {
  try {
    const raw: unknown = JSON.parse(window.localStorage.getItem(NOTES_PREFS_KEY) ?? "null");
    const px = raw && typeof raw === "object" ? (raw as { notesPx?: unknown }).notesPx : undefined;
    return typeof px === "number" && Number.isFinite(px) ? Math.min(NOTES_PX.max, Math.max(NOTES_PX.min, px)) : NOTES_PX.initial;
  } catch {
    return NOTES_PX.initial;
  }
}

function writeNotesPx(px: number): void {
  try {
    window.localStorage.setItem(NOTES_PREFS_KEY, JSON.stringify({ notesPx: px }));
  } catch {
    // Storage blocked: the size just isn't remembered.
  }
}

/** Epoch ms, advanced every `ms` by the realm's own timer (the popup keeps its own pace). */
function useRealmNow(win: Window, ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = win.setInterval(() => setNow(Date.now()), ms);
    return () => win.clearInterval(id);
  }, [win, ms]);
  return now;
}

function IconButton({ label, onClick, disabled, pressed, children }: { label: string; onClick(): void; disabled?: boolean; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40 aria-pressed:bg-muted aria-pressed:text-foreground"
    >
      {children}
    </button>
  );
}

const PANE_LABEL = "text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

export function SpeakerView({ deck, show, labels, onLinkClick, timer, onTimer, onShow, onExit, variant, onHide }: SpeakerViewProps) {
  const t = useT();
  const formatDate = useDateFormat();
  const win = usePresenterWindow();
  const now = useRealmNow(win, 500);
  const [notesPx, setNotesPx] = useState(readNotesPx);

  const { order, index } = show.nav;
  const currentId = showSlideId(show);
  const nextId = show.ended ? null : (order[index + 1] ?? null);
  const current = currentId ? deck.slides.get(currentId) : undefined;
  const total = order.length;
  const position = show.ended ? t("slides.present.endOfShow") : total > 0 ? fmt(t("slides.present.slideOf"), { n: index + 1, total }) : t("slides.present.noSlides");
  const paused = timer.pausedAt !== null;

  const changeNotes = (delta: number) => {
    const px = Math.min(NOTES_PX.max, Math.max(NOTES_PX.min, notesPx + delta));
    setNotesPx(px);
    writeNotesPx(px);
  };

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col bg-background text-foreground"
      data-shell-shortcuts="off"
      {...{ [PRESENT_SHOW_ATTR]: "" }}
      // Inline, the overlay around it does this (and hands focus back to itself).
      onMouseDown={variant === "window" ? (event) => keepKeysWithShow(event, null) : undefined}
    >
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        <span className="min-w-0 truncate px-1 font-mono text-[13px] tabular-nums">{position}</span>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <span className="sr-only">{t("slides.present.timer")}</span>
        <span className="font-mono text-[15px] font-medium tabular-nums" aria-live="off">
          {formatElapsed(timerElapsed(timer, now))}
        </span>
        <IconButton label={t(paused ? "slides.present.resume" : "slides.present.pause")} onClick={() => onTimer(paused ? resumeTimer(timer, Date.now()) : pauseTimer(timer, Date.now()))}>
          {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </IconButton>
        <IconButton label={t("slides.present.reset")} onClick={() => onTimer(resetTimer(timer, Date.now()))}>
          <RotateCcw className="h-4 w-4" />
        </IconButton>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <span className="sr-only">{t("slides.present.clock")}</span>
        <span className="font-mono text-[13px] tabular-nums text-muted-foreground">{formatDate(now, { hour: "numeric", minute: "2-digit" })}</span>
        <span className="flex-1" />
        <IconButton label={t("slides.present.blackScreen")} pressed={show.blank === "black"} onClick={() => onShow({ type: "blank", screen: "black" })}>
          <Square className="h-4 w-4 fill-current" />
        </IconButton>
        <IconButton label={t("slides.present.whiteScreen")} pressed={show.blank === "white"} onClick={() => onShow({ type: "blank", screen: "white" })}>
          <SquareDashed className="h-4 w-4" />
        </IconButton>
        {variant === "inline" && onHide ? (
          <button
            type="button"
            onClick={onHide}
            aria-pressed
            className="h-8 shrink-0 rounded-md px-2 text-[13px] text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("slides.present.speakerView")}
          </button>
        ) : null}
        <IconButton label={t("slides.present.exit")} onClick={onExit}>
          <X className="h-4 w-4" />
        </IconButton>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row">
        <section className="flex min-h-[40%] min-w-0 flex-[3] flex-col gap-1.5">
          <div className="relative min-h-0 flex-1 bg-black">
            {current ? (
              <PresentSlide deck={deck} slideId={current.id} labels={labels} onLinkClick={onLinkClick} />
            ) : (
              <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-white/70">{position}</p>
            )}
            {show.blank ? <div aria-hidden className={cn("absolute inset-0 opacity-80", show.blank === "black" ? "bg-black" : "bg-white")} /> : null}
          </div>
        </section>

        <aside className="flex min-h-0 min-w-0 flex-[2] flex-col gap-3">
          <div className="flex shrink-0 flex-col gap-1.5">
            <span className={PANE_LABEL}>{t("slides.present.nextSlide")}</span>
            <div className="relative aspect-video w-full max-w-72 border border-border bg-muted">
              {nextId ? (
                <PresentSlide deck={deck} slideId={nextId} labels={labels} mode="thumb" />
              ) : (
                <p className="absolute inset-0 flex items-center justify-center px-3 text-center text-xs text-muted-foreground">{t("slides.present.lastSlide")}</p>
              )}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <div className="flex items-center gap-1">
              <span className={cn(PANE_LABEL, "flex-1")}>{t("slides.present.notes")}</span>
              <IconButton label={t("slides.present.notesSmaller")} disabled={notesPx <= NOTES_PX.min} onClick={() => changeNotes(-NOTES_PX.step)}>
                <Minus className="h-4 w-4" />
              </IconButton>
              <IconButton label={t("slides.present.notesLarger")} disabled={notesPx >= NOTES_PX.max} onClick={() => changeNotes(NOTES_PX.step)}>
                <Plus className="h-4 w-4" />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto border border-border px-3 py-2" style={{ fontSize: notesPx, lineHeight: 1.45 }}>
              {current && !isEmptyText(current.notes) ? (
                <div className={SLIDE_TEXT_CLASS}>
                  <RichTextView json={current.notes} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("slides.present.noNotes")}</p>
              )}
            </div>
          </div>
        </aside>
      </div>

      <footer className="flex h-12 shrink-0 items-center justify-center gap-2 border-t border-border px-2">
        <IconButton label={t("slides.present.previous")} disabled={!show.ended && index <= 0} onClick={() => onShow({ type: "prev" })}>
          <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
        </IconButton>
        <span className="min-w-20 text-center font-mono text-[13px] tabular-nums">{total > 0 ? `${Math.min(index + 1, total)} / ${total}` : "0 / 0"}</span>
        <IconButton label={t("slides.present.next")} onClick={() => onShow({ type: "next" })}>
          <ChevronRight className="h-5 w-5 rtl:rotate-180" />
        </IconButton>
      </footer>
    </div>
  );
}
