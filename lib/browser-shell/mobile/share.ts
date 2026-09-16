import { isCapacitorNative } from "@/lib/capacitor";

/*
 * Share helpers for the mobile chrome (mobile-safari spec §15, plan Q5 default).
 * Web Share when the platform has it; otherwise the chrome opens its share drawer.
 */

/** Public origin for links shared from the native app (its own origin is capacitor://localhost). */
export const PUBLIC_APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || "https://project-management-phi-red.vercel.app").replace(/\/+$/, "");

/**
 * Absolute, shareable URL for an in-app href: no `dialogs` param, no trailing slash, and the
 * public origin whenever the app runs from a non-http(s) origin (Capacitor, file previews).
 */
export function buildShareUrl(href: string): string {
  const u = new URL(href, "https://x.invalid");
  u.searchParams.delete("dialogs");
  u.hash = "";
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : u.pathname;
  let origin = PUBLIC_APP_ORIGIN;
  if (typeof window !== "undefined" && !isCapacitorNative() && /^https?:$/.test(window.location.protocol)) {
    origin = window.location.origin;
  }
  return origin + path + u.search;
}

export type NativeShareResult = "shared" | "cancelled" | "unsupported";

/**
 * Opens the system share sheet. Call it synchronously from a click handler (no `await` before
 * it) so the transient user activation is still valid.
 */
export function tryNativeShare(data: { url: string; title: string }): Promise<NativeShareResult> {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return Promise.resolve("unsupported");
  try {
    if (typeof navigator.canShare === "function" && !navigator.canShare({ url: data.url })) {
      return Promise.resolve("unsupported");
    }
    return navigator
      .share({ title: data.title, url: data.url })
      .then((): NativeShareResult => "shared")
      .catch((error: unknown): NativeShareResult =>
        error instanceof DOMException && error.name === "AbortError" ? "cancelled" : "unsupported",
      );
  } catch {
    return Promise.resolve("unsupported");
  }
}

/** Copies text to the clipboard. Rejects when the Clipboard API is unavailable or denied. */
export function copyText(text: string): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
    return Promise.reject(new Error("Clipboard unavailable"));
  }
  return navigator.clipboard.writeText(text);
}

/** Opens a URL in the system browser (Capacitor) or a new browser tab (web). */
export function openExternal(url: string): Promise<void> {
  if (isCapacitorNative()) {
    return import("@capacitor/browser").then(({ Browser }) => Browser.open({ url }));
  }
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  return Promise.resolve();
}
