"use client";

// Native shell bridge — Tauri-backed.
//
// The web build runs in a regular browser; the desktop build runs inside
// Tauri's webview, where `window.__TAURI_INTERNALS__` is defined. We feature-
// detect that single global so the same code paths work everywhere.
//
// Public surface (mirrors what `lib/electron.ts` exposed previously, so
// existing call sites only need their import paths swapped):
//
//   isNativeShell()           — runtime detector
//   useIsNativeShell()        — React hook variant
//   getNativeShellPlatform()  — "macos" | "windows" | "linux" | null
//   getNativeShell()          — returns the bridge object (or null on web)

import { useEffect, useState, useSyncExternalStore } from "react";

export type AuthCallbackParams = {
  access_token?: string;
  refresh_token?: string;
  user?: string;
  redirect_to?: string;
  error?: string;
};

export interface NativeShellBridge {
  platform: "macos" | "windows" | "linux" | "unknown";
  isNativeShell: true;
  navigateBack: () => Promise<void>;
  navigateForward: () => Promise<void>;
  // The webview tracks browser-style canGoBack/canGoForward via window.history.
  // These wrap the same DOM API since the Tauri-side webview is just a normal
  // browsing context.
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  isFullScreen: () => boolean;
  openExternalAuth: (url: string) => Promise<void>;
  // Subscribe to merchiva:// deep-link callbacks. Returns an unsubscribe fn.
  onAuthCallback: (handler: (params: AuthCallbackParams) => void) => () => void;
}

function isInTauri(): boolean {
  if (typeof window === "undefined") return false;
  // Tauri 2 sets this global the moment the webview boots, before any plugin.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any).__TAURI_INTERNALS__;
}

function detectPlatform(): NativeShellBridge["platform"] {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

// Cached fullscreen state. Tauri's isFullscreen() is async, but components
// consume the value synchronously (e.g. inside className conditions). We
// keep a cached boolean and refresh it whenever the window resizes — macOS
// fullscreen-by-green-button fires a resize, so this stays in sync.
let cachedFullscreen = false;
let fullscreenTrackingStarted = false;

async function startFullscreenTracking() {
  if (fullscreenTrackingStarted) return;
  fullscreenTrackingStarted = true;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    cachedFullscreen = await win.isFullscreen();
    await win.onResized(async () => {
      try {
        cachedFullscreen = await win.isFullscreen();
      } catch {}
    });
  } catch {
    fullscreenTrackingStarted = false;
  }
}

// Build the bridge lazily so SSR doesn't try to import @tauri-apps/* (which
// references browser-only globals). All Tauri API calls go through dynamic
// imports inside the methods.
function makeBridge(): NativeShellBridge {
  // Fire-and-forget — first read may be stale until the async init resolves,
  // but the title bar polls every 500ms so it converges quickly.
  void startFullscreenTracking();
  return {
    platform: detectPlatform(),
    isNativeShell: true,
    navigateBack: async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("nav_back");
    },
    navigateForward: async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("nav_forward");
    },
    canGoBack: () => {
      try {
        // window.history.length isn't a true canGoBack signal, but Tauri's
        // webview shares the same history stack as the page, so this is the
        // best heuristic without round-tripping to Rust on every paint.
        return typeof window !== "undefined" && window.history.length > 1;
      } catch {
        return false;
      }
    },
    canGoForward: () => {
      // Browsers don't expose a reliable "can go forward" signal; we mirror
      // canGoBack's behavior and let the renderer optimistically enable it.
      return false;
    },
    isFullScreen: () => cachedFullscreen,
    openExternalAuth: async (url: string) => {
      if (!/^https?:\/\//.test(url)) return;
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_external", { url });
    },
    onAuthCallback: (handler) => {
      let unlisten: (() => void) | null = null;
      let disposed = false;

      (async () => {
        const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
        const dispose = await onOpenUrl((urls: string[]) => {
          for (const raw of urls) {
            try {
              const parsed = new URL(raw);
              if (parsed.protocol !== "merchiva:") continue;
              if (parsed.hostname !== "auth-callback") continue;
              const params: AuthCallbackParams = {};
              parsed.searchParams.forEach((v, k) => {
                (params as Record<string, string>)[k] = v;
              });
              handler(params);
            } catch {
              // ignore malformed URLs
            }
          }
        });
        if (disposed) {
          dispose();
        } else {
          unlisten = dispose;
        }
      })();

      return () => {
        disposed = true;
        if (unlisten) unlisten();
      };
    },
  };
}

