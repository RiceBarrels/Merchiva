"use client";

// The slideshow (slides.md §9): a black layer over everything (portaled to <body>, fixed, inset 0), full screen
// where the device allows it (lib/slides/present/presentation.ts), the screen kept awake. The audience sees the
// slide; the presenter's speaker view opens in its own window on the web (SpeakerWindow), or splits the overlay
// (inline) under Capacitor, Tauri, on touch devices, in device panels, or on request.
//
// Input: the keys of lib/slides/present/input.ts in the main window and in the speaker popup (usePresenterKeys),
// a mouse click = next, taps and swipes on touch screens (the audience view takes every touch gesture, so a
// horizontal swipe is never claimed by the browser as a pan); links open through useSlideLinkHandler and never
// advance. The show itself is the pure reducer of lib/slides/present/show.ts, fed deck changes as collaborators edit.
//
// The overlay is modal: focus that lands anywhere else in the page comes back to it, so no key reaches the editor
// hidden behind, and a press on a control never focuses it (keepKeysWithShow), so Space still moves the show. On
// /store it sits above the app panel but under the device's about-to-log-out dimmer, and never goes element full
// screen there (neither at start nor on F): the browser's top layer would hide that dimmer.
//
// Leaving: Esc, the exit control, one "next" past the end screen, the shell's back, or the browser leaving full
// screen by itself. The overlay also ends the show when it is hidden without unmounting (a background tab), after
// the same one-task grace StrictMode needs. onExit gets the slide the show was on.
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { useDriveActor } from "@/components/drive/drive-actor";
import { useSlideViewLabels } from "@/components/slides/editor/slides-context";
import { useSlideLinkHandler } from "@/components/slides/present/open-slide-link";
import { PresentSlide } from "@/components/slides/present/present-slide";
import { PRESENT_CONTROLS_ATTR, PresenterControls } from "@/components/slides/present/presenter-controls";
import { SpeakerView } from "@/components/slides/present/speaker-view";
import { SpeakerWindow } from "@/components/slides/present/speaker-window";
import { PRESENT_SHOW_ATTR, keepKeysWithShow, usePresenterKeys } from "@/components/slides/present/use-presenter-keys";
import { useShellBackHandler } from "@/lib/browser-shell";
import { isCapacitorNative } from "@/lib/capacitor";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { isNativeShell } from "@/lib/native-shell";
import type { SpeakerMode } from "@/lib/slides/editor/ui-state";
import type { DeckState } from "@/lib/slides/model/deck-store";
import { onFullscreenChange, type FullscreenMode } from "@/lib/slides/present/fullscreen";
import { swipeAction, tapAction, type PresenterKeyAction } from "@/lib/slides/present/input";
import { presenterOrder } from "@/lib/slides/present/nav";
import { PresentationSession } from "@/lib/slides/present/presentation";
import { initShow, showReducer, showSlideId, startTimer, type ShowAction, type ShowTimer } from "@/lib/slides/present/show";
import { cn } from "@/lib/utils";

export interface PresenterOverlayProps {
  deck: DeckState;
  startSlideId: string;
  speaker: SpeakerMode;
  /** The show ended; `lastSlideId` is the slide it was on (the editor shows it). */
  onExit(lastSlideId: string): void;
  /** The deck title, for the speaker window's title bar. */
  title?: string;
  /** provider.sessionId: names the speaker window so another tab's is never reused. */
  sessionId?: string;
}

/** How long the control bar stays after the pointer stops (ms). */
const CONTROLS_IDLE_MS = 2500;

/** A popup speaker window makes sense on the web, with a fine pointer, outside device panels. */
function speakerWindowSupported(surface: string): boolean {
  if (typeof window === "undefined" || surface !== "manager" || isCapacitorNative() || isNativeShell()) return false;
  return window.matchMedia?.("(pointer: fine)").matches ?? true;
}

function inControls(target: EventTarget | null): boolean {
  const node = target as Node | null;
  return !!node && node.nodeType === 1 && (node as Element).closest(`[${PRESENT_CONTROLS_ATTR}]`) !== null;
}

