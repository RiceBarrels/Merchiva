"use client";

import { useEffect, useState } from "react";

interface ElectronBridge {
  platform: string;
  isElectron: true;
  navigateBack: () => Promise<void>;
  navigateForward: () => Promise<void>;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  isFullScreen: () => boolean;
}

function getBridge(): ElectronBridge | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).electron ?? null;
}

export function isElectron(): boolean {
  return !!getBridge()?.isElectron;
}

export function getElectronPlatform(): string | null {
  return getBridge()?.platform ?? null;
}

export function useIsElectron(): boolean {
  const [electron, setElectron] = useState(false);
  useEffect(() => {
    setElectron(isElectron());
  }, []);
  return electron;
}

export function getElectron(): ElectronBridge | null {
  return getBridge();
}
