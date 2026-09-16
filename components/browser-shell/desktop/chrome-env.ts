"use client";

import { useSyncExternalStore } from "react";

/** Platform facts the chrome needs for click dispositions and labels. */
export interface ChromeEnv {
  readonly isMac: boolean;
  readonly isTauri: boolean;
}

const SERVER_ENV: ChromeEnv = Object.freeze({ isMac: false, isTauri: false });
let cachedEnv: ChromeEnv | null = null;

interface NavigatorWithHints extends Navigator {
  readonly userAgentData?: { readonly platform?: string };
}

function readEnv(): ChromeEnv {
  if (!cachedEnv) {
    const nav = navigator as NavigatorWithHints;
    const platform = nav.userAgentData?.platform || nav.platform || nav.userAgent || "";
    cachedEnv = Object.freeze({
      isMac: /mac|iphone|ipad|ipod/i.test(platform),
      // Set by the pre-paint script in app/layout.tsx inside Tauri.
      isTauri: document.documentElement.classList.contains("native-shell"),
    });
  }
  return cachedEnv;
}

function subscribeNever(): () => void {
  return () => {};
}

function readServerEnv(): ChromeEnv {
  return SERVER_ENV;
}

export function useChromeEnv(): ChromeEnv {
  return useSyncExternalStore(subscribeNever, readEnv, readServerEnv);
}
