"use client";

// Everything built-in notifications run in the signed-in app, mounted once by
// app/manager/layout.tsx around both the manager shell and the bare screens
// (/choose, /store, /personal):
//
//   - NotificationDotsProvider on every screen (dots, clearing);
//   - alerts (toast / OS / Tauri) on /manager and /personal, never on a shared
//     store tablet, nor on a store-machine kiosk unless its account is the PIN operator;
//   - the identity / email-language sync where alerts run, on a person's own device;
//   - the push subscription prompt on a person's own device (not on /store, not on
//     a device in store mode or store-machine mode, not for a PIN operator);
//   - a store-machine kiosk drops this browser's push subscription, as /store does.
//
// What counts as shared: ./viewer.ts.

import { useEffect, type ReactNode } from "react";
import { PushNotificationPrompt } from "@/components/push-notification-prompt";
import { useStoreMachineMode } from "@/lib/store-machine-mode";
import { useNotificationAlerts } from "./alerts";
import { NotificationDotsProvider, useNotificationDots } from "./dots-context";
import { releaseBrowserPush } from "./push-cleanup";
import { useNotificationSync } from "./sync";

function NotificationAlerts() {
  useNotificationAlerts();
  return null;
}

function NotificationServices() {
  const { viewer } = useNotificationDots();
  const [storeMachine] = useStoreMachineMode();
  useNotificationSync(viewer.alerts && viewer.personalDevice);
  useEffect(() => {
    if (storeMachine) void releaseBrowserPush();
  }, [storeMachine]);
  return (
    <>
      {viewer.alerts ? <NotificationAlerts /> : null}
      {viewer.personalDevice ? <PushNotificationPrompt /> : null}
    </>
  );
}

export function NotificationRuntime({ children }: { children: ReactNode }) {
  return (
    <NotificationDotsProvider>
      {children}
      <NotificationServices />
    </NotificationDotsProvider>
  );
}
