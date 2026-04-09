"use client";

import { useEffect } from "react";

export function MobileDetector() {
  useEffect(() => {
    const hasTouchScreen =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const mobileUA =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    // iPad Safari 13+ reports as "Macintosh" — detect by touch + Mac UA
    const isIPad = navigator.userAgent.includes("Mac") && hasTouchScreen;

    if (hasTouchScreen && (mobileUA || isIPad)) {
      document.documentElement.classList.add("mobile-device");
    }
  }, []);

  return null;
}
