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
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { MerchivaLogo } from "./logo";

// Custom title bar for the Tauri desktop shell. On the web build it doubles
// as a "get the desktop app" promo strip (dismissible). Drag is handled by
// Tauri's `data-tauri-drag-region` attribute on the outer bar — the back/
// forward button group opts out so its clicks register on the buttons.
export function NativeTitleBar() {
  const isNative = useIsNativeShell();
  const pathname = usePathname();
  const [isAppAsked, setIsAppAsked] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [canBack, setCanBack] = useState(false);
  const [canFwd, setCanFwd] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsAppAsked(localStorage.getItem("isAppAsked") === "true");
    setIsMounted(true);
    setIsMac(getNativeShellPlatform() === "macos");
  }, []);

  useEffect(() => {
    localStorage.setItem("isAppAsked", `${isAppAsked}`);
  }, [isAppAsked]);

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
    refreshState();
    const onNav = () => setTimeout(refreshState, 100);
    window.addEventListener("popstate", onNav);
    const interval = setInterval(refreshState, 500);
    return () => {
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

  // The Mr. Merchiva quick-dialog overlay window is chrome-less — never draw
  // the title bar (or the desktop-app promo strip) inside it.
  if (pathname === "/quick-overlay") return null;

  if (isMounted && !isNative && !isAppAsked) {
    return (
      <div className="z-9999 h-12 select-none border-b border-border flex items-center gap-3 bg-foreground/95 text-background px-4">
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
          onClick={() => setIsAppAsked(true)}
        >
          <XIcon />
        </Button>
      </div>
    );
  }

  return (
    // Tauri 2.11+ walks the composed path: `data-tauri-drag-region="deep"`
    // makes the whole subtree draggable; bare `data-tauri-drag-region` only
    // drags on direct clicks of that exact element (so descendants wouldn't
    // trigger drag). The back/forward button group opts out with "false".
    // <div className="h-10">
      <div
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
