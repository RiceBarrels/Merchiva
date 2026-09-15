"use client";

// Device permissions the app depends on, asked for once at the door of every
// app surface (/choose, /manager, /personal, /store) by
// components/device-permission-gate.tsx.
//
//   notifications — push alerts (inventory, shift trades, team messages)
//   microphone    — walkie-talkie channels + Mr. Merchiva voice calls
//   camera        — QR log-in on the store device
//   location      — store address / weather-aware forecasting
//
// Status is persisted per device in localStorage so a device that already
// granted everything opens straight into the app; the live browser state is
// re-verified in the background and the gate comes back if anything was
// revoked. "unsupported" counts as satisfied — there's nothing to ask for.

import { isNativeShell } from "@/lib/native-shell";

export const DEVICE_PERMISSION_KINDS = ["notifications", "microphone", "camera", "location"] as const;
export type DevicePermissionKind = (typeof DEVICE_PERMISSION_KINDS)[number];

export type DevicePermissionStatus = "granted" | "prompt" | "denied" | "unsupported";
export type DevicePermissionState = Record<DevicePermissionKind, DevicePermissionStatus>;

const STORAGE_KEY = "merchiva.devicePermissions";

type Saved = { state: Partial<DevicePermissionState>; updatedAt: number };

export function loadSavedPermissions(): Partial<DevicePermissionState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Saved;
    return parsed?.state ?? {};
  } catch {
    return {};
  }
}

export function savePermissions(state: DevicePermissionState): void {
  if (typeof window === "undefined") return;
  try {
    const payload: Saved = { state, updatedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage unavailable — the gate simply re-checks next time.
  }
}

export function isSatisfied(status: DevicePermissionStatus | undefined): boolean {
  return status === "granted" || status === "unsupported";
}

export function allSatisfied(state: Partial<DevicePermissionState>): boolean {
  return DEVICE_PERMISSION_KINDS.every((k) => isSatisfied(state[k]));
}

export function missingKinds(state: Partial<DevicePermissionState>): DevicePermissionKind[] {
  return DEVICE_PERMISSION_KINDS.filter((k) => !isSatisfied(state[k]));
}

// ── Support detection ───────────────────────────────────────────────────────

function notificationsSupported(): boolean {
  if (typeof window === "undefined") return false;
  // Tauri routes notifications through its own plugin; Capacitor's WKWebView
  // has no Notification API at all — both surface as "unsupported" here.
  if (isNativeShell()) return false;
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

function mediaSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

function locationSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.geolocation;
}

// ── Non-prompting status query ──────────────────────────────────────────────

const QUERY_NAME: Record<Exclude<DevicePermissionKind, "notifications">, string> = {
  microphone: "microphone",
  camera: "camera",
  location: "geolocation",
};

// Cache PermissionStatus objects so change listeners can be attached once.
const statusCache = new Map<DevicePermissionKind, PermissionStatus>();

async function queryOne(kind: DevicePermissionKind, saved: Partial<DevicePermissionState>): Promise<DevicePermissionStatus> {
  if (kind === "notifications") {
    if (!notificationsSupported()) return "unsupported";
    const p = Notification.permission;
    return p === "granted" ? "granted" : p === "denied" ? "denied" : "prompt";
  }
  if (kind === "location" ? !locationSupported() : !mediaSupported()) return "unsupported";

  if (typeof navigator !== "undefined" && navigator.permissions?.query) {
    try {
      const status =
        statusCache.get(kind) ??
        (await navigator.permissions.query({ name: QUERY_NAME[kind] as PermissionName }));
      statusCache.set(kind, status);
      if (status.state === "granted") return "granted";
      if (status.state === "denied") return "denied";
      // The browser still says "prompt" for a machine with no such device
      // (e.g. a desktop without a webcam) — a previous ask already found
      // nothing to grant, so don't drag the user back through the gate.
      return saved[kind] === "unsupported" ? "unsupported" : "prompt";
    } catch {
      // Safari throws for camera/microphone — fall through to the saved value.
    }
  }
  // No way to ask the browser quietly: trust what we recorded last time.
  return saved[kind] ?? "prompt";
}

export async function queryDevicePermissions(): Promise<DevicePermissionState> {
  const saved = loadSavedPermissions();
  const entries = await Promise.all(
    DEVICE_PERMISSION_KINDS.map(async (k) => [k, await queryOne(k, saved)] as const),
  );
  return Object.fromEntries(entries) as DevicePermissionState;
}

/** Fires `cb` whenever the browser reports a permission flip (e.g. the user unblocked it in site settings). */
export function subscribeDevicePermissionChanges(cb: () => void): () => void {
  const handlers: Array<[PermissionStatus, () => void]> = [];
  for (const status of statusCache.values()) {
    const h = () => cb();
    status.addEventListener("change", h);
    handlers.push([status, h]);
  }
  return () => {
    for (const [status, h] of handlers) status.removeEventListener("change", h);
  };
}

// ── Prompting request ───────────────────────────────────────────────────────

function isPermissionError(e: unknown): boolean {
  const name = (e as { name?: string } | null)?.name;
  return name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError";
}

async function requestMedia(kind: "microphone" | "camera"): Promise<DevicePermissionStatus> {
  if (!mediaSupported()) return "unsupported";
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === "camera"
        ? { video: { facingMode: { ideal: "environment" } }, audio: false }
        : { audio: true, video: false },
    );
    stream.getTracks().forEach((t) => t.stop());
    return "granted";
  } catch (e) {
    if (isPermissionError(e)) {
      // A dismissed prompt and a hard block both surface as NotAllowedError;
      // the quiet query (where supported) tells them apart afterwards.
      const live = await queryOne(kind, {});
      return live === "granted" ? "granted" : live;
    }
    // NotFoundError / OverconstrainedError: no such device on this machine.
    // Nothing to grant — treat as satisfied so desktops without a webcam pass.
    return "unsupported";
  }
}

function requestLocation(): Promise<DevicePermissionStatus> {
  if (!locationSupported()) return Promise.resolve("unsupported");
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve("granted"),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          // Dismissing the sheet and blocking it share this code — let the
          // quiet query decide whether re-asking is still possible.
          void queryOne("location", {}).then((live) => resolve(live === "granted" ? "granted" : live === "prompt" ? "prompt" : "denied"));
          return;
        }
        // Permission was given but the fix failed / timed out — that's fine.
        resolve("granted");
      },
      { timeout: 10_000, maximumAge: 600_000 },
    );
  });
}

async function requestNotifications(): Promise<DevicePermissionStatus> {
  if (!notificationsSupported()) return "unsupported";
  try {
    const result = await Notification.requestPermission();
    return result === "granted" ? "granted" : result === "denied" ? "denied" : "prompt";
  } catch {
    return "prompt";
  }
}

/** Shows the browser / OS prompt for one permission and returns the outcome. */
export function requestDevicePermission(kind: DevicePermissionKind): Promise<DevicePermissionStatus> {
  switch (kind) {
    case "notifications":
      return requestNotifications();
    case "microphone":
      return requestMedia("microphone");
    case "camera":
      return requestMedia("camera");
    case "location":
      return requestLocation();
  }
}
