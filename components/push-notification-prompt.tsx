"use client";

// First-time prompt to enable desktop push notifications.
// Renders an AlertDialog the first time the app loads if the browser supports
// push, permission is "default" (not yet decided), and the user hasn't already
// dismissed it. Dismissal is persisted in localStorage so we don't re-ask on
// every navigation.

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePushNotifications } from "@/lib/spacetimedb/hooks/usePushNotifications";
import { isNativeShell } from "@/lib/native-shell";
import { useT } from "@/lib/i18n/context";

const DISMISS_KEY = "merchiva.pushPromptDismissed";

export function PushNotificationPrompt() {
  const t = useT();
  const push = usePushNotifications();
  const [open, setOpen] = useState(false);
  const autoEnabled = useRef(false);

  // The device-permission gate already obtained OS-level notification
  // permission before the app rendered — finish the job by registering the
  // push subscription without showing a dialog. Runs once per mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isNativeShell()) return;
    if (!push.supported || push.permission !== "granted") return;
    if (push.isSubscribed || push.busy || autoEnabled.current) return;
    autoEnabled.current = true;
    push.enable().catch(() => {});
  }, [push]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isNativeShell()) return; // Tauri handles OS permission via the plugin
    if (!push.supported) return;
    if (push.permission !== "default") return;
    if (push.isSubscribed) return;
    const dismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    if (dismissed) return;
    // Defer slightly so we don't fire during initial mount/transitions.
    const timer = window.setTimeout(() => setOpen(true), 1500);
    return () => window.clearTimeout(timer);
  }, [push.supported, push.permission, push.isSubscribed]);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, "1");
    }
    setOpen(false);
  }

  async function enable() {
    await push.enable();
    dismiss();
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
            <Bell className="h-4 w-4 text-foreground" />
          </div>
          <AlertDialogTitle>
            {t("push.promptTitle") || "Get desktop alerts"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("push.promptBody") ||
              "We'll send you push notifications for inventory alerts, shift trades, and team messages — even when Merchiva isn't open."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={dismiss}>
            {t("push.notNow") || "Not now"}
          </AlertDialogCancel>
          <AlertDialogAction onClick={enable} disabled={push.busy}>
            {t("push.enable") || "Enable"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
