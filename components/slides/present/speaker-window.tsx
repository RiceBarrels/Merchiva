"use client";

// The speaker view's own window on the web (slides.md §9): a same-origin about:blank popup that the speaker view is
// portaled into, so both windows share one React tree, one Y.Doc and one SpacetimeDB connection. A popup opened on
// an app URL would boot a second browser shell on a copy of the person's tabs (F23), so it never gets a URL.
//
// The popup gets the main document's stylesheets (and any added later, e.g. by a dev reload) and the <html> and
// <body> attributes (theme class, dir, lang), kept in sync while it is open. Its name carries the provider's session
// id, so two tabs presenting at once open two windows and never reuse one another's. Closing the popup reports
// onClosed; a blocked popup (window.open returned null) reports onBlocked.
//
// The popup is an external store: the effect acquires it and a release closes it on the next task unless the effect
// runs again first (StrictMode re-runs effects at once, and a second window.open would need a new user gesture).
import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { PresenterWindowContext } from "@/components/slides/present/presenter-window-context";
import { Latest } from "@/lib/slides/editor/latest";

export interface SpeakerWindowProps {
  open: boolean;
  title: string;
  /** provider.sessionId: part of the window name, so another tab's speaker window is never reused. */
  sessionId: string;
  /** The person closed the popup. */
  onClosed(): void;
  /** The browser blocked the popup; the caller falls back to the in-window speaker view. */
  onBlocked?(): void;
  /** The popup's Window while it is open, null otherwise (its key listener needs it). */
  onWindow?(win: Window | null): void;
  children: ReactNode;
}

const POPUP_FEATURES = "popup,width=1100,height=700";
/** How often a closed popup is noticed when it fired no pagehide (ms). */
const CLOSED_POLL_MS = 1000;

interface PopupSnapshot {
  win: Window;
  host: HTMLElement;
}

function isMirroredStyle(node: Node): node is HTMLElement {
  if (node.nodeType !== 1) return false;
  const el = node as HTMLElement;
  return el.tagName === "STYLE" || (el.tagName === "LINK" && (el as HTMLLinkElement).rel === "stylesheet");
}

/** Copies `from`'s attributes onto `to`, removing the ones `from` no longer has. */
function syncAttributes(from: Element, to: Element): void {
  for (const attr of Array.from(to.attributes)) if (!from.hasAttribute(attr.name)) to.removeAttribute(attr.name);
  for (const attr of Array.from(from.attributes)) if (to.getAttribute(attr.name) !== attr.value) to.setAttribute(attr.name, attr.value);
}

/** Sets up the popup's document; returns the portal host and the function that stops mirroring. */
function preparePopup(win: Window, title: string): { host: HTMLElement; stop: () => void } {
  const doc = win.document;
  const source = window.document;
  doc.title = title;
  doc.head.replaceChildren();
  doc.body.replaceChildren();
  const copyStyle = (node: Node) => {
    if (!isMirroredStyle(node)) return;
    const clone = doc.importNode(node, true) as HTMLElement;
    // about:blank may resolve relative URLs differently: keep the absolute one.
    if (clone.tagName === "LINK") (clone as HTMLLinkElement).href = (node as HTMLLinkElement).href;
    doc.head.appendChild(clone);
  };
  source.querySelectorAll('style, link[rel="stylesheet"]').forEach(copyStyle);
  syncAttributes(source.documentElement, doc.documentElement);
  syncAttributes(source.body, doc.body);
  const host = doc.createElement("div");
  host.style.height = "100%";
  host.style.width = "100%";
  host.style.flex = "1 1 auto";
  host.style.minHeight = "0";
  doc.body.appendChild(host);

  const styles = new MutationObserver((records) => {
    for (const record of records) record.addedNodes.forEach(copyStyle);
  });
  styles.observe(source.head, { childList: true });
  const attributes = new MutationObserver(() => {
    syncAttributes(source.documentElement, doc.documentElement);
    syncAttributes(source.body, doc.body);
  });
  attributes.observe(source.documentElement, { attributes: true });
  attributes.observe(source.body, { attributes: true });
  return {
    host,
    stop: () => {
      styles.disconnect();
      attributes.disconnect();
    },
  };
}

