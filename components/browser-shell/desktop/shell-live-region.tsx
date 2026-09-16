"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/*
 * Polite screen-reader announcements for the desktop chrome (desktop spec §8): tab moves,
 * "Tab closed", reopen, and "page loaded" after slow navigations.
 */

type Announce = (message: string) => void;

const AnnounceContext = createContext<Announce>(() => {});

/** Announces `message` through the chrome's live region (no-op outside it). */
export function useAnnounce(): Announce {
  return useContext(AnnounceContext);
}

/** Provides `useAnnounce` to the chrome and renders the `sr-only` live region after its children. */
export function ShellLiveRegion({ children }: { children?: ReactNode }) {
  const [message, setMessage] = useState("");
  const clearTimer = useRef<number | null>(null);
  const setTimer = useRef<number | null>(null);

  const announce = useCallback<Announce>((next) => {
    const text = next.trim();
    if (!text) return;
    if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
    if (setTimer.current !== null) window.clearTimeout(setTimer.current);
    // Clear first so repeating the same text is announced again.
    setMessage("");
    setTimer.current = window.setTimeout(() => {
      setTimer.current = null;
      setMessage(text);
      clearTimer.current = window.setTimeout(() => {
        clearTimer.current = null;
        setMessage("");
      }, 4000);
    }, 60);
  }, []);

  useEffect(
    () => () => {
      if (clearTimer.current !== null) window.clearTimeout(clearTimer.current);
      if (setTimer.current !== null) window.clearTimeout(setTimer.current);
    },
    [],
  );

  const value = useMemo(() => announce, [announce]);

  return (
    <AnnounceContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </div>
    </AnnounceContext.Provider>
  );
}
