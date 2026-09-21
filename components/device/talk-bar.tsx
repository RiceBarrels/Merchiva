"use client";

// Bottom talk bar: [left pill action] [mic: hold to talk] [channel ▲▼], plus
// the recording scrim + drawer with Delete / Send original hot targets.

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Mic, Trash2, Volume2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { hapticLight, hapticMedium, hapticSuccess } from "@/lib/haptics";
import { MerchivaLogo } from "@/components/logo";
import { useT } from "@/lib/i18n/context";
import { usePushToTalk } from "./use-push-to-talk";
import { fmtMMSS } from "./time";
import type { PttResult } from "./types";

export interface TalkBarProps {
  /** Left pill (Log out / Leave). Always tappable — `disabled` below only
   *  affects the mic and the channel switch, so a user with no channels can
   *  still log out. */
  leftAction: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean };
  channelLabel: string;
  onPrevChannel: () => void;
  onNextChannel: () => void;
  /** Called after release with the chosen mode; the bar shows a toast from the
   *  resolved string (if any). */
  onSend: (result: PttResult) => Promise<string | void>;
  disabled?: boolean;
  className?: string;
  /** Additive: lets the page pause idle timers while recording. */
  onRecordingChange?: (recording: boolean) => void;
}

type Hot = "delete" | "original" | null;

const WAVE = [6, 14, 22, 10, 18, 8, 16, 24, 10, 14];

