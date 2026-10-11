"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getAppMode } from "@/lib/app-mode";
import { nativeBackGuarded, shouldBlockNativeBack } from "@/lib/gestures/native-back";

/** Turns off the browser's back / forward swipe on the app surfaces (rules in lib/gestures/native-back.ts). */
export function NativeBackGuard() {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    // The mode lives in localStorage, so it is read here; a mode change at /choose navigates, which re-runs this.
    if (!nativeBackGuarded(pathname, getAppMode())) return;
    const root = document.documentElement;
    const previous = root.style.overscrollBehaviorX;
    root.style.overscrollBehaviorX = "none";

    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || !event.cancelable) return;
      const target = event.target instanceof Element ? event.target : null;
      if (shouldBlockNativeBack(event.touches.length, touch.clientX, window.innerWidth, target)) {
        event.preventDefault();
      }
    };
    document.addEventListener("touchstart", onTouchStart, { passive: false, capture: true });

    return () => {
      root.style.overscrollBehaviorX = previous;
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
    };
  }, [pathname]);

  return null;
}
