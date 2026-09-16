"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useShellBackHandler, useShellInfo } from "@/lib/browser-shell";
import { chromeGeometry, type ChromeGeometry } from "./chrome-geometry";

/*
 * State shared across the desktop chrome's pieces: popovers that other surfaces open
 * (the omnibox "Switch store" / "Bookmark this tab" actions, the tab-search shortcut) and
 * the omnibox focus handle used by shortcuts and new tabs.
 */

export interface OmniboxHandle {
  /** Focuses the omnibox (entering edit mode); selects the text unless `selectAll` is false. */
  focus(opts?: { selectAll?: boolean }): void;
}

export interface DesktopChromeContextValue {
  readonly coarse: boolean;
  readonly geometry: ChromeGeometry;
  readonly omniboxRef: RefObject<OmniboxHandle | null>;
  focusOmnibox(opts?: { selectAll?: boolean }): void;
  /** Moves focus to `#desktop-content` (after committing an omnibox item or switching tabs). */
  focusContent(): void;
  readonly storeChipOpen: boolean;
  setStoreChipOpen(open: boolean): void;
  readonly bookmarkStarOpen: boolean;
  /** The star popover was opened right after creating the bookmark ("Bookmark added"). */
  readonly bookmarkStarJustAdded: boolean;
  /**
   * The bookmark the star popover was opened for. The popover only shows while that bookmark
   * belongs to the current page, and closes for good as soon as it doesn't.
   */
  readonly bookmarkStarBookmarkId: string | null;
  openBookmarkStar(justAdded: boolean, bookmarkId: string): void;
  closeBookmarkStar(): void;
  readonly tabSearchOpen: boolean;
  setTabSearchOpen(open: boolean): void;
}

export const DESKTOP_CONTENT_ID = "desktop-content";

export function focusDesktopContent(): void {
  document.getElementById(DESKTOP_CONTENT_ID)?.focus({ preventScroll: true });
}

const NOOP = () => {};
const DETACHED_OMNIBOX: RefObject<OmniboxHandle | null> = { current: null };

const DesktopChromeContext = createContext<DesktopChromeContextValue>({
  coarse: false,
  geometry: chromeGeometry(false),
  omniboxRef: DETACHED_OMNIBOX,
  focusOmnibox: NOOP,
  focusContent: NOOP,
  storeChipOpen: false,
  setStoreChipOpen: NOOP,
  bookmarkStarOpen: false,
  bookmarkStarJustAdded: false,
  bookmarkStarBookmarkId: null,
  openBookmarkStar: NOOP,
  closeBookmarkStar: NOOP,
  tabSearchOpen: false,
  setTabSearchOpen: NOOP,
});

export function DesktopChromeProvider({ children }: { children: ReactNode }) {
  const coarse = useShellInfo()?.coarse ?? false;
  const omniboxRef = useRef<OmniboxHandle | null>(null);
  const [storeChipOpen, setStoreChipOpen] = useState(false);
  const [bookmarkStar, setBookmarkStar] = useState<{ open: boolean; justAdded: boolean; bookmarkId: string | null }>({
    open: false,
    justAdded: false,
    bookmarkId: null,
  });
  const [tabSearchOpen, setTabSearchOpen] = useState(false);

  const focusOmnibox = useCallback((opts?: { selectAll?: boolean }) => {
    omniboxRef.current?.focus(opts);
  }, []);
  const openBookmarkStar = useCallback(
    (justAdded: boolean, bookmarkId: string) => setBookmarkStar({ open: true, justAdded, bookmarkId }),
    [],
  );
  // Keeps justAdded / bookmarkId so the closing popover doesn't change its heading mid-animation.
  const closeBookmarkStar = useCallback(() => setBookmarkStar((prev) => (prev.open ? { ...prev, open: false } : prev)), []);

  const value = useMemo<DesktopChromeContextValue>(
    () => ({
      coarse,
      geometry: chromeGeometry(coarse),
      omniboxRef,
      focusOmnibox,
      focusContent: focusDesktopContent,
      storeChipOpen,
      setStoreChipOpen,
      bookmarkStarOpen: bookmarkStar.open,
      bookmarkStarJustAdded: bookmarkStar.justAdded,
      bookmarkStarBookmarkId: bookmarkStar.bookmarkId,
      openBookmarkStar,
      closeBookmarkStar,
      tabSearchOpen,
      setTabSearchOpen,
    }),
    [coarse, focusOmnibox, storeChipOpen, bookmarkStar, openBookmarkStar, closeBookmarkStar, tabSearchOpen],
  );

  return <DesktopChromeContext.Provider value={value}>{children}</DesktopChromeContext.Provider>;
}

export function useDesktopChrome(): DesktopChromeContextValue {
  return useContext(DesktopChromeContext);
}

/**
 * Registers an open chrome overlay with the core back stack (plan §B2.2): a back press
 * (Android hardware back, shell Back) closes the overlay first.
 */
export function useOverlayBackHandler(open: boolean, close: () => void): void {
  useShellBackHandler(() => {
    close();
    return true;
  }, open);
}
