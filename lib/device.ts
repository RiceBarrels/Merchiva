"use client";
import { useState, useEffect } from "react";

export function useIsMobileDevice(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const hasTouchScreen =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const mobileUA =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );
    // iPad on Safari 13+ reports as "Macintosh" — detect via touch + Mac UA
    const isIPad = navigator.userAgent.includes("Mac") && hasTouchScreen;

    setIsMobile(hasTouchScreen && (mobileUA || isIPad));
  }, []);

  return isMobile;
}
