"use client";

import { useEffect, useState } from "react";

export type AuthCallbackParams = {
  access_token?: string;
  refresh_token?: string;
  user?: string;
  redirect_to?: string;
  error?: string;
};

interface ElectronBridge {
  platform: string;
  isElectron: true;
  navigateBack: () => Promise<void>;
  navigateForward: () => Promise<void>;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  isFullScreen: () => boolean;
  // Open a 3rd-party OAuth URL in the system browser (Electron only).
  openExternalAuth: (url: string) => Promise<void>;
  // Subscribe to the auth-callback delivered back through the merchiva://
  // custom protocol. Returns an unsubscribe function.
  onAuthCallback: (handler: (params: AuthCallbackParams) => void) => () => void;
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
