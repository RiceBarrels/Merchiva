import { canonicalizeUrl } from "../url";
import type { TabUrl } from "../types";

export type NotificationTarget =
  | { readonly kind: "page"; readonly url: TabUrl }
  | { readonly kind: "window"; readonly href: string };

/**
 * Where tapping a notification may go: a page of the app (opened in the shell) or another
 * http(s) URL (loaded in the window). A notification's `link` is attacker-controlled —
 * createNotification is a client-callable reducer that validates only the sender's membership —
 * so `javascript:`, `data:` and anything unparsable give null and the tap does nothing.
 */
export function notificationTarget(href: string, base: string): NotificationTarget | null {
  const canonical = canonicalizeUrl(href, base);
  if (canonical?.tabbable) return { kind: "page", url: canonical.url };
  let parsed: URL;
  try {
    parsed = new URL(href, base);
  } catch {
    return null;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? { kind: "window", href: parsed.href } : null;
}
