import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, useMotionValue, type MotionValue } from "motion/react";
import { CHROME_SPRING, INSTANT } from "./geometry";

/*
 * Mobile chrome state machine (mobile-safari spec §7).
 *
 *   expanded ──SCROLL_DOWN (auto-minimize, not docked, no dialog)──▶ minimized
 *   minimized ──SCROLL_UP / SCROLL_EDGE / TAP_MINI / NAVIGATED / DIALOG_CHANGED──▶ expanded
 *   any ──docked, hidden toggled, dialog count or navigation changed──▶ expanded
 *
 * Animation runs on motion values (no React state per frame).
 */

export type ChromeMode = "expanded" | "minimized";

export interface ChromeInputs {
  keyboardOpen: boolean;
  editableFocusedInPage: boolean;
  immersive: boolean;
  overviewOpen: boolean;
  searchOpen: boolean;
  openDialogs: number;
  foreignOverlayOpen: boolean;
  docked: boolean;
  autoMinimize: boolean;
  reducedMotion: boolean;
  /** Changes on navigation, tab activation and soft reload; every change re-expands the chrome. */
  navKey: string;
}

export type ChromeEvent =
  | { type: "SCROLL_DOWN" }
  | { type: "SCROLL_UP" }
  | { type: "SCROLL_EDGE" }
  | { type: "TAP_MINI" }
  | { type: "NAVIGATED" }
  | { type: "DIALOG_CHANGED" };

export interface ChromeState {
  mode: ChromeMode;
  hidden: boolean;
  /** 0 expanded → 1 minimized. */
  collapse: MotionValue<number>;
  /** 0 visible → 1 off-screen. */
  hide: MotionValue<number>;
  dispatch(event: ChromeEvent): void;
}

export function isChromeHidden(inputs: ChromeInputs): boolean {
  return (
    inputs.keyboardOpen ||
    inputs.editableFocusedInPage ||
    inputs.immersive ||
    inputs.overviewOpen ||
    inputs.searchOpen ||
    (inputs.openDialogs > 0 && inputs.foreignOverlayOpen)
  );
}

export function canAutoMinimize(inputs: ChromeInputs): boolean {
  return inputs.autoMinimize && !inputs.docked && inputs.openDialogs === 0;
}

interface ModeState {
  readonly mode: ChromeMode;
  /** Context the mode was decided in; a different context means "expanded". */
  readonly key: string;
}

export function useChromeState(inputs: ChromeInputs): ChromeState {
  const hidden = isChromeHidden(inputs);
  const minimizable = canAutoMinimize(inputs);
  const contextKey = `${hidden ? 1 : 0}|${minimizable ? 1 : 0}|${inputs.openDialogs}|${inputs.navKey}`;

  const [state, setState] = useState<ModeState>(() => ({ mode: "expanded", key: contextKey }));
  // Adjusting state from the previous render (react.dev "you might not need an effect"):
  // any context change expands the chrome, so Safari's bar reappears expanded after the
  // keyboard closes, when a dialog opens or closes, and after every navigation.
  if (state.key !== contextKey) {
    setState({ mode: "expanded", key: contextKey });
  }
  const mode: ChromeMode = state.key === contextKey && minimizable ? state.mode : "expanded";

  const latest = useRef({ contextKey, minimizable });
  useLayoutEffect(() => {
    latest.current = { contextKey, minimizable };
  });

  const dispatch = useCallback((event: ChromeEvent) => {
    const { contextKey: key, minimizable: canMinimize } = latest.current;
    if (event.type === "SCROLL_DOWN") {
      if (!canMinimize) return;
      setState((prev) => (prev.key === key && prev.mode === "minimized" ? prev : { mode: "minimized", key }));
      return;
    }
    setState((prev) => (prev.key === key && prev.mode === "expanded" ? prev : { mode: "expanded", key }));
  }, []);

  const collapse = useMotionValue(0);
  const hide = useMotionValue(0);
  const reducedMotion = inputs.reducedMotion;

  useEffect(() => {
    const controls = animate(collapse, mode === "minimized" ? 1 : 0, reducedMotion ? INSTANT : CHROME_SPRING);
    return () => controls.stop();
  }, [collapse, mode, reducedMotion]);

  useEffect(() => {
    const controls = animate(hide, hidden ? 1 : 0, reducedMotion ? INSTANT : CHROME_SPRING);
    return () => controls.stop();
  }, [hide, hidden, reducedMotion]);

  return { mode, hidden, collapse, hide, dispatch };
}
