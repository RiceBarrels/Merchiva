"use client";

// Links on slides while presenting (slides.md §9, F33). The renderer draws a link only when it gets a handler, and
// its click handler stops the click, so following a link never also advances the slide. The href is checked again
// here and opened outside the app: the system browser under Capacitor (where target=_blank is unreliable), a
// noopener tab on the web. On the shared store tablet links are off, so a slideshow never leaves the kiosk surface.
import { useCallback } from "react";

import { useDriveActor } from "@/components/drive/drive-actor";
import { openExternal } from "@/lib/browser-shell/mobile/share";
import { safeHref } from "@/lib/slides/model/safe-values";

/** The link handler to give SlideView in present mode; undefined on /store (links render as plain text there). */
export function useSlideLinkHandler(): ((href: string) => void) | undefined {
  const { surface } = useDriveActor();
  const open = useCallback((href: string) => {
    const safe = safeHref(href);
    if (safe === "") return;
    openExternal(safe).catch((err: unknown) => console.error("[slides] could not open a link", err));
  }, []);
  return surface === "store" ? undefined : open;
}