export function TalkBar({
  leftAction,
  channelLabel,
  onPrevChannel,
  onNextChannel,
  onSend,
  disabled,
  className,
  onRecordingChange,
}: TalkBarProps) {
  const t = useT();
  const ptt = usePushToTalk();
  const [hot, setHot] = useState<Hot>(null);
  const [sending, setSending] = useState(false);
  /** True between pointerdown and pointerup, regardless of render timing. */
  const pressed = useRef(false);
  const activePointer = useRef<number | null>(null);
  const LeftIcon = leftAction.icon;
  const rec = ptt.recording;

  useEffect(() => {
    onRecordingChange?.(rec);
  }, [rec, onRecordingChange]);

  useEffect(() => {
    if (ptt.error) {
      toast.error(ptt.error === "denied" ? t("device.micDenied") : ptt.error === "unsupported" ? t("device.micUnsupported") : ptt.error);
    }
  }, [ptt.error, t]);

  const onMicDown = async (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || sending || rec) return;
    e.preventDefault();
    activePointer.current = e.pointerId;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    setHot(null);
    hapticMedium();
    // A ref, not `rec`: ptt.start() awaits getUserMedia, which takes hundreds
    // of ms and blocks on the permission prompt the first time. A pointerup in
    // that window used to hit `finish()` while `rec` was still false, so it
    // returned and the recorder was left running with no release pending —
    // the scrim stayed up, the shared tablet stopped auto-logging-out, and the
    // next tap sent the whole accidental recording to the channel.
    pressed.current = true;
    await ptt.start();
    if (!pressed.current) {
      // Released before the mic opened — throw the recording away.
      await ptt.stop("delete");
    }
  };

  const onMicMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!rec) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el?.closest<HTMLElement>("[data-ptt-hot]");
    const next = (target?.dataset.pttHot as Hot | undefined) ?? null;
    if (next !== hot) {
      if (next) hapticLight();
      setHot(next);
    }
  };

  const finish = useCallback(async () => {
    pressed.current = false;
    // `rec` can still be false here when the release beat getUserMedia;
    // onMicDown sees `pressed` cleared and discards the recording itself.
    if (!rec) return;
    const mode: PttResult["mode"] = hot === "delete" ? "delete" : hot === "original" ? "original" : "summary";
    setHot(null);
    const result = await ptt.stop(mode);
    if (!result) return;
    if (mode === "delete") {
      const msg = await onSend(result).catch(() => undefined);
      toast(msg || t("device.toastDeleted"));
      return;
    }
    setSending(true);
    try {
      const msg = await onSend(result);
      hapticSuccess();
      if (msg) toast(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("device.toastSendFailed"));
    } finally {
      setSending(false);
    }
  }, [rec, hot, ptt, onSend, t]);

  const caption = !rec
    ? sending
      ? t("device.sending")
      : t("device.holdToTalk")
    : hot === "delete"
      ? t("device.releaseToDelete")
      : hot === "original"
        ? t("device.releaseToSendVoice")
        : t("device.releaseToSend");

  return (
    <>
      {/* Scrim over the content above the bar while recording */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 bottom-[120px] z-[6] bg-black/10 backdrop-blur-[2px] transition-opacity duration-200",
          rec ? "opacity-100" : "opacity-0",
        )}
      />
      {/* Recording drawer. Slides down behind the bar when idle and goes
          `invisible` once the slide finishes (visibility transitions keep it
          shown for the whole duration), so it never peeks out when the bar is
          narrower than its positioned ancestor (tablet two-column layouts). */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-[120px] z-[7] border-t border-border bg-background px-4 pb-4 transition-[transform,visibility] duration-250 ease-[cubic-bezier(.2,.7,.2,1)]",
          rec ? "translate-y-0" : "invisible translate-y-[110%]",
        )}
      >
        <div className="mx-auto mb-2.5 mt-2 h-1 w-9 rounded-full bg-border" />
        <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t("device.recording")} · <span className="font-mono tabular-nums">{fmtMMSS(ptt.elapsedSec)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div
            data-ptt-hot="delete"
            className={cn(
              "inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-destructive/10 text-[14px] font-medium text-destructive transition-[transform,background-color,color] duration-150",
              hot === "delete" && "scale-[1.04] bg-destructive text-white",
            )}
          >
            <Trash2 className="h-4 w-4" />
            {t("device.delete")}
          </div>
          <div
            data-ptt-hot="original"
            className={cn(
              "inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-background text-[14px] font-medium transition-[transform,background-color] duration-150",
              hot === "original" && "scale-[1.04] bg-muted",
            )}
          >
            <Volume2 className="h-4 w-4" />
            {t("device.sendOriginal")}
          </div>
        </div>
      </div>

      {/* Bar */}
      <div
        className={cn(
          "relative z-[8] grid h-[120px] grid-cols-3 items-start justify-items-center border-t border-border bg-background pt-3.5",
          className,
        )}
      >
        {/* Left: waveform while recording, otherwise the pill action */}
        <div className="relative flex flex-col items-center gap-2">
          {rec ? (
            <div className="flex h-16 items-center gap-[2px]">
              {WAVE.map((h, i) => (
                <i
                  key={i}
                  className="w-[2px] animate-[device-wave_1s_ease-in-out_infinite_alternate] rounded-[1px] bg-destructive"
                  style={{ height: h, animationDelay: `${(i % 3) * 0.15}s` }}
                />
              ))}
            </div>
          ) : (
            <button
              type="button"
              disabled={leftAction.disabled}
              onClick={() => {
                hapticLight();
                leftAction.onClick();
              }}
              className="flex flex-col items-center gap-2 disabled:opacity-40"
            >
              <span className="grid h-16 w-16 place-items-center rounded-lg border border-border bg-background text-foreground active:bg-muted">
                <LeftIcon className="h-[22px] w-[22px]" />
              </span>
              <span className="text-[10.5px] font-medium leading-none text-muted-foreground">{leftAction.label}</span>
            </button>
          )}
        </div>

        {/* Mic */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            disabled={disabled || sending}
            onPointerDown={onMicDown}
            onPointerMove={onMicMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onContextMenu={(e) => e.preventDefault()}
            className={cn(
              "grid h-16 w-16 touch-none select-none place-items-center rounded-full transition-[transform,background-color] duration-150 disabled:opacity-60",
              rec ? "scale-[1.06] bg-destructive text-white" : "bg-primary text-primary-foreground",
            )}
            aria-label={t("device.holdToTalk")}
          >
            {rec ? <MerchivaLogo size={26} fg="#ffffff" /> : <Mic className="h-6 w-6" />}
          </button>
          <span className="text-[10.5px] font-medium leading-none text-muted-foreground">{caption}</span>
        </div>

        {/* Channel switch */}
        <div className={cn("flex flex-col items-center gap-2 transition-opacity duration-200", rec && "pointer-events-none opacity-0")}>
          <div className="flex flex-col">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                hapticLight();
                onPrevChannel();
              }}
              className="grid h-8 w-16 place-items-center rounded-t-lg border border-border bg-background text-foreground active:bg-muted"
              aria-label={t("device.prevChannel")}
            >
              <ChevronUp className="h-5 w-5" />
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                hapticLight();
                onNextChannel();
              }}
              className="-mt-px grid h-8 w-16 place-items-center rounded-b-lg border border-border bg-background text-foreground active:bg-muted"
              aria-label={t("device.nextChannel")}
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
          <span className="max-w-[96px] truncate text-[10.5px] font-medium leading-none text-muted-foreground">{channelLabel}</span>
        </div>
      </div>
    </>
  );
}