let cachedBridge: NativeShellBridge | null = null;

function getBridge(): NativeShellBridge | null {
  if (!isInTauri()) return null;
  if (!cachedBridge) cachedBridge = makeBridge();
  return cachedBridge;
}

export function isNativeShell(): boolean {
  return !!getBridge()?.isNativeShell;
}

export function getNativeShellPlatform(): string | null {
  return getBridge()?.platform ?? null;
}

export function useIsNativeShell(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    setV(isNativeShell());
  }, []);
  return v;
}

export function getNativeShell(): NativeShellBridge | null {
  return getBridge();
}

// ─── Synchronous detection + window state (desktop browser chrome) ─────────

function subscribeNever(): () => void {
  return () => {};
}

function readNativeShellClass(): boolean {
  return document.documentElement.classList.contains("native-shell");
}

function readNativeShellServer(): boolean {
  return false;
}

/**
 * Tauri detection that is already correct on the first client render: it reads the
 * `html.native-shell` class set by the pre-paint script in app/layout.tsx (unlike
 * `useIsNativeShell`, which resolves in an effect). Server snapshot: false.
 */
export function useIsNativeShellSync(): boolean {
  return useSyncExternalStore(subscribeNever, readNativeShellClass, readNativeShellServer);
}

export interface NativeWindowState {
  fullscreen: boolean;
  maximized: boolean;
}

const INITIAL_WINDOW_STATE: NativeWindowState = Object.freeze({ fullscreen: false, maximized: false });
let nativeWindowState: NativeWindowState = INITIAL_WINDOW_STATE;
const nativeWindowStateListeners = new Set<() => void>();
let nativeWindowStateTracking = false;

function setNativeWindowState(next: NativeWindowState): void {
  if (next.fullscreen === nativeWindowState.fullscreen && next.maximized === nativeWindowState.maximized) return;
  nativeWindowState = Object.freeze({ fullscreen: next.fullscreen, maximized: next.maximized });
  for (const listener of Array.from(nativeWindowStateListeners)) listener();
}

// One `onResized` subscription for the app's lifetime: macOS fullscreen (green button)
// and Windows maximize both fire a resize.
async function startNativeWindowStateTracking(): Promise<void> {
  if (nativeWindowStateTracking || !isInTauri()) return;
  nativeWindowStateTracking = true;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    const refresh = async () => {
      try {
        const [fullscreen, maximized] = await Promise.all([win.isFullscreen(), win.isMaximized()]);
        setNativeWindowState({ fullscreen, maximized });
      } catch {
        // Window closing or API unavailable: keep the last state.
      }
    };
    await refresh();
    await win.onResized(() => {
      void refresh();
    });
  } catch {
    nativeWindowStateTracking = false;
  }
}

function subscribeNativeWindowState(onChange: () => void): () => void {
  nativeWindowStateListeners.add(onChange);
  void startNativeWindowStateTracking();
  return () => {
    nativeWindowStateListeners.delete(onChange);
  };
}

function readNativeWindowState(): NativeWindowState {
  return nativeWindowState;
}

function readNativeWindowStateServer(): NativeWindowState {
  return INITIAL_WINDOW_STATE;
}

/** Fullscreen / maximized state of the Tauri window (always false on the web). */
export function useNativeWindowState(): { fullscreen: boolean; maximized: boolean } {
  return useSyncExternalStore(subscribeNativeWindowState, readNativeWindowState, readNativeWindowStateServer);
}
