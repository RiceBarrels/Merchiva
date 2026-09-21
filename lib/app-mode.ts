"use client";

import { useEffect, useState } from "react";
import { getStoreMachineMode } from "@/lib/store-machine-mode";

/**
 * How this browser/device is being used. Chosen once after sign-in on
 * /choose and remembered per device:
 *   admin    — owner / manager running the full back office
 *   personal — a team member on their own phone (schedule, tasks, training, pay, chat)
 *   store    — a shared store device (POS, inventory, punch-in); implies
 *              store-machine mode from lib/store-machine-mode
 *
 * Homes: admin → /manager/new-tab (the back-office home page), personal →
 * /personal, store → /store. A device leaves its surface by leaving the mode
 * (the "Leave" / "Log out" sheet), which returns it to the chooser; the manager
 * shell offers "Back to store device / personal" whenever the stored mode says
 * this device is one.
 */
export type AppMode = "admin" | "personal" | "store";

const KEY = "app_mode";
const EVENT = "app-mode-change";

/**
 * Where each mode lands after the chooser. The admin home is the New Tab page — kept in sync
 * with HOME_URL (lib/browser-shell/types.ts), which can't be imported here because that module
 * imports AppMode from this one.
 */
export const APP_MODE_HOME: Record<AppMode, string> = {
  admin: "/manager/new-tab",
  personal: "/personal",
  store: "/store",
};

/** Nav hrefs a personal-mode user sees. Everything else is hidden. */
export const PERSONAL_MODE_HREFS = new Set<string>([
  "/manager/personnel/schedule",
  "/manager/personnel/team",
  "/manager/personnel/training",
  "/manager/personnel/pay",
  "/manager/channel",
]);

export function isAppMode(v: unknown): v is AppMode {
  return v === "admin" || v === "personal" || v === "store";
}

export function getAppMode(): AppMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (isAppMode(raw)) return raw;
    // Devices that enabled store-machine mode before the chooser existed.
    if (getStoreMachineMode()) return "store";
    return null;
  } catch {
    return null;
  }
}

export function setAppMode(mode: AppMode | null): void {
  if (typeof window === "undefined") return;
  try {
    if (mode) localStorage.setItem(KEY, mode);
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // localStorage unavailable — ignore.
  }
}

export function clearAppMode(): void {
  setAppMode(null);
}

export function useAppMode(): [AppMode | null, (mode: AppMode | null) => void] {
  const [mode, setMode] = useState<AppMode | null>(null);

  useEffect(() => {
    setMode(getAppMode());
    const handler = () => setMode(getAppMode());
    window.addEventListener(EVENT, handler);
    window.addEventListener("storage", handler);
    window.addEventListener("store-machine-mode-change", handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
      window.removeEventListener("store-machine-mode-change", handler);
    };
  }, []);

  const update = (next: AppMode | null) => {
    setAppMode(next);
    setMode(next);
  };

  return [mode, update];
}
