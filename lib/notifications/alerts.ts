"use client";

// In-app alerts for new notification rows: the one watcher (the Tauri bridge's own
// watcher is gone). Mounted by NotificationRuntime on /manager and /personal only —
// never on a shared screen (a store tablet; a store-machine kiosk unless the PIN
// operator is its account).
//
//   - New = absent from this connection's first snapshot (plus rows that stream in
//     during BASELINE_GRACE_MS after it, the rest of a reconnect's snapshot). No
//     comparison of createdAt with the local clock.
//   - Active store only. A row is shown after ALERT_SETTLE_MS, and only if it is
//     still unread: the page on screen (the open conversation, the visible page) has
//     had time to read it.
//   - Someone at the screen (./attention.ts) → a toast; otherwise an OS notification
//     (service worker, tag = notification id, safe links only) or, in Tauri, a native one.
//   - Shown rows whose delivery row still owes a push are acked with
//     markNotificationsDelivered, so the cron does not push them again; never the SOS.
//   - A push that reaches a focused tab is handed to it (public/sw.js): the tab says
//     whether it dealt with the row, else the worker raises the OS notification.
//   - The SOS (alert.emergency) toast stays until dismissed and dismissing reads it;
//     an unread SOS alerts again on every new connection.
//   - Alert-only rows (no feature, no dot) are read once presented; the ones never
//     presented (a connection's backlog, a row nobody saw) are replayed while
//     someone is at the screen (./alert-plan.ts).
//   - Mr. Merchiva's toasts have no action (nothing here opens his dock).

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { openInNewTab } from "@/lib/browser-shell/hooks";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { isNativeShell } from "@/lib/native-shell";
import { markNotificationsDelivered } from "@/lib/spacetimedb/actions/notifications";
import type { Notification as NotificationRow, NotificationDelivery } from "@/lib/spacetimedb/generated/types";
import { fireTauriNotification } from "@/lib/spacetimedb/hooks/useTauriNotifications";
import { planAlertOnly, pushHandledHere } from "./alert-plan";
import { notificationAlertText } from "./alert-text";
import { documentAttended, useDocumentAttended } from "./attention";
import { NOTIFY_DOT_WINDOW_MS, rowsClearedByPage } from "./dots";
import { timestampMs, useNotificationDots, useNotificationFeed } from "./dots-context";
import { safeAppPath } from "./safe-link";

/** How long a new row waits before it is shown (the page on screen may read it first). */
export const ALERT_SETTLE_MS = 1200;
/** Rows streaming in this soon after a connection's first snapshot belong to it. */
export const BASELINE_GRACE_MS = 4000;
const EMERGENCY_TEMPLATE = "alert.emergency";

export function isEmergencyAlert(row: Pick<NotificationRow, "type">, delivery: Pick<NotificationDelivery, "template"> | null | undefined): boolean {
  return row.type === "emergency" || delivery?.template === EMERGENCY_TEMPLATE;
}

async function showOsNotification(id: string, title: string, body: string, link: string, type: string): Promise<boolean> {
  if (isNativeShell()) return fireTauriNotification(title, body);
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) return false;
  if (Notification.permission !== "granted") return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return false;
    await registration.showNotification(title || "Merchiva", {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: id,
      data: { link, type },
    });
    return true;
  } catch (err) {
    console.warn("[notify] OS notification failed:", err);
    return false;
  }
}

interface Baseline {
  readonly key: string;
  readonly ids: Set<string>;
  readonly at: number;
}

