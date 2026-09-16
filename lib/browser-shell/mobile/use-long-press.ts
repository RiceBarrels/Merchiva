import { useEffect, useMemo, useRef, type MouseEvent, type PointerEvent } from "react";
import { GESTURE } from "./geometry";

export interface LongPressHandlers {
  onPointerDown(event: PointerEvent<HTMLElement>): void;
  onPointerMove(event: PointerEvent<HTMLElement>): void;
  onPointerUp(): void;
  onPointerCancel(): void;
  onPointerLeave(): void;
  /** Swallows the click that follows a fired long press. */
  onClickCapture(event: MouseEvent<HTMLElement>): void;
  /** Suppresses the iOS / Android context menu on the pressed element. */
  onContextMenu(event: MouseEvent<HTMLElement>): void;
}

/**
 * Long press (500ms by default) for chrome buttons and overview cards. Moving more than 8px
 * cancels; the click that follows a fired long press is swallowed so the button's normal
 * action doesn't also run.
 */
export function useLongPress(callback: () => void, opts?: { ms?: number; disabled?: boolean }): LongPressHandlers {
  const ms = opts?.ms ?? GESTURE.longPressMs;
  const disabled = opts?.disabled ?? false;
  const callbackRef = useRef(callback);
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const originRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return useMemo<LongPressHandlers>(() => {
    const cancel = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      originRef.current = null;
    };
    return {
      onPointerDown(event) {
        firedRef.current = false;
        if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
        cancel();
        originRef.current = { x: event.clientX, y: event.clientY };
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          originRef.current = null;
          firedRef.current = true;
          callbackRef.current();
        }, ms);
      },
      onPointerMove(event) {
        const origin = originRef.current;
        if (!origin) return;
        if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > GESTURE.longPressSlop) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onClickCapture(event) {
        if (!firedRef.current) return;
        firedRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
      onContextMenu(event) {
        if (!disabled) event.preventDefault();
      },
    };
  }, [ms, disabled]);
}
