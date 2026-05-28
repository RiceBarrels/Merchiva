"use client";

// Mounts the Tauri OS-notification bridge for the authenticated app shell.
// On non-Tauri runtimes the hook is a no-op, so this component is safe to
// render unconditionally.

import { useTauriNotifications } from "@/lib/spacetimedb/hooks/useTauriNotifications";

export function TauriNotificationBridge() {
  useTauriNotifications();
  return null;
}
