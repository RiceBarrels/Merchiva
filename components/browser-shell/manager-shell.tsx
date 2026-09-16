"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { MobileShell } from "@/components/sidebar";
import { BrowserShellProvider } from "@/components/browser-shell/core/browser-shell-provider";
import { DesktopBrowserChrome } from "@/components/browser-shell/desktop";
import { MobileBrowserChrome } from "@/components/browser-shell/mobile";
import { getStoreMachineMode } from "@/lib/store-machine-mode";
import { useShellLayoutQuery } from "@/lib/browser-shell";

/**
 * Stage B (plan §D1): the browser shell is the default manager UI.
 * `localStorage.merchiva_legacy_shell = "1"` is the rollback escape hatch.
 */
const BROWSER_SHELL_DEFAULT_ON = true;

const LEGACY_SHELL_FLAG = "merchiva_legacy_shell";
const BROWSER_SHELL_FLAG = "merchiva_browser_shell";
const STORE_MACHINE_MODE_EVENT = "store-machine-mode-change"; // lib/store-machine-mode.ts

function subscribe(onChange: () => void): () => void {
  window.addEventListener(STORE_MACHINE_MODE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(STORE_MACHINE_MODE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** True when the legacy sidebar shell must render (store-machine mode or the rollback flag). */
function readLegacy(): boolean {
  if (getStoreMachineMode()) return true;
  try {
    if (localStorage.getItem(LEGACY_SHELL_FLAG) === "1") return true;
    return BROWSER_SHELL_DEFAULT_ON ? false : localStorage.getItem(BROWSER_SHELL_FLAG) !== "1";
  } catch {
    return !BROWSER_SHELL_DEFAULT_ON;
  }
}

function readLegacyOnServer(): boolean {
  return true;
}

/**
 * Picks the manager shell (plan §B2.5, D1–D3). Exactly one shell is mounted at a time:
 * the legacy `MobileShell` in store-machine mode (or when rolled back), otherwise the
 * browser shell with the Chrome-style desktop chrome at ≥1024px and the Safari-style
 * mobile chrome below. Crossing the breakpoint remounts the page subtree, as the legacy
 * shell did. Note: the `storage` event does not fire in the tab that wrote a flag, so a
 * flag change there needs a reload.
 */
export function ManagerShell({ children }: { children: ReactNode }) {
  const legacy = useSyncExternalStore(subscribe, readLegacy, readLegacyOnServer);
  const layout = useShellLayoutQuery();
  if (legacy) return <MobileShell>{children}</MobileShell>;
  return (
    <BrowserShellProvider layout={layout}>
      {layout === "desktop" ? (
        <DesktopBrowserChrome>{children}</DesktopBrowserChrome>
      ) : (
        <MobileBrowserChrome>{children}</MobileBrowserChrome>
      )}
    </BrowserShellProvider>
  );
}
