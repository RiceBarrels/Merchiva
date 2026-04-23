"use client";

import { useEffect, useState } from "react";

export type NavMode = "sidebar" | "bottombar";

const KEY = "nav_mode";
const EVENT = "nav-mode-change";

export function getNavMode(): NavMode {
  if (typeof window === "undefined") return "sidebar";
  try {
    const v = localStorage.getItem(KEY);
    return v === "bottombar" ? "bottombar" : "sidebar";
  } catch {
    return "sidebar";
  }
}

export function setNavMode(mode: NavMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, mode);
    window.dispatchEvent(new Event(EVENT));
  } catch {}
}

export function useNavMode(): [NavMode, (mode: NavMode) => void] {
  const [mode, setMode] = useState<NavMode>("sidebar");

  useEffect(() => {
    setMode(getNavMode());
    const handler = () => setMode(getNavMode());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const update = (next: NavMode) => {
    setNavMode(next);
    setMode(next);
  };

  return [mode, update];
}
