"use client";

import {
  useIsNativeShell,
  getNativeShellPlatform,
  getNativeShell,
} from "@/lib/native-shell";
import { Button } from "./ui/button";
import { ChevronLeft, ChevronRight, DownloadIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { MerchivaLogo } from "./logo";
import { DOWNLOAD_PAGE_ENABLED } from "@/lib/download-page";
import { useMountedBrowserShell } from "@/lib/browser-shell/shell-dom";

const APP_PROMO_DISMISSED_KEY = "isAppAsked";
const APP_PROMO_DISMISSED_EVENT = "merchiva-app-promo-dismissed";

function subscribeToClientMounted() {
  return () => {};
}

function getClientMountedSnapshot() {
  return true;
}

function getServerMountedSnapshot() {
  return false;
}

function getAppPromoDismissedSnapshot() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(APP_PROMO_DISMISSED_KEY) === "true";
}

function subscribeToAppPromoDismissed(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key === APP_PROMO_DISMISSED_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(APP_PROMO_DISMISSED_EVENT, callback);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(APP_PROMO_DISMISSED_EVENT, callback);
  };
}

// Custom title bar for the Tauri desktop shell. On the web build it doubles
// as a "get the desktop app" promo strip (dismissible). Drag is handled by
// Tauri's `data-tauri-drag-region` attribute on the outer bar — the back/
// forward button group opts out so its clicks register on the buttons.
export function NativeTitleBar() {
  const isNative = useIsNativeShell();
  const pathname = usePathname();
  const browserShell = useMountedBrowserShell();
  const isAppAsked = useSyncExternalStore(
    subscribeToAppPromoDismissed,
    getAppPromoDismissedSnapshot,
    getAppPromoDismissedSnapshot,
  );
  const isMounted = useSyncExternalStore(
    subscribeToClientMounted,
    getClientMountedSnapshot,
    getServerMountedSnapshot,
  );
  // Measured height of whatever this component renders (title bar, promo
  // strip, or nothing). The root layout subtracts `--merchiva-chrome-height`
  // from the viewport so pages never get clipped at the bottom.
  const barRef = useRef<HTMLDivElement | null>(null);
  const [canBack, setCanBack] = useState(false);
  const [canFwd, setCanFwd] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const isMac = isMounted && getNativeShellPlatform() === "macos";

  const dismissAppPromo = useCallback(() => {
    localStorage.setItem(APP_PROMO_DISMISSED_KEY, "true");
    window.dispatchEvent(new Event(APP_PROMO_DISMISSED_EVENT));
  }, []);

  const refreshState = useCallback(() => {
    const e = getNativeShell();
    if (!e) return;
    try {
      setCanBack(e.canGoBack());
      setCanFwd(e.canGoForward());
      setIsFullScreen(e.isFullScreen());
    } catch {}
  }, []);

  useEffect(() => {
    if (!isNative) return;
    const initialRefresh = window.setTimeout(refreshState, 0);
    const onNav = () => setTimeout(refreshState, 100);
    window.addEventListener("popstate", onNav);
    const interval = setInterval(refreshState, 500);
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener("popstate", onNav);
      clearInterval(interval);
    };
  }, [isNative, refreshState]);

  const handleBack = useCallback(() => {
    getNativeShell()?.navigateBack();
    setTimeout(refreshState, 200);
  }, [refreshState]);

  const handleForward = useCallback(() => {
    getNativeShell()?.navigateForward();
    setTimeout(refreshState, 200);
  }, [refreshState]);

  // The title bar belongs to the manager (back-office) mode only. The mode
  // chooser and the store / personal device surfaces are full-screen kiosk
  // style screens and render no chrome at all.
  const isManagerRoute = pathname === "/manager" || pathname.startsWith("/manager/");
  const isDeviceRoute =
    pathname === "/choose" ||
    pathname === "/store" || pathname.startsWith("/store/") ||
    pathname === "/personal" || pathname.startsWith("/personal/");
  const showAppPromo =
    DOWNLOAD_PAGE_ENABLED && isMounted && !isNative && !isAppAsked &&
    !isDeviceRoute && !browserShell;

  useEffect(() => {
    const root = document.documentElement;
    if (showAppPromo) {
      root.style.setProperty("--merchiva-app-promo-height", "3rem");
    } else {
      root.style.removeProperty("--merchiva-app-promo-height");
    }

    return () => {
      root.style.removeProperty("--merchiva-app-promo-height");
    };
  }, [showAppPromo]);

  const chromeVisible = (showAppPromo || isManagerRoute) && !browserShell;
  useEffect(() => {
    const root = document.documentElement;
    const el = barRef.current;
    if (!chromeVisible || !el) {
      root.style.setProperty("--merchiva-chrome-height", "0px");
      return;
    }
    const apply = () => root.style.setProperty("--merchiva-chrome-height", `${el.offsetHeight}px`);
    apply();
    // The title bar is `hidden lg:flex`, so its height changes with the viewport.
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", apply);
      root.style.setProperty("--merchiva-chrome-height", "0px");
    };
  }, [chromeVisible, showAppPromo, isManagerRoute]);

  // The browser shell's tab strip is the window chrome (drag regions, caption buttons).
  if (browserShell) return null;

  if (showAppPromo) {
    return (
      <div ref={barRef} className="z-9999 h-12 select-none border-b border-border flex items-center gap-3 bg-foreground/95 text-background px-4">
        <div className="flex h-full items-center text-sm font-black pt-1">
          Get The Merchiva App.
        </div>
        <div className="flex-1" />
        <Link href="/download">
          <Button className="bg-background text-foreground" variant="secondary"><DownloadIcon /> Download</Button>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="hover:bg-background/10 hover:text-background"
          onClick={dismissAppPromo}
        >
          <XIcon />
        </Button>
      </div>
    );
  }

  if (!isManagerRoute) return null;

  return (
    // Tauri 2.11+ walks the composed path: `data-tauri-drag-region="deep"`
    // makes the whole subtree draggable; bare `data-tauri-drag-region` only
    // drags on direct clicks of that exact element (so descendants wouldn't
    // trigger drag). The back/forward button group opts out with "false".
    // <div className="h-10">
      <div
        ref={barRef}
        data-tauri-drag-region="deep"
        className="hidden lg:flex z-9999 select-none bg-background border-b border-border items-center justify-center gap-4 pt-1 px-2"
      >
        {isMac && <div className={cn("h-6 bg-foreground rounded-full duration-200 w-20", isFullScreen && "opacity-0 -translate-x-24")} />}
        <div
          data-tauri-drag-region="false"
          className={cn("flex items-center duration-300", isFullScreen && "-translate-x-24")}
        >
          <Button variant="ghost" size="icon" onClick={handleBack} disabled={!canBack}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleForward} disabled={!canFwd}>
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <div className="flex items-center justify-center text-xs font-medium flex-1 gap-2">
          <MerchivaLogo className="size-5 relative -left-21 duration-300" />
          {
            isNative ? (
              <div className="flex relative -left-21 duration-300 lg:flex gap-0.5">
                The Merchiva App
                <div className="text-muted-foreground text-[9px]">beta</div>
              </div>
            ) : (

              <div className="flex relative -left-21 duration-300 gap-0.5">
                The Merchiva Web App
                <div className="text-muted-foreground text-[9px]">beta</div>
              </div>
            )
          }
        </div>
      </div>
    // </div>
  );
}
