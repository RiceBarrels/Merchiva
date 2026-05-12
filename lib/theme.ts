"use client";

import { useState, useSyncExternalStore } from "react";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "merchiva_theme";
const LEGACY_KEY = "merchiva_dark";

let listeners: Array<() => void> = [];
let snapshot: ThemeMode = "system";

function readFromStorage(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    if (t === "system" || t === "light" || t === "dark") return t;
    const old = localStorage.getItem(LEGACY_KEY);
    if (old === "true") return "dark";
    if (old === "false") return "light";
  } catch {}
  return "system";
}

if (typeof window !== "undefined") {
  snapshot = readFromStorage();
}

function notify() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => { listeners = listeners.filter((l) => l !== cb); };
}

function getSnapshot() { return snapshot; }
function getServerSnapshot(): ThemeMode { return "system"; }

export function applyThemeMode(mode: ThemeMode) {
  snapshot = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
    localStorage.removeItem(LEGACY_KEY);
  } catch {}
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const next = mode === "dark" || (mode === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", next);
  const meta = document.getElementById("theme-color-meta") as HTMLMetaElement | null;
  if (meta) meta.content = next ? "#1a1a1a" : "#ffffff";
  document.cookie = `merchiva_theme=${mode};path=/;max-age=31536000;SameSite=Lax`;
  document.cookie = `merchiva_dark=${next ? "true" : "false"};path=/;max-age=31536000;SameSite=Lax`;
  notify();
}

export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [mode, applyThemeMode];
}
