// Full screen and screen wake for a slideshow (slides.md §9).
//
// - The web and Tauri: element full screen on the presenter overlay when the document allows it (Tauri only when
//   its webview grants DOM full screen); otherwise the overlay alone (fixed, inset 0).
// - Capacitor (iOS WKWebView has no element full screen, Android's WebView neither): always the overlay, with the
//   status bar hidden while presenting.
// - The caller can rule element full screen out (the /store tablet: the browser's top layer would hide the device's
//   about-to-log-out dimmer); the show is then the overlay, the Capacitor status bar still hidden.
// - The screen is kept awake with the Screen Wake Lock API where there is one; the lock is dropped by the browser
//   whenever the page is hidden, so it is asked for again when the page shows.
//
// requestFullscreen needs the user's activation, so enterPresentation calls it before its first await.
import { isCapacitorNative } from "@/lib/capacitor";

export type FullscreenMode = "element" | "overlay";

type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => void };

/** The element shown full screen in `doc`, if any (prefixed WebKit included). */
export function fullscreenElementOf(doc: Document): Element | null {
  return doc.fullscreenElement ?? (doc as WebkitDocument).webkitFullscreenElement ?? null;
}

/** Whether `el` can be put in element full screen here (never under Capacitor). */
export function canUseElementFullscreen(el: HTMLElement): boolean {
  if (isCapacitorNative()) return false;
  const doc = el.ownerDocument as WebkitDocument;
  if (doc.fullscreenEnabled && typeof el.requestFullscreen === "function") return true;
  return doc.webkitFullscreenEnabled === true && typeof (el as WebkitElement).webkitRequestFullscreen === "function";
}

/** Puts `el` in element full screen; false when the browser refused or cannot. */
export async function requestElementFullscreen(el: HTMLElement): Promise<boolean> {
  if (!canUseElementFullscreen(el)) return false;
  const doc = el.ownerDocument as WebkitDocument;
  try {
    if (doc.fullscreenEnabled && typeof el.requestFullscreen === "function") {
      await el.requestFullscreen({ navigationUI: "hide" });
    } else {
      // Older iPadOS Safari: prefixed, and returns nothing to await.
      (el as WebkitElement).webkitRequestFullscreen?.();
    }
    return true;
  } catch {
    return false;
  }
}

/** Leaves element full screen in `doc` (if it is in it). */
export async function exitElementFullscreen(doc: Document): Promise<void> {
  if (!fullscreenElementOf(doc)) return;
  const d = doc as WebkitDocument;
  try {
    if (typeof d.exitFullscreen === "function" && d.fullscreenElement) await d.exitFullscreen();
    else d.webkitExitFullscreen?.();
  } catch {
    // Already left (the person pressed Esc first): nothing to undo.
  }
}

async function setStatusBarHidden(hidden: boolean): Promise<void> {
  try {
    const { StatusBar } = await import("@capacitor/status-bar");
    await (hidden ? StatusBar.hide() : StatusBar.show());
  } catch {
    // The plugin is missing from this build: the status bar just stays.
  }
}

/**
 * Starts presenting on `el`: element full screen when it can and `opts.element` allows it (the default), else the
 * overlay (see the file comment).
 */
export async function enterPresentation(el: HTMLElement, opts: { element?: boolean } = {}): Promise<FullscreenMode> {
  if (isCapacitorNative()) {
    await setStatusBarHidden(true);
    return "overlay";
  }
  if (opts.element === false) return "overlay";
  return (await requestElementFullscreen(el)) ? "element" : "overlay";
}

/** Undoes enterPresentation: leaves full screen, or shows the status bar again under Capacitor. */
export async function exitPresentation(mode: FullscreenMode): Promise<void> {
  if (isCapacitorNative()) {
    await setStatusBarHidden(false);
    return;
  }
  if (mode === "element" && typeof document !== "undefined") await exitElementFullscreen(document);
}

/** Calls `fn` whenever `doc` enters or leaves element full screen; returns the unsubscribe. */
export function onFullscreenChange(doc: Document, fn: () => void): () => void {
  doc.addEventListener("fullscreenchange", fn);
  doc.addEventListener("webkitfullscreenchange", fn);
  return () => {
    doc.removeEventListener("fullscreenchange", fn);
    doc.removeEventListener("webkitfullscreenchange", fn);
  };
}

/**
 * Keeps the screen on until the returned function runs. A no-op where the Wake Lock API is missing or refuses (low
 * battery, a hidden page); the lock is asked for again each time the page becomes visible.
 */
export async function holdWakeLock(): Promise<() => void> {
  if (typeof navigator === "undefined" || typeof document === "undefined" || !("wakeLock" in navigator)) return () => {};
  let sentinel: WakeLockSentinel | null = null;
  let released = false;
  const acquire = async () => {
    if (released || document.visibilityState !== "visible") return;
    try {
      const next = await navigator.wakeLock.request("screen");
      if (released) void next.release().catch(() => undefined);
      else sentinel = next;
    } catch {
      sentinel = null;
    }
  };
  const onVisible = () => {
    if (document.visibilityState === "visible" && (sentinel === null || sentinel.released)) void acquire();
  };
  document.addEventListener("visibilitychange", onVisible);
  await acquire();
  return () => {
    released = true;
    document.removeEventListener("visibilitychange", onVisible);
    const held = sentinel;
    sentinel = null;
    if (held && !held.released) void held.release().catch(() => undefined);
  };
}
