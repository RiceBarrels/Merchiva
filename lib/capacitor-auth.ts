"use client";

import type { PluginListenerHandle } from "@capacitor/core";
import { isCapacitorNative } from "@/lib/capacitor";
import type { AuthCallbackParams } from "@/lib/native-shell";

type AuthCallbackHandler = (params: AuthCallbackParams) => void | Promise<void>;

export function parseCapacitorAuthCallback(rawUrl: string): AuthCallbackParams | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "merchiva:" || url.hostname !== "auth-callback") {
      return null;
    }

    return {
      access_token: url.searchParams.get("access_token") ?? undefined,
      refresh_token: url.searchParams.get("refresh_token") ?? undefined,
      user: url.searchParams.get("user") ?? undefined,
      redirect_to: url.searchParams.get("redirect_to") ?? undefined,
      error: url.searchParams.get("error") ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function openCapacitorAuth(url: string): Promise<void> {
  if (!isCapacitorNative() || !/^https?:\/\//.test(url)) return;

  const { Browser } = await import("@capacitor/browser");
  await Browser.open({
    url,
    presentationStyle: "fullscreen",
    toolbarColor: "#1c1917",
  });
}

export function subscribeCapacitorAuthCallback(
  handler: AuthCallbackHandler,
): () => void {
  if (!isCapacitorNative()) return () => {};

  let appUrlHandle: PluginListenerHandle | null = null;
  let disposed = false;
  const handledUrls = new Set<string>();

  const handleUrl = async (rawUrl: string) => {
    if (handledUrls.has(rawUrl)) return;

    const params = parseCapacitorAuthCallback(rawUrl);
    if (!params) return;

    handledUrls.add(rawUrl);
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.close();
    } catch {
      // Browser.close is a no-op on some platforms and may throw if already closed.
    }

    await handler(params);
  };

  void (async () => {
    try {
      const { App } = await import("@capacitor/app");
      appUrlHandle = await App.addListener("appUrlOpen", (event) => {
        void handleUrl(event.url);
      });

      const launchUrl = await App.getLaunchUrl();
      if (launchUrl?.url) {
        void handleUrl(launchUrl.url);
      }

      if (disposed) {
        void appUrlHandle.remove();
        appUrlHandle = null;
      }
    } catch {
      // If the native plugin is unavailable, leave the normal web flow intact.
    }
  })();

  return () => {
    disposed = true;
    if (appUrlHandle) {
      void appUrlHandle.remove();
      appUrlHandle = null;
    }
  };
}
