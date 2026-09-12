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
 * Homes: admin → /manager (the original back-office UI), personal →
 * /personal, store → /store. Store/personal devices that jump into /manager
 * ("Switch to manager mode") set the session-scoped manager override first so
 * the manager shell knows to offer a "Back to store device / personal" link.
 */
export type AppMode = "admin" | "personal" | "store";

const KEY = "app_mode";
const EVENT = "app-mode-change";

export const APP_MODE_HOME: Record<AppMode, string> = {
  admin: "/manager/dashboard",
  personal: "/personal",
  store: "/store",
};

/**
 * Session flag set by /store and /personal before navigating a manager into
 * /manager. Never persisted across tabs/restarts — the device's app_mode is
 * untouched, so closing the tab drops back to the device surface.
 */
export const MANAGER_OVERRIDE_KEY = "merchiva_manager_override";

export function hasManagerOverride(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(MANAGER_OVERRIDE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setManagerOverride(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) sessionStorage.setItem(MANAGER_OVERRIDE_KEY, "1");
    else sessionStorage.removeItem(MANAGER_OVERRIDE_KEY);
  } catch {
    // sessionStorage unavailable — ignore.
  }
}

export function clearManagerOverride(): void {
  setManagerOverride(false);
}

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
