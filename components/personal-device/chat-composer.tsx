"use client";

// The /personal channel's bottom bar: the walkie-talkie (TalkBar) and the channel's text composer
// side by side on one strip. A sideways drag anywhere on the bar — the text box included — moves
// the strip under the finger, and the release settles on whichever side it was thrown toward
// (toward the inline start for the keyboard, back toward the end for the walkie). The two icons
// under the bar say which side is showing and switch on a tap. A drag that starts on the mic is a
// swipe only if it goes sideways before the mic's hold delay (PTT_HOLD_DELAY_MS) — the TalkBar
// drops that press — and is the mic's own (Delete / Send original) after it; nothing switches
// while it records.

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Keyboard, Mic } from "lucide-react";
import {
  claimReached,
  lockAxis,
  releaseVelocity,
  shouldCommit,
  type AxisLock,
  type SwipeSample,
} from "@/lib/gestures/page-swipe";
import { createClickSuppressor } from "@/lib/browser-shell/mobile/use-pill-swipe";
import { hapticLight } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { PTT_HOLD_DELAY_MS } from "@/components/device/talk-bar";

export type ComposerMode = "voice" | "text";

/** Height of the walkie bar, which the keyboard side matches. */
export const COMPOSER_BAR_PX = 120;
/** The mode icons under the bar, and the gap kept below them. */
export const COMPOSER_INDICATOR_PX = 20;
export const COMPOSER_GAP_PX = 16;
/** Everything the composer lays out under the bar (TalkBar `overlayBottom` adds it). */
export const COMPOSER_BELOW_BAR_PX = COMPOSER_INDICATOR_PX + COMPOSER_GAP_PX;
/** The TalkBar's mic: a touch there is a hold unless it goes sideways within its hold delay. */
export const PTT_MIC_SELECTOR = "[data-ptt-mic]";

/** Whether a drag that locked its axis `elapsedMs` after touching down may move the strip. */
export function swipeMayClaim(onMic: boolean, elapsedMs: number): boolean {
  return !onMic || elapsedMs < PTT_HOLD_DELAY_MS;
}
/** A dragged strip past either end gives this share of the extra travel. */
const OVERDRAG = 0.25;
const MAX_SAMPLES = 12;

/**
 * Where a drag of `dx` px puts the strip, from `base` (0 = walkie showing, `textAt` = keyboard
 * showing: minus the bar's width in LTR, plus in RTL). Past either end it moves at OVERDRAG.
 */
export function stripOffset(base: number, dx: number, textAt: number): number {
  const lo = Math.min(0, textAt);
  const hi = Math.max(0, textAt);
  const raw = base + dx;
  if (raw < lo) return lo + (raw - lo) * OVERDRAG;
  if (raw > hi) return hi + (raw - hi) * OVERDRAG;
  return raw;
}

/** The side a release settles on, from the strip's offset and the finger's speed (px/ms, signed x). */
export function modeOnRelease(mode: ComposerMode, offset: number, velocity: number, textAt: number): ComposerMode {
  if (textAt === 0) return mode;
  const toward = Math.sign(textAt);
  const progress = mode === "voice" ? offset / textAt : 1 - offset / textAt;
  const speed = (mode === "voice" ? 1 : -1) * toward * velocity;
  const other: ComposerMode = mode === "voice" ? "text" : "voice";
  return shouldCommit(progress, speed) ? other : mode;
}

interface StripDrag {
  readonly x0: number;
  readonly y0: number;
  readonly t0: number;
  /** Began on the mic (see swipeMayClaim). */
  readonly onMic: boolean;
  readonly base: number;
  axis: AxisLock;
  claimed: boolean;
  readonly samples: SwipeSample[];
}

