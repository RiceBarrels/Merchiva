// Following a notification's `link`. It is attacker-controlled: createNotification
// is a client-callable reducer that checks only that sender and target are
// members of the store, so a staff member can hand the owner a
// `javascript:fetch(…localStorage…)` link. Only http(s) is followed (an app
// path resolves to this origin's https URL), the same rule the browser shell's
// notification menus apply; anything else does nothing.

export function notificationHref(link: string, base: string): string | null {
  let url: URL;
  try {
    url = new URL(link, base);
  } catch {
    return null;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
}

export function followNotificationLink(link: string | null | undefined): void {
  if (!link || typeof window === "undefined") return;
  const href = notificationHref(link, window.location.href);
  if (href) window.location.assign(href);
}