export function useNotificationAlerts(): void {
  const t = useT();
  const feed = useNotificationFeed();
  const dots = useNotificationDots();
  const attended = useDocumentAttended();
  const enabled = dots.viewer.alerts && dots.viewer.dotsVisible;

  // Everything a delayed callback reads, as of the latest render.
  const latest = useRef({ feed, dots, t });
  useEffect(() => {
    latest.current = { feed, dots, t };
  }, [feed, dots, t]);

  const baseline = useRef<Baseline | null>(null);
  const handled = useRef(new Set<string>());
  // Rows shown (toast, OS notification) or skipped because the page on screen shows them.
  const presented = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Bumped when a queued row has been dealt with, so alert-only rows are read after it.
  const [settled, setSettled] = useState(0);

  const readEmergency = useCallback((id: string) => {
    latest.current.dots.markRead([id]);
  }, []);

  /** Shows one row; true when it was presented (or the page on screen shows it). */
  const present = useCallback(
    async (id: string, replay: boolean): Promise<boolean> => {
      const { feed: f, dots: d, t } = latest.current;
      const row = f.rows.get(id);
      if (!row || row.read) return false;
      const delivery = f.deliveries.get(id) ?? null;
      const emergency = isEmergencyAlert(row, delivery);
      const entry = d.state.entries.find((e) => e.id === id) ?? null;
      const front = documentAttended();
      // The page on screen shows it: no alert, the page's clearing reads it.
      if (!emergency && !replay && front && entry && f.pageUrl) {
        if (rowsClearedByPage({ ...d.state, entries: [entry] }, f.pageUrl).length > 0) {
          presented.current.add(id);
          return true;
        }
      }
      const text = notificationAlertText(row, delivery, t);
      const link = safeAppPath(row.link ?? null);
      const surface = d.viewer.surface;
      let shown = false;
      if (emergency) {
        toast.error(text.title, {
          id: `notify:${id}`,
          description: text.body || undefined,
          duration: Infinity,
          closeButton: true,
          action: { label: t("notify.alert.acknowledge"), onClick: () => readEmergency(id) },
          onDismiss: () => readEmergency(id),
        });
        shown = front;
      } else if (front) {
        const canOpen = surface === "manager" && link !== null && entry?.feature.kind !== "merchiva";
        toast(text.title, {
          id: `notify:${id}`,
          description: text.body || undefined,
          action: canOpen ? { label: t("notify.alert.open"), onClick: () => openInNewTab(link) } : undefined,
        });
        shown = true;
      }
      if (!front && !replay) {
        // A device surface never navigates to /manager from an OS notification.
        const target = surface === "personal" ? "/personal" : link ?? "/manager";
        shown = (await showOsNotification(id, text.title, text.body, target, row.type)) || shown;
      }
      if (shown) presented.current.add(id);
      if (shown && !emergency && delivery?.push) markNotificationsDelivered([id]);
      return shown;
    },
    [readEmergency],
  );

  // Baseline per connection, then queue what is new.
  useEffect(() => {
    if (!enabled || !feed.rowsReady || !feed.connectionKey) return;
    const now = Date.now();
    const base = baseline.current;
    if (!base || base.key !== feed.connectionKey) {
      baseline.current = { key: feed.connectionKey, ids: new Set(feed.rows.keys()), at: now };
      handled.current.clear();
      presented.current.clear();
      return;
    }
    for (const [id, row] of feed.rows) {
      if (row.read || base.ids.has(id) || handled.current.has(id)) continue;
      if (now - base.at < BASELINE_GRACE_MS) {
        base.ids.add(id);
        continue;
      }
      handled.current.add(id);
      const timer = setTimeout(() => {
        timers.current.delete(id);
        void present(id, false).finally(() => setSettled((n) => n + 1));
      }, ALERT_SETTLE_MS);
      timers.current.set(id, timer);
    }
  }, [enabled, feed.rows, feed.rowsReady, feed.connectionKey, present]);

  // A connection's backlog may replay once its rows are in (the grace after its first snapshot).
  const [replayKey, setReplayKey] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled || !feed.rowsReady || !feed.connectionKey || replayKey === feed.connectionKey) return;
    const key = feed.connectionKey;
    const timer = setTimeout(() => setReplayKey(key), BASELINE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [enabled, feed.rowsReady, feed.connectionKey, replayKey]);
  const backlogOpen = enabled && replayKey !== null && replayKey === feed.connectionKey;

  // An unread SOS alerts again on every new connection.
  const sosReplayedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!backlogOpen || sosReplayedFor.current === replayKey) return;
    sosReplayedFor.current = replayKey;
    const { feed: f } = latest.current;
    const cutoff = Date.now() - NOTIFY_DOT_WINDOW_MS;
    for (const [id, row] of f.rows) {
      if (row.read || timestampMs(row.createdAt) < cutoff) continue;
      if (isEmergencyAlert(row, f.deliveries.get(id))) void present(id, true);
    }
  }, [backlogOpen, replayKey, present]);

  // Alert-only rows (an SOS only on dismiss), while someone is at the screen: read the ones
  // presented, show the ones nobody was shown (newest few, the rest as one "N more").
  useEffect(() => {
    if (!backlogOpen || !attended) return;
    const { feed: f, dots: d, t } = latest.current;
    const plan = planAlertOnly({
      ids: d.state.alertOnlyIds,
      presented: presented.current,
      pending: (id) => timers.current.has(id),
      skip: (id) => {
        const row = f.rows.get(id);
        return !row || isEmergencyAlert(row, f.deliveries.get(id));
      },
    });
    if (plan.read.length > 0) d.markRead(plan.read);
    for (const id of plan.replay) {
      void present(id, true).then((shown) => {
        if (shown) latest.current.dots.markRead([id]);
      });
    }
    if (plan.fold.length > 0) {
      toast(fmt(t("notify.alert.more"), { count: plan.fold.length }), { id: `notify:more:${replayKey}` });
      for (const id of plan.fold) presented.current.add(id);
      d.markRead(plan.fold);
    }
  }, [backlogOpen, attended, replayKey, dots.state.alertOnlyIds, settled, present]);

  // public/sw.js asks a focused tab whether a push is dealt with here; no answer (another
  // store's row, a backlog row, no runtime on that page) and it raises the OS notification.
  useEffect(() => {
    if (!enabled || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const container = navigator.serviceWorker;
    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      const port = event.ports[0];
      if (!port || !data || typeof data !== "object" || (data as { type?: unknown }).type !== "merchiva:push") return;
      const payload = (data as { payload?: { id?: unknown } }).payload;
      const { feed: f } = latest.current;
      const handledHere = pushHandledHere(typeof payload?.id === "string" ? payload.id : null, {
        presented: presented.current,
        pending: (id) => timers.current.has(id),
        read: (id) => f.rows.get(id)?.read ?? null,
      });
      port.postMessage({ handled: handledHere });
    };
    container.addEventListener("message", onMessage);
    container.startMessages();
    return () => container.removeEventListener("message", onMessage);
  }, [enabled]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);
}