export function PresenterOverlay({ deck, startSlideId, speaker, onExit, title = "", sessionId }: PresenterOverlayProps): React.JSX.Element {
  const t = useT();
  const labels = useSlideViewLabels();
  const onLinkClick = useSlideLinkHandler();
  const { surface } = useDriveActor();
  const [popupAllowed] = useState(() => speakerWindowSupported(surface));
  const [speakerMode, setSpeakerMode] = useState<SpeakerMode>(() => (speaker === "window" && !popupAllowed ? "inline" : speaker));
  const [fallbackSession] = useState(() => Math.random().toString(36).slice(2));
  const [timer, setTimer] = useState<ShowTimer>(() => startTimer(Date.now()));
  const [popup, setPopup] = useState<Window | null>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [fsMode, setFsMode] = useState<FullscreenMode>("overlay");
  const [session] = useState(() => new PresentationSession((mode) => setFsMode(mode), { elementFullscreen: surface !== "store" }));
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const press = useRef<{ x: number; y: number; type: string; swiped: boolean } | null>(null);

  const [show, dispatch] = useReducer(showReducer, null, () => initShow(presenterOrder(deck), startSlideId, deck.slideIds));
  const [seenDeck, setSeenDeck] = useState(deck);
  if (seenDeck !== deck) {
    setSeenDeck(deck);
    if (deck.slideIds !== seenDeck.slideIds || deck.slides !== seenDeck.slides) dispatch({ type: "deck", order: presenterOrder(deck), all: deck.slideIds });
  }

  // The slide to hand back on exit: the one on screen, else the last one shown.
  const shownId = showSlideId(show);
  const lastRef = useRef(startSlideId);
  useEffect(() => {
    const id = shownId ?? show.nav.order[show.nav.order.length - 1];
    if (id) lastRef.current = id;
  }, [shownId, show.nav.order]);

  const latestExit = useRef(onExit);
  useLayoutEffect(() => {
    latestExit.current = onExit;
  });
  const exited = useRef(false);
  const exitShow = useCallback(() => {
    if (exited.current) return;
    exited.current = true;
    session.stop();
    latestExit.current(lastRef.current);
  }, [session]);

  useEffect(() => {
    if (show.done) exitShow();
  }, [show.done, exitShow]);

  // Focus that lands outside the overlay comes back (Tab past the last control, a background focus() call); once
  // the show has ended the editor may take it (onExit focuses the stage while the overlay is still mounted).
  useEffect(() => {
    if (!root) return;
    const doc = root.ownerDocument;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as Node | null;
      if (exited.current || !target || root.contains(target)) return;
      root.focus({ preventScroll: true });
    };
    doc.addEventListener("focusin", onFocusIn, true);
    return () => doc.removeEventListener("focusin", onFocusIn, true);
  }, [root]);

  // Keys go to the show, not to whatever in the editor had focus (the stage would nudge on arrows).
  useLayoutEffect(() => {
    root?.focus({ preventScroll: true });
  }, [root]);

  // Start on mount, still inside the click's user activation (see presentation.ts for the teardown grace). With the
  // speaker window the popup takes that activation, so full screen waits for F or the control bar.
  const [initialSpeaker] = useState(speakerMode);
  useLayoutEffect(() => {
    if (!root) return;
    session.start(root, initialSpeaker !== "window");
    return () => session.stopSoon(exitShow);
  }, [root, session, exitShow, initialSpeaker]);

  useEffect(() => onFullscreenChange(document, () => {
    if (session.fullscreenChanged(document)) dispatch({ type: "exit" });
  }), [session]);

  useEffect(
    () => () => {
      if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    },
    [],
  );

  useShellBackHandler(() => {
    dispatch({ type: "exit" });
    return true;
  });

  const revealControls = () => {
    setControlsVisible(true);
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_IDLE_MS);
  };

  const toggleSpeaker = () => setSpeakerMode((mode) => (mode !== "none" ? "none" : popupAllowed ? "window" : "inline"));
  const toggleFullscreen = () => {
    if (root) void session.toggleFullscreen(root);
  };
  const act = (action: ShowAction) => dispatch(action);

  const onKeyAction = (action: PresenterKeyAction) => {
    if (action.type === "fullscreen") toggleFullscreen();
    else if (action.type === "speaker") toggleSpeaker();
    else act(action);
  };
  const livePopup = speakerMode === "window" ? popup : null;
  usePresenterKeys(livePopup ? [window, livePopup] : [window], { onAction: onKeyAction });

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    revealControls();
    press.current = inControls(event.target) ? null : { x: event.clientX, y: event.clientY, type: event.pointerType, swiped: false };
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p) return;
    const action = swipeAction({ pointerType: p.type, dx: event.clientX - p.x, dy: event.clientY - p.y });
    if (!action) return;
    press.current = { ...p, swiped: true };
    act({ type: action });
  };
  const onPointerCancel = () => {
    press.current = null;
  };
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const p = press.current;
    press.current = null;
    if (!p || p.swiped || inControls(event.target)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const action = tapAction({ pointerType: p.type, dx: event.clientX - p.x, dy: event.clientY - p.y, x: event.clientX - rect.left, width: rect.width, button: event.button });
    if (action) act({ type: action });
  };

  const total = show.nav.order.length;
  const position = show.ended ? 0 : show.nav.index + 1;
  const speakerTitle = fmt(t("slides.present.speakerWindowTitle"), { title: title || t("slides.untitled") });
  const speakerView = (variant: "inline" | "window") => (
    <SpeakerView
      deck={deck}
      show={show}
      labels={labels}
      onLinkClick={onLinkClick}
      timer={timer}
      onTimer={setTimer}
      onShow={act}
      onExit={() => act({ type: "exit" })}
      variant={variant}
      onHide={variant === "inline" ? () => setSpeakerMode("none") : undefined}
    />
  );

  const overlay = (
    <div
      ref={setRoot}
      role="dialog"
      aria-modal="true"
      aria-label={t("slides.header.slideshow")}
      tabIndex={-1}
      data-shell-shortcuts="off"
      {...{ [PRESENT_SHOW_ATTR]: "" }}
      className={cn(
        "fixed inset-0 flex select-none bg-black text-white outline-none",
        // /store: above the app panel (z-50), under the device's about-to-log-out dimmer (z-60).
        surface === "store" ? "z-[55]" : "z-[95]",
        speakerMode !== "inline" && "touch-none",
        speakerMode !== "inline" && !controlsVisible && "cursor-none",
      )}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") revealControls();
      }}
      onMouseDown={(event) => keepKeysWithShow(event, root)}
      onPointerDown={speakerMode === "inline" ? undefined : onPointerDown}
      onPointerUp={speakerMode === "inline" ? undefined : onPointerUp}
      onPointerCancel={speakerMode === "inline" ? undefined : onPointerCancel}
      onClick={speakerMode === "inline" ? undefined : onClick}
    >
      {speakerMode === "inline" ? (
        <div className="flex min-h-0 w-full flex-1 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">{speakerView("inline")}</div>
      ) : (
        <div className="relative flex min-h-0 w-full flex-1 px-[env(safe-area-inset-left,0px)] pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
          <PresentSlide deck={deck} slideId={shownId} labels={labels} onLinkClick={onLinkClick} animate />
          {show.ended || total === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/70">
              {t(total === 0 ? "slides.present.noSlides" : "slides.present.endOfShow")}
            </p>
          ) : null}
          {show.blank ? <div aria-hidden className={cn("absolute inset-0", show.blank === "black" ? "bg-black" : "bg-white")} /> : null}
          {show.digits ? (
            <div className="absolute end-3 top-3 rounded-md bg-black/70 px-2.5 py-1 text-[13px] text-white">{fmt(t("slides.present.goToSlide"), { n: show.digits })}</div>
          ) : null}
          <PresenterControls
            visible={controlsVisible}
            position={position}
            total={total}
            canGoBack={show.ended || show.nav.index > 0}
            speakerOn={speakerMode === "window"}
            fullscreen={root && session.canFullscreen(root) ? fsMode === "element" : null}
            onPrev={() => act({ type: "prev" })}
            onNext={() => act({ type: "next" })}
            onSpeaker={toggleSpeaker}
            onFullscreen={toggleFullscreen}
            onExit={() => act({ type: "exit" })}
          />
        </div>
      )}
      <span aria-live="polite" className="sr-only">
        {show.ended ? t("slides.present.endOfShow") : total > 0 ? fmt(t("slides.present.slideOf"), { n: position, total }) : ""}
      </span>
    </div>
  );

  return (
    <>
      {createPortal(overlay, document.body)}
      {speakerMode === "window" ? (
        <SpeakerWindow
          open
          title={speakerTitle}
          sessionId={sessionId ?? fallbackSession}
          onWindow={setPopup}
          onClosed={() => setSpeakerMode("none")}
          onBlocked={() => {
            toast(t("slides.present.speakerViewBlocked"));
            setSpeakerMode("inline");
          }}
        >
          {speakerView("window")}
        </SpeakerWindow>
      ) : null}
    </>
  );
}
