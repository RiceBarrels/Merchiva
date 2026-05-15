"use client";

import { useIsElectron, getElectronPlatform, getElectron } from "@/lib/electron";
import { Button } from "./ui/button";
import { ChevronLeft, ChevronRight, DownloadIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { MerchivaLogo } from "./logo";

export function ElectronTitleBar() {
  const isElectron = useIsElectron();
  const [isAppAsked, setIsAppAsked] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [canBack, setCanBack] = useState(false);
  const [canFwd, setCanFwd] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    setIsAppAsked(localStorage.getItem("isAppAsked") === "true");
    setIsMounted(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("isAppAsked", `${isAppAsked}`);
  }, [isAppAsked]);

  const refreshState = useCallback(() => {
    const e = getElectron();
    if (!e) return;
    try {
      setCanBack(e.canGoBack());
      setCanFwd(e.canGoForward());
      setIsFullScreen(e.isFullScreen());
    } catch {}
  }, []);

  useEffect(() => {
    if (!isElectron) return;
    refreshState();
    const onNav = () => setTimeout(refreshState, 100);
    window.addEventListener("popstate", onNav);
    const interval = setInterval(refreshState, 500);
    return () => {
      window.removeEventListener("popstate", onNav);
      clearInterval(interval);
    };
  }, [isElectron, refreshState]);

  const handleBack = useCallback(() => {
    getElectron()?.navigateBack();
    setTimeout(refreshState, 200);
  }, [refreshState]);

  const handleForward = useCallback(() => {
    getElectron()?.navigateForward();
    setTimeout(refreshState, 200);
  }, [refreshState]);

  if (isMounted && !isElectron && !isAppAsked) {
    return (
      <div className="z-9999 h-12 select-none border-b border-border flex items-center gap-3 bg-foreground/95 text-background px-4">
        <div className="flex h-full items-center text-sm font-black pt-1">
          Get Merchiva Desktop App
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
  } else if (!isElectron) {
    return null;
  }

  const isMac = getElectronPlatform() === "darwin";

  return (
    <div
      className="z-9999 h-10 select-none bg-background border-b border-border flex items-center justify-center gap-4 pt-0.5"
    >
      <div className={cn("h-6 bg-foreground rounded-full duration-200", isMac && "w-19 ml-2", isFullScreen && "opacity-0 -translate-x-24")} />
      <div className={cn("flex items-center duration-300", isFullScreen && "-translate-x-24")}>
        <Button variant="ghost" size="icon" onClick={handleBack} disabled={!canBack}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleForward} disabled={!canFwd}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div
        className="flex items-center justify-center text-xs font-medium flex-1 gap-2"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <MerchivaLogo className="size-5 relative -left-21 duration-300" /> 
        <div className="relative -left-21 duration-300 flex gap-0.5">
          The Merchiva App
          {/* <div className="bg-foreground h-3 w-1.5 inline-block animate-pulse"/> */}
          <div className="text-muted-foreground text-[9px]">beta</div>
        </div>
      </div>
    </div>
  );
}
