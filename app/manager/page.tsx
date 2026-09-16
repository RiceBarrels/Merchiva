"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAppMode, APP_MODE_HOME } from "@/lib/app-mode";
import { useShellInfo } from "@/lib/browser-shell/shell-context";
import { useT } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/loaders/geometric";

/** How long to wait for the browser shell's session restore before going home anyway. */
const SHELL_RESTORE_TIMEOUT_MS = 3000;

/**
 * /manager entry point. First visit on a device asks how it will be used (/choose);
 * afterwards it routes straight to that mode's home — for admin devices the New Tab home
 * page (`APP_MODE_HOME.admin`, kept equal to the shell's `HOME_URL`).
 *
 * Inside the browser shell "/manager" is the app-launch path: the tab store restores the last
 * session and replaces the alias itself (lib/browser-shell/store.ts `bootState`), so an admin
 * device must not navigate from here — two replaces racing would drop the restored session.
 * Every other case navigates: store and personal devices go to their own surface, and the
 * legacy shell (or a shell that never bound) falls back to the home page.
 */
export default function ManagerIndexPage() {
  const router = useRouter();
  const t = useT();
  const shell = useShellInfo();

  useEffect(() => {
    const mode = getAppMode();
    if (!mode) {
      router.replace("/choose");
      return;
    }
    if (mode !== "admin" || !shell) {
      router.replace(APP_MODE_HOME[mode]);
      return;
    }
    // The shell replaces this URL as soon as the tab store binds. If it never binds (no
    // signed-in scope), go home rather than spinning here forever.
    const timer = window.setTimeout(() => router.replace(APP_MODE_HOME.admin), SHELL_RESTORE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [router, shell]);

  return (
    <div role="status" className="flex h-full min-h-[50vh] items-center justify-center">
      <Spinner size={20} className="text-stone-400 dark:text-stone-500" />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}
