"use client";

// The slideshow's control bar (slides.md §9): previous, "n / N", next, speaker view, full screen and exit, in the
// bottom corner of the audience view. It shows while the pointer moves or a control has keyboard focus (focus-visible:
// a mouse click never focuses a control, see keepKeysWithShow) and fades out after a moment, so the audience sees
// only the slide. Presses on it never reach the slide (which would advance the show).
import { ChevronLeft, ChevronRight, Maximize, Minimize, Presentation, X } from "lucide-react";

import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export interface PresenterControlsProps {
  visible: boolean;
  /** 1-based position and count of the shown slides; position 0 on the end screen. */
  position: number;
  total: number;
  canGoBack: boolean;
  speakerOn: boolean;
  /** null: element full screen is not available here (Capacitor, iPhone). */
  fullscreen: boolean | null;
  onPrev(): void;
  onNext(): void;
  onSpeaker(): void;
  onFullscreen(): void;
  onExit(): void;
}

/** Marks the control bar: pointer handling on the slide ignores presses inside it. */
export const PRESENT_CONTROLS_ATTR = "data-present-controls";

function ControlButton({ label, pressed, disabled, onClick, children }: { label: string; pressed?: boolean; disabled?: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-9 items-center justify-center rounded-md text-white/85 outline-none hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40 aria-pressed:bg-white/20"
    >
      {children}
    </button>
  );
}

export function PresenterControls(p: PresenterControlsProps) {
  const t = useT();
  return (
    <div
      role="toolbar"
      aria-label={t("slides.present.controls")}
      {...{ [PRESENT_CONTROLS_ATTR]: "" }}
      className={cn(
        "absolute bottom-[max(env(safe-area-inset-bottom,0px),12px)] start-[max(env(safe-area-inset-left,0px),12px)] flex items-center gap-0.5 rounded-md bg-black/70 p-1 text-white shadow-sm transition-opacity duration-200",
        "has-[:focus-visible]:pointer-events-auto has-[:focus-visible]:opacity-100",
        p.visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <ControlButton label={t("slides.present.previous")} disabled={!p.canGoBack} onClick={p.onPrev}>
        <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
      </ControlButton>
      <span className="min-w-14 px-1 text-center font-mono text-[13px] tabular-nums text-white/85">
        {p.total > 0 ? `${p.position > 0 ? p.position : "–"} / ${p.total}` : "0 / 0"}
      </span>
      <ControlButton label={t("slides.present.next")} onClick={p.onNext}>
        <ChevronRight className="h-5 w-5 rtl:rotate-180" />
      </ControlButton>
      <span aria-hidden className="mx-1 h-5 w-px bg-white/25" />
      <ControlButton label={t("slides.present.speakerView")} pressed={p.speakerOn} onClick={p.onSpeaker}>
        <Presentation className="h-4 w-4" />
      </ControlButton>
      {p.fullscreen !== null ? (
        <ControlButton label={t(p.fullscreen ? "slides.present.exitFullscreen" : "slides.present.fullscreen")} onClick={p.onFullscreen}>
          {p.fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
        </ControlButton>
      ) : null}
      <ControlButton label={t("slides.present.exit")} onClick={p.onExit}>
        <X className="h-4 w-4" />
      </ControlButton>
    </div>
  );
}