export function ChatComposer({ mode, onModeChange, talkBar, text, recording, onTextFocus, className }: {
  mode: ComposerMode;
  onModeChange: (mode: ComposerMode) => void;
  /** The walkie: a TalkBar, whose scrim and recording drawer position against the screen, not this bar. */
  talkBar: ReactNode;
  /** The keyboard side: the channel's composer; null with no conversation open (walkie only). */
  text: ReactNode | null;
  /** A recording is live: the bar stays on the walkie. */
  recording: boolean;
  /** Something on the keyboard side took focus (the phone pages back to the messages). */
  onTextFocus?: () => void;
  className?: string;
}) {
  const { t, dir } = useI18n();
  const trackRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const textPaneRef = useRef<HTMLDivElement>(null);
  const hasText = text != null;
  const live = useRef({ mode, dir, recording, onModeChange, hasText });
  useLayoutEffect(() => { live.current = { mode, dir, recording, onModeChange, hasText }; });

  // At rest the walkie side carries no transform at all: a transformed strip would become the
  // containing block of the TalkBar's scrim and drawer, which must cover the screen above the bar.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.style.transform = mode === "text" ? `translateX(${dir === "rtl" ? 50 : -50}%)` : "";
    if (mode === "voice" && textPaneRef.current?.contains(document.activeElement)) {
      (document.activeElement as HTMLElement | null)?.blur();
    }
  }, [mode, dir]);

  useEffect(() => {
    const track = trackRef.current;
    const strip = stripRef.current;
    if (!track || !strip) return;
    let drag: StripDrag | null = null;
    const clicks = createClickSuppressor(() => performance.now());
    const textAt = () => (live.current.dir === "rtl" ? 1 : -1) * (track.clientWidth || 1);
    const settle = (next: ComposerMode) => {
      strip.style.transition = "";
      if (next !== live.current.mode) {
        hapticLight();
        live.current.onModeChange(next);
      } else {
        strip.style.transform = next === "text" ? `translateX(${live.current.dir === "rtl" ? 50 : -50}%)` : "";
      }
    };
    const cancel = () => {
      const d = drag;
      drag = null;
      clicks.release();
      if (d?.claimed) settle(live.current.mode);
    };
    const onStart = (event: TouchEvent) => {
      clicks.reset();
      drag = null;
      if (event.touches.length !== 1 || live.current.recording || !live.current.hasText) return;
      const target = event.target instanceof Element ? event.target : null;
      const touch = event.touches[0];
      drag = {
        x0: touch.clientX,
        y0: touch.clientY,
        t0: event.timeStamp,
        onMic: !!target?.closest(PTT_MIC_SELECTOR),
        base: live.current.mode === "text" ? textAt() : 0,
        axis: "pending",
        claimed: false,
        samples: [{ t: event.timeStamp, x: touch.clientX }],
      };
    };
    const onMove = (event: TouchEvent) => {
      const d = drag;
      if (!d) return;
      if (event.touches.length !== 1 || live.current.recording) { cancel(); return; }
      const touch = event.touches[0];
      const dx = touch.clientX - d.x0;
      if (d.axis === "pending") {
        d.axis = lockAxis(dx, touch.clientY - d.y0);
        if (d.axis === "pending") return;
        // Vertical, a mic press that is already a hold, or the page already took the touch (a
        // text box scrolling its lines).
        if (
          d.axis === "vertical" || !swipeMayClaim(d.onMic, event.timeStamp - d.t0) ||
          !event.cancelable || event.defaultPrevented
        ) { drag = null; return; }
      }
      event.preventDefault();
      d.samples.push({ t: event.timeStamp, x: touch.clientX });
      if (d.samples.length > MAX_SAMPLES) d.samples.shift();
      if (!d.claimed) {
        if (!claimReached(dx)) return;
        d.claimed = true;
        clicks.arm();
        strip.style.transition = "none";
      }
      strip.style.transform = `translateX(${stripOffset(d.base, dx, textAt())}px)`;
    };
    const onEnd = (event: TouchEvent) => {
      const d = drag;
      drag = null;
      clicks.release();
      if (!d?.claimed) return;
      const touch = event.changedTouches[0];
      const dx = touch ? touch.clientX - d.x0 : 0;
      if (touch) d.samples.push({ t: event.timeStamp, x: touch.clientX });
      const at = textAt();
      settle(modeOnRelease(live.current.mode, stripOffset(d.base, dx, at), releaseVelocity(d.samples), at));
    };
    // The click a claimed drag ends in never reaches the button it started on.
    const onClickCapture = (event: MouseEvent) => {
      if (!clicks.consume()) return;
      event.preventDefault();
      event.stopPropagation();
    };
    track.addEventListener("touchstart", onStart, { passive: true });
    track.addEventListener("touchmove", onMove, { passive: false });
    track.addEventListener("touchend", onEnd, { passive: true });
    track.addEventListener("touchcancel", cancel, { passive: true });
    track.addEventListener("click", onClickCapture, true);
    return () => {
      track.removeEventListener("touchstart", onStart);
      track.removeEventListener("touchmove", onMove);
      track.removeEventListener("touchend", onEnd);
      track.removeEventListener("touchcancel", cancel);
      track.removeEventListener("click", onClickCapture, true);
      strip.style.transition = "";
    };
  }, []);

  const switchTo = (next: ComposerMode) => {
    if (next === mode || recording || (next === "text" && !hasText)) return;
    hapticLight();
    onModeChange(next);
  };
  // The side not showing is held to the bar's height, so a long draft on the keyboard side never
  // makes the walkie side taller (and the bar's height is what the TalkBar's overlays assume).
  const pane = (side: ComposerMode) => cn("w-1/2 shrink-0", side !== mode && "max-h-[120px] overflow-hidden");

  return (
    <div className={cn("shrink-0 bg-background", className)}>
      {/* Not positioned: the TalkBar's scrim and drawer keep positioning against the screen. */}
      <div ref={trackRef} className="overflow-hidden" data-no-swipe>
        <div
          ref={stripRef}
          className="flex w-[200%] items-start transition-transform duration-300 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none"
        >
          <div className={pane("voice")} inert={mode !== "voice"}>
            {talkBar}
          </div>
          <div
            ref={textPaneRef}
            className={cn(pane("text"), "min-h-[120px] border-t border-border bg-background pt-2")}
            inert={mode !== "text"}
            onFocus={onTextFocus}
          >
            {text}
          </div>
        </div>
      </div>
      <div
        className={cn("flex h-5 items-center justify-center gap-1 transition-opacity", recording && "pointer-events-none opacity-0")}
        style={{ marginBottom: COMPOSER_GAP_PX }}
        role="tablist"
        aria-label={t("personalDevice.chat.inputMode")}
      >
        {([["voice", Mic, t("personalDevice.chat.modeVoice")], ["text", Keyboard, t("personalDevice.chat.modeText")]] as const).map(([m, Icon, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            aria-label={label}
            disabled={m === "text" && !hasText}
            onClick={() => switchTo(m)}
            className={cn("grid h-5 w-8 place-items-center rounded transition-colors disabled:opacity-40", mode === m ? "text-foreground" : "text-muted-foreground/50")}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
}
