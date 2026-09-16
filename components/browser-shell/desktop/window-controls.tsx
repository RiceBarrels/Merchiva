"use client";

import { useSyncExternalStore } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { CAPTION_BUTTON_CLASS, CAPTION_CLOSE_CLASS } from "./chrome-classes";
import { CHROME } from "./chrome-geometry";

/*
 * Tauri window chrome for the tab strip (desktop spec §7):
 *   macOS           traffic lights overlay the strip (TitleBarStyle::Overlay), so the strip
 *                   reserves a physical-left inset that collapses in fullscreen;
 *   Windows/Linux   the window is undecorated, so the strip renders caption buttons at the
 *                   physical right (capabilities: core:window:allow-minimize /
 *                   allow-toggle-maximize / allow-close).
 * Both are positioned physically (left / right), never by logical flex order, so they stay
 * put in RTL locales.
 */

export type NativeDesktopPlatform = "macos" | "windows" | "linux";

function subscribeNever(): () => void {
  return () => {};
}

function readPlatform(): NativeDesktopPlatform | null {
  // The pre-paint script in app/layout.tsx adds `html.native-shell` inside Tauri, so this
  // is correct on the very first client render (no inset jump).
  if (!document.documentElement.classList.contains("native-shell")) return null;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  return "linux";
}

function readServerPlatform(): NativeDesktopPlatform | null {
  return null;
}

/** The Tauri desktop platform, or null in a web browser. Server snapshot: null. */
export function useNativeDesktopPlatform(): NativeDesktopPlatform | null {
  return useSyncExternalStore(subscribeNever, readPlatform, readServerPlatform);
}

/** Lead inset of the tab strip: room for the macOS traffic lights (none in fullscreen or on the web). */
export function macLeadInset(platform: NativeDesktopPlatform | null, fullscreen: boolean): number {
  return platform === "macos" && !fullscreen ? CHROME.MAC_TRAFFIC_INSET : CHROME.LEAD_INSET;
}

/**
 * Reserved space under the macOS traffic lights, pinned to the physical left edge of the strip.
 * A bare Tauri drag region: dragging moves the window and double-click zooms (Tauri drag script).
 */
export function MacTrafficLightInset({ fullscreen }: { fullscreen: boolean }) {
  return (
    <div
      aria-hidden
      data-tauri-drag-region=""
      className="absolute inset-y-0 left-0 transition-[width] duration-200 ease-out motion-reduce:transition-none"
      style={{ width: fullscreen ? CHROME.LEAD_INSET : CHROME.MAC_TRAFFIC_INSET }}
    />
  );
}

/** Label of the hidden Mr. Merchiva quick-dialog overlay window (src-tauri/src/lib.rs). */
const QUICK_OVERLAY_LABEL = "quick";

async function runWindowCommand(command: "minimize" | "toggleMaximize" | "close"): Promise<void> {
  try {
    const { Window, getCurrentWindow } = await import("@tauri-apps/api/window");
    const win = getCurrentWindow();
    if (command === "minimize") {
      await win.minimize();
    } else if (command === "toggleMaximize") {
      await win.toggleMaximize();
    } else {
      // The caption X quits the app, like closing Chrome's last window. Tauri exits once its last
      // window is gone, but the hidden, taskbar-less quick overlay lives for the app's lifetime:
      // closing only "main" would leave a windowless process (global shortcut still registered),
      // and a relaunch just focuses the missing "main" window (single-instance), so the app could
      // not be reopened. Destroy the overlay first (capabilities: core:window:allow-destroy).
      if (win.label !== QUICK_OVERLAY_LABEL) {
        try {
          const overlay = await Window.getByLabel(QUICK_OVERLAY_LABEL);
          await overlay?.destroy();
        } catch (error) {
          console.warn("[window-controls] could not close the quick overlay", error);
        }
      }
      await win.close();
    }
  } catch (error) {
    console.error(`[window-controls] ${command} failed`, error);
  }
}

/**
 * Minimize / maximize-restore / close for undecorated Windows and Linux windows. Renders a
 * `dir="ltr"` group the caller pins to the physical right edge of the strip.
 */
export function WindowCaptionButtons({ maximized }: { maximized: boolean }) {
  const t = useT();
  const maximizeLabel = maximized ? t("browserDesktop.window.restore") : t("browserDesktop.window.maximize");
  return (
    <div dir="ltr" role="group" aria-label={t("browserDesktop.window.label")} className="flex h-full shrink-0">
      <button
        type="button"
        aria-label={t("browserDesktop.window.minimize")}
        title={t("browserDesktop.window.minimize")}
        onClick={() => void runWindowCommand("minimize")}
        className={CAPTION_BUTTON_CLASS}
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={maximizeLabel}
        title={maximizeLabel}
        onClick={() => void runWindowCommand("toggleMaximize")}
        className={CAPTION_BUTTON_CLASS}
      >
        {maximized ? <Copy className="h-3.5 w-3.5" aria-hidden /> : <Square className="h-3.5 w-3.5" aria-hidden />}
      </button>
      <button
        type="button"
        aria-label={t("browserDesktop.window.close")}
        title={t("browserDesktop.window.close")}
        onClick={() => void runWindowCommand("close")}
        className={cn(CAPTION_BUTTON_CLASS, CAPTION_CLOSE_CLASS)}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