class SpeakerPopup {
  private snap: PopupSnapshot | null = null;
  private readonly listeners = new Set<() => void>();
  private pendingClose: number | null = null;
  private teardown: (() => void) | null = null;
  /** The last open attempt was blocked (StrictMode's second attempt then reports nothing new). */
  private blocked = false;

  /** `onClosed` runs when the person closes the popup (not when this closes it). */
  constructor(private readonly onClosed: () => void) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): PopupSnapshot | null => this.snap;

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }

  /**
   * Opens the popup, or keeps the one already open. "blocked" when the browser refused it; "blockedAgain" when the
   * attempt before this one was refused too (already reported).
   */
  acquire(name: string, title: string): "open" | "blocked" | "blockedAgain" {
    if (this.pendingClose !== null) {
      window.clearTimeout(this.pendingClose);
      this.pendingClose = null;
    }
    if (this.snap && !this.snap.win.closed) return "open";
    this.drop();
    const win = window.open("", name, POPUP_FEATURES);
    if (!win) {
      const again = this.blocked;
      this.blocked = true;
      return again ? "blockedAgain" : "blocked";
    }
    this.blocked = false;
    let prepared: { host: HTMLElement; stop: () => void };
    try {
      prepared = preparePopup(win, title);
    } catch (err) {
      console.error("[slides] could not set up the speaker window", err);
      win.close();
      return "blocked";
    }
    const lost = () => {
      if (this.snap?.win !== win) return;
      this.drop();
      this.onClosed();
    };
    const poll = window.setInterval(() => {
      if (win.closed) lost();
    }, CLOSED_POLL_MS);
    const closeWithOpener = () => win.close();
    win.addEventListener("pagehide", lost);
    window.addEventListener("pagehide", closeWithOpener);
    this.teardown = () => {
      prepared.stop();
      window.clearInterval(poll);
      window.removeEventListener("pagehide", closeWithOpener);
      try {
        win.removeEventListener("pagehide", lost);
      } catch {
        // Already gone.
      }
    };
    this.snap = { win, host: prepared.host };
    this.emit();
    try {
      win.focus();
    } catch {
      // Focus is the browser's call.
    }
    return "open";
  }

  /** Closes the popup on the next task, unless acquire() runs before then. */
  release(): void {
    if (this.pendingClose !== null) window.clearTimeout(this.pendingClose);
    this.pendingClose = window.setTimeout(() => {
      this.pendingClose = null;
      this.close();
    }, 0);
  }

  close(): void {
    const snap = this.snap;
    this.drop();
    if (snap && !snap.win.closed) {
      try {
        snap.win.close();
      } catch {
        // Already closing.
      }
    }
  }

  setTitle(title: string): void {
    const win = this.snap?.win;
    if (!win || win.closed) return;
    try {
      win.document.title = title;
    } catch {
      // The popup went away between the check and the write.
    }
  }

  /** Forgets the popup (without closing it) and tells the subscribers. */
  private drop(): void {
    this.teardown?.();
    this.teardown = null;
    if (this.snap === null) return;
    this.snap = null;
    this.emit();
  }
}

function windowName(sessionId: string): string {
  return `merchiva-slides-speaker-${sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64)}`;
}

export function SpeakerWindow({ open, title, sessionId, onClosed, onBlocked, onWindow, children }: SpeakerWindowProps): React.JSX.Element | null {
  const [latest] = useState(() => new Latest({ title, onClosed, onBlocked, onWindow }));
  const [popup] = useState(() => new SpeakerPopup(() => latest.get().onClosed()));
  useLayoutEffect(() => {
    latest.set({ title, onClosed, onBlocked, onWindow });
  });
  const snap = useSyncExternalStore(popup.subscribe, popup.getSnapshot, () => null);

  useLayoutEffect(() => {
    if (!open) return;
    const result = popup.acquire(windowName(sessionId), latest.get().title);
    if (result === "blocked") latest.get().onBlocked?.();
    if (result !== "open") return;
    return () => popup.release();
  }, [open, sessionId, popup, latest]);

  useEffect(() => {
    popup.setTitle(title);
  }, [popup, title]);

  const win = snap?.win ?? null;
  useEffect(() => {
    latest.get().onWindow?.(win);
  }, [latest, win]);

  if (!snap) return null;
  return createPortal(<PresenterWindowContext.Provider value={snap.win}>{children}</PresenterWindowContext.Provider>, snap.host);
}
