"use client";

// Wall-clock idle countdown. Counts from the last real interaction
// (pointerdown / keydown / wheel / touchstart — NOT pointermove, so a resting
// hand or a mouse on the page doesn't keep a shared device awake) and keeps
// counting while the user stays on the page, inside an app panel or a drawer.
// `paused` (e.g. while recording) freezes the countdown; `reset()` re-arms;
// `enabled: false` clears everything. Uses a 1 s interval against Date.now()
// so it exposes `secondsLeft` and stays accurate if timers get throttled.

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseIdleTimerOptions {
  idleMs: number;
  dimMs?: number;         // default idleMs - 8000
  enabled: boolean;
  paused?: boolean;
  onIdle: () => void;
  onDim?: () => void;
}

export interface UseIdleTimerResult {
  dimming: boolean;
  /** Whole seconds until onIdle fires (0 when disabled). */
  secondsLeft: number;
  reset: () => void;
}

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export function useIdleTimer(opts: UseIdleTimerOptions): UseIdleTimerResult {
  const { idleMs, enabled, paused = false, onIdle, onDim } = opts;
  const dimMs = opts.dimMs ?? Math.max(0, idleMs - 8000);
  const [dimming, setDimming] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() => Math.ceil(idleMs / 1000));
  const lastActivity = useRef(0);
  const pausedAt = useRef<number | null>(null);
  const dimFired = useRef(false);
  const idleFired = useRef(false);
  // Latest callbacks / pause flag, synced in an effect so render stays pure.
  const latest = useRef({ onIdle, onDim, paused });

  useEffect(() => {
    latest.current.onIdle = onIdle;
    latest.current.onDim = onDim;
    latest.current.paused = paused;
  }, [onIdle, onDim, paused]);

  const arm = useCallback(() => {
    lastActivity.current = Date.now();
    pausedAt.current = null;
    dimFired.current = false;
    idleFired.current = false;
    setDimming(false);
    setSecondsLeft(Math.ceil(idleMs / 1000));
  }, [idleMs]);

  useEffect(() => {
    if (!enabled || idleMs <= 0) return;
    // Ref-only reset here (state is already at its armed defaults); the
    // state-writing `arm` runs from event handlers and the tick.
    lastActivity.current = Date.now();
    pausedAt.current = null;
    dimFired.current = false;
    idleFired.current = false;
    const handler = () => arm();
    for (const ev of ACTIVITY_EVENTS) document.addEventListener(ev, handler, { passive: true });

    const tick = () => {
      const now = Date.now();
      if (latest.current.paused) {
        // Freeze: remember when the pause began; the anchor slides forward
        // by the paused duration once it lifts, so no time elapses meanwhile.
        if (pausedAt.current === null) pausedAt.current = now;
        return;
      }
      if (pausedAt.current !== null) {
        lastActivity.current += now - pausedAt.current;
        pausedAt.current = null;
      }
      const elapsed = now - lastActivity.current;
      const left = Math.max(0, Math.ceil((idleMs - elapsed) / 1000));
      setSecondsLeft(left);
      if (!dimFired.current && dimMs > 0 && dimMs < idleMs && elapsed >= dimMs) {
        dimFired.current = true;
        setDimming(true);
        latest.current.onDim?.();
      }
      if (!idleFired.current && elapsed >= idleMs) {
        idleFired.current = true;
        setDimming(false);
        latest.current.onIdle();
      }
    };
    const interval = setInterval(tick, 1000);
    return () => {
      clearInterval(interval);
      for (const ev of ACTIVITY_EVENTS) document.removeEventListener(ev, handler);
    };
  }, [enabled, idleMs, dimMs, arm]);

  return { dimming: enabled ? dimming : false, secondsLeft: enabled ? secondsLeft : 0, reset: arm };
}
