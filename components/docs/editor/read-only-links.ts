"use client";

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/** Safe absolute href of a link element, or null. */
export function safeLinkHref(anchor: HTMLAnchorElement): string | null {
  const raw = anchor.getAttribute("href");
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.href);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The link under a click inside the editor content, if any. */
export function linkFromEvent(event: { target: EventTarget | null }): HTMLAnchorElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const anchor = target.closest("a[href]");
  return anchor instanceof HTMLAnchorElement && anchor.closest(".ProseMirror") ? anchor : null;
}

/**
 * While the editor isn't editable (`openOnClick: false`), a click on a document link opens it in a new browser tab
 * (external links never navigate the app tab).
 */
export function openReadOnlyLink(event: React.MouseEvent): void {
  if (event.button !== 0) return;
  const anchor = linkFromEvent(event);
  if (!anchor) return;
  const href = safeLinkHref(anchor);
  event.preventDefault();
  if (href) window.open(href, "_blank", "noopener,noreferrer");
}
