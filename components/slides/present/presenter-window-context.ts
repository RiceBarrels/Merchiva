"use client";

// The Window a presenter subtree lives in (slides.md §9). The speaker view can render into a popup window through
// a portal: it shares the React tree, but its nodes belong to the popup's document and realm, so size observers,
// timers and key listeners must be made with the popup's own globals. Everything outside the popup reads `window`.
import { createContext, useContext } from "react";

export const PresenterWindowContext = createContext<Window | null>(null);
PresenterWindowContext.displayName = "PresenterWindowContext";

/** The Window this subtree actually lives in: the speaker popup inside SpeakerWindow, else the main window. */
export function usePresenterWindow(): Window {
  return useContext(PresenterWindowContext) ?? globalThis.window;
}
