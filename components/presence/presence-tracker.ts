"use client";

import { useEffect, useState } from "react";
import { PAGE_ANCHOR, PRESENCE_OFF_SELECTOR } from "@/lib/presence/anchor";
import { describeClick, pageRegion, type ClickSpot } from "@/lib/presence/dom";
import { isAgentSlot, presenceActivity, presencePathOf } from "@/lib/presence/path";
import { PRESENCE_HEARTBEAT_MS } from "@/lib/presence/rows";
import type { AiFocus } from "@/lib/merchiva/ai-focus";
import { removePagePresence, upsertPagePresence } from "@/lib/spacetimedb/actions";

/*
 * Publishes this window to page_presence: one 'user' row for the tab on screen (where its person
 * last clicked) and one 'agent' row per Mr. Merchiva of this window that is working. Everything is
 * best effort — the actions swallow errors and are no-ops while disconnected — and the module
 * removes a connection's rows when it disconnects, so a republish follows every reconnect.
 */

/** Clicks closer together than this are sent as one update carrying the latest click. */
const CLICK_SEND_GAP_MS = 150;
/** Clicks in the Mr. Merchiva dock are the chat, not the page. */
const DOCK_SELECTOR = "[data-merchiva-chat]";
/** "Arrived, no click yet": the viewer points at the page heading. */
const ARRIVED: ClickSpot = { anchor: PAGE_ANCHOR, anchorX: 0.5, anchorY: 0.5, pointX: 0.5, pointY: 0 };

/** The 'user' row of this window: page, last click, click counter, throttled sends. */
class PersonSender {
  private org: string | null = null;
  private path: string | null = null;
  private spot: ClickSpot = ARRIVED;
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSent = 0;
  private published = false;

  /** A new page (or org / connection): the cursor starts at the page heading again. */
  setPage(org: string | null, path: string | null): void {
    this.org = org;
    this.path = path;
    this.spot = ARRIVED;
    if (org && path) this.flush();
    else this.leave();
  }

  get active(): boolean {
    return this.org !== null && this.path !== null;
  }

  click(spot: ClickSpot): void {
    if (!this.active) return;
    this.spot = spot;
    this.seq = (this.seq + 1) >>> 0;
    if (this.timer !== null) return;
    this.timer = setTimeout(() => this.flush(), Math.max(0, this.lastSent + CLICK_SEND_GAP_MS - Date.now()));
  }

  /** Refreshes the row (heartbeat, page shown again). */
  refresh(): void {
    if (this.active) this.flush();
  }

  /** Removes the row (page hidden for good, unmount). */
  leave(): void {
    this.cancel();
    if (!this.published) return;
    this.published = false;
    void removePagePresence("user", "");
  }

  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private flush(): void {
    this.cancel();
    if (!this.org || !this.path) return;
    this.lastSent = Date.now();
    this.published = true;
    void upsertPagePresence({
      organizationId: this.org,
      kind: "user",
      slot: "",
      pagePath: this.path,
      ...this.spot,
      clickSeq: this.seq,
      activity: "",
    });
  }
}

/**
 * The 'user' row of this window. `pagePath` is the page key of the tab on screen
 * (`presencePageKeyOf`: never its query, a hashed record segment for a document), so opening another
 * document starts the cursor at its heading again. Clicks are captured once for the whole document
 * and only count inside the page region.
 */
export function usePersonPresence(
  organizationId: string | null,
  pagePath: string | null,
  connectionId: string | null,
  rtl: boolean,
): void {
  const [sender] = useState(() => new PersonSender());

  useEffect(() => {
    sender.setPage(connectionId ? organizationId : null, pagePath);
  }, [sender, organizationId, pagePath, connectionId]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!event.isTrusted || !sender.active) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(PRESENCE_OFF_SELECTOR) || target.closest(DOCK_SELECTOR)) return;
      const region = pageRegion();
      if (!region || !region.contains(target)) return;
      // detail 0: activated from the keyboard, so there is no pointer position.
      sender.click(describeClick(target, event.clientX, event.clientY, event.detail === 0, region, rtl));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [sender, rtl]);

  useEffect(() => {
    const heartbeat = setInterval(() => sender.refresh(), PRESENCE_HEARTBEAT_MS);
    const onHide = () => sender.leave();
    const onShow = () => sender.refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") sender.refresh();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("visibilitychange", onVisibility);
      sender.leave();
    };
  }, [sender]);
}

/** The 'agent' rows of this window: one per chat scope with a Mr. Merchiva focus. */
class AgentSender {
  private org: string | null = null;
  private focus: readonly AiFocus[] = [];
  /** slot → what was last sent for it. */
  private readonly sent = new Map<string, string>();

  sync(org: string | null, focus: readonly AiFocus[]): void {
    if (org !== this.org) this.leave();
    this.org = org;
    this.focus = focus;
    this.send(false);
  }

  /** Re-sends every row, changed or not. */
  refresh(): void {
    this.send(true);
  }

  /** The connection changed: the module already dropped the old connection's rows. */
  reset(): void {
    this.sent.clear();
    this.send(true);
  }

  leave(): void {
    for (const slot of this.sent.keys()) void removePagePresence("agent", slot);
    this.sent.clear();
  }

  private send(force: boolean): void {
    const org = this.org;
    const live = new Set<string>();
    if (org) {
      for (const f of this.focus) {
        const pagePath = presencePathOf(f.route);
        if (!pagePath || !isAgentSlot(f.scope)) continue;
        live.add(f.scope);
        const activity = presenceActivity(f.tool);
        const signature = `${org}\n${pagePath}\n${f.anchor}\n${f.seq}\n${activity}`;
        if (!force && this.sent.get(f.scope) === signature) continue;
        this.sent.set(f.scope, signature);
        void upsertPagePresence({
          organizationId: org,
          kind: "agent",
          slot: f.scope,
          pagePath,
          anchor: f.anchor,
          anchorX: 0.5,
          anchorY: 0.5,
          pointX: 0.5,
          pointY: 0,
          clickSeq: f.seq,
          activity,
        });
      }
    }
    for (const slot of Array.from(this.sent.keys())) {
      if (live.has(slot)) continue;
      this.sent.delete(slot);
      void removePagePresence("agent", slot);
    }
  }
}

/**
 * Publishes this window's Mr. Merchiva cursors (lib/merchiva/ai-focus.ts) so the rest of the org
 * sees them: slot = the chat scope, pagePath = the page he works on, clickSeq = his move counter,
 * activity = the tool or action. A focus that ends removes its row.
 */
export function useAgentPresence(
  focus: readonly AiFocus[],
  organizationId: string | null,
  connectionId: string | null,
): void {
  const [sender] = useState(() => new AgentSender());

  useEffect(() => {
    if (connectionId) sender.reset();
  }, [sender, connectionId]);

  useEffect(() => {
    sender.sync(connectionId ? organizationId : null, focus);
  }, [sender, focus, organizationId, connectionId]);

  useEffect(() => {
    const heartbeat = setInterval(() => sender.refresh(), PRESENCE_HEARTBEAT_MS);
    const onHide = () => sender.leave();
    const onShow = () => sender.refresh();
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("pageshow", onShow);
      sender.leave();
    };
  }, [sender]);
}
