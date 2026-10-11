import { activeSectionHref, navKeyOf } from "@/components/browser-shell/desktop/sidebar/sidebar-nav";
import { resolveLegacyRedirect } from "@/lib/browser-shell/routes";
import { currentEntry, type BrowserTab, type NavSection, type TabId, type TabUrl } from "@/lib/browser-shell/types";
import { PAGE_ANCHOR } from "./anchor";
import { stripRecordKey } from "./path";

/*
 * Who is where, from page_presence rows plus this window's own tabs. Pure, so the grouping rules —
 * staleness, one avatar per person per row, "you" once, two avatars then "n+" — are unit-tested.
 */

/** Rows older than this are ignored: the module's 90 s TTL plus slack for clock skew and latency. */
export const PRESENCE_STALE_MS = 100_000;
/** How often a live window refreshes its rows (well inside the TTL). */
export const PRESENCE_HEARTBEAT_MS = 30_000;
/** Key of the current user in viewer lists: every tab and window of theirs is one person. */
export const SELF_VIEWER_KEY = "self";

/** A page_presence row as the UI uses it: plain numbers, and `self` when it is this user's identity. */
export interface PresencePeer {
  readonly id: string;
  readonly connectionId: string;
  readonly self: boolean;
  readonly memberId: string;
  readonly kind: string;
  readonly slot: string;
  readonly name: string;
  readonly avatarUrl: string;
  readonly pagePath: string;
  readonly anchor: string;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly pointX: number;
  readonly pointY: number;
  readonly clickSeq: number;
  readonly activity: string;
  readonly updatedAtMs: number;
}

/**
 * Whether a row was refreshed recently enough, on the server's clock (`serverNowMs` is the local
 * clock plus the offset measured from this window's own rows). A stamp from the future is fresh.
 */
export function isFreshPresence(updatedAtMs: number, serverNowMs: number, staleMs = PRESENCE_STALE_MS): boolean {
  return serverNowMs - updatedAtMs <= staleMs;
}

/** Server clock minus local clock, from a stamp the server just wrote for this window. */
export function clockOffsetMs(serverStampMs: number, localNowMs: number): number {
  return serverStampMs - localNowMs;
}

/** Rows of every other window — other people's and this user's own — that are still alive. */
export function livePeers(
  peers: readonly PresencePeer[],
  myConnectionId: string | null,
  serverNowMs: number,
): PresencePeer[] {
  return peers.filter((peer) => peer.connectionId !== myConnectionId && isFreshPresence(peer.updatedAtMs, serverNowMs));
}

/** One person on one page, before it is placed on a nav row. */
export interface ViewerInput {
  readonly key: string;
  readonly self: boolean;
  readonly name: string;
  readonly avatarUrl: string;
  readonly memberId: string;
  readonly url: string;
}

/** One person on a nav row: the section that owns their page and, when listed, its sub-page row. */
export interface NavViewer {
  readonly key: string;
  readonly self: boolean;
  readonly name: string;
  readonly avatarUrl: string;
  readonly memberId: string;
  readonly sectionHref: string | null;
  readonly childHref: string | null;
}

export type NavRowLevel = "section" | "child";

/** The same person across windows: this user, else the org member, else the connection. */
export function personKey(peer: Pick<PresencePeer, "self" | "memberId" | "connectionId">): string {
  if (peer.self) return SELF_VIEWER_KEY;
  return peer.memberId ? `member:${peer.memberId}` : `connection:${peer.connectionId}`;
}

/**
 * The nav key of a row's page (sidebar-nav.ts `navKeyOf`) — a record segment (`presencePageKeyOf`)
 * dropped, so everyone in any document sits on the Docs row.
 */
export function presenceNavKey(pagePath: string): string {
  return navKeyOf(stripRecordKey(pagePath));
}

/** Viewer entries for live 'user' rows (other people, and this user's other windows). */
export function viewersFromPeers(peers: readonly PresencePeer[]): ViewerInput[] {
  return peers
    .filter((peer) => peer.kind === "user")
    .map((peer) => ({
      key: personKey(peer),
      self: peer.self,
      name: peer.name,
      avatarUrl: peer.avatarUrl,
      memberId: peer.memberId,
      url: stripRecordKey(peer.pagePath),
    }));
}

/**
 * URLs of this window's tabs other than the one on screen, for viewersFromTabs. None on the
 * single-tab phone layout (lib/browser-shell/single-tab.ts): its other tabs are hidden, so they
 * are not pages this user is on.
 */
export function otherTabUrlsOf(tabs: readonly BrowserTab[], shownTabId: TabId | null, singleTab: boolean): TabUrl[] {
  return singleTab ? [] : tabs.filter((tab) => tab.id !== shownTabId).map((tab) => currentEntry(tab).url);
}

/** Viewer entries for this user's other in-app tabs (their URLs, the active tab left out). */
export function viewersFromTabs(
  urls: readonly string[],
  me: { readonly name: string; readonly avatarUrl: string; readonly memberId: string },
): ViewerInput[] {
  return urls.map((url) => ({ key: SELF_VIEWER_KEY, self: true, ...me, url }));
}

/** The nav rows a URL sits on: its section row and, when listed, its sub-page row. */
export interface NavPlacement {
  readonly sectionHref: string;
  readonly childHref: string | null;
}

/**
 * Where a URL sits on the nav: the section row that owns it (as the sidebar highlights it, after
 * legacy redirects) and the sub-page row with the same nav key. Null for a page outside the nav
 * (an unlisted route with no parent). Presence avatars and notification dots both use it.
 */
export function placeUrl(url: string, sections: readonly NavSection[]): NavPlacement | null {
  const resolved = resolveLegacyRedirect(url);
  const sectionHref = activeSectionHref(sections, resolved);
  if (sectionHref === null) return null;
  const key = navKeyOf(resolved);
  const child = sections.find((s) => s.href === sectionHref)?.children.find((c) => navKeyOf(c.href) === key);
  return { sectionHref, childHref: child?.href ?? null };
}

/** Places viewers on the nav (placeUrl). Pages outside the nav get no row. */
export function placeViewers(inputs: readonly ViewerInput[], sections: readonly NavSection[]): NavViewer[] {
  const out: NavViewer[] = [];
  for (const input of inputs) {
    const placement = placeUrl(input.url, sections);
    if (placement === null) continue;
    out.push({
      key: input.key,
      self: input.self,
      name: input.name,
      avatarUrl: input.avatarUrl,
      memberId: input.memberId,
      sectionHref: placement.sectionHref,
      childHref: placement.childHref,
    });
  }
  return out;
}

function byPerson(a: NavViewer, b: NavViewer): number {
  if (a.self !== b.self) return a.self ? 1 : -1;
  return a.name.localeCompare(b.name) || a.key.localeCompare(b.key);
}

/**
 * The people on one nav row, one entry each (this user once however many tabs and windows), other
 * people first by name, then "you". A section row whose sub-pages are on screen leaves out the
 * people its sub-page rows already show — the same rule as the row highlight.
 */
export function viewersForRow(
  viewers: readonly NavViewer[],
  href: string,
  level: NavRowLevel,
  childrenVisible = false,
): NavViewer[] {
  const people = new Map<string, NavViewer>();
  for (const viewer of viewers) {
    const onRow =
      level === "child"
        ? viewer.childHref === href
        : viewer.sectionHref === href && !(childrenVisible && viewer.childHref !== null);
    if (!onRow) continue;
    const prev = people.get(viewer.key);
    if (!prev || (!prev.avatarUrl && viewer.avatarUrl)) people.set(viewer.key, viewer);
  }
  return [...people.values()].sort(byPerson);
}

/** The first `max` people as avatars; `extra` is how many the "n+" chip stands for. */
export function avatarStack<T>(people: readonly T[], max = 2): { shown: T[]; extra: number } {
  const shown = people.slice(0, Math.max(0, max));
  return { shown, extra: people.length - shown.length };
}

/** Changes whenever anything a nav badge shows changes (the store skips identical updates). */
export function viewersSignature(viewers: readonly NavViewer[]): string {
  return viewers
    .map((v) => [v.key, v.sectionHref ?? "", v.childHref ?? "", v.name, v.avatarUrl, v.memberId].join("\u0001"))
    .join("\u0002");
}

/** Where a cursor points, as a key: cursors on the same spot are stacked instead of overlapping. */
export function cursorSpotKey(peer: Pick<PresencePeer, "anchor" | "anchorX" | "anchorY" | "pointX" | "pointY">): string {
  if (peer.anchor === PAGE_ANCHOR) return "page";
  if (!peer.anchor) return `point|${peer.pointX.toFixed(3)}|${peer.pointY.toFixed(3)}`;
  return `${peer.anchor}|${peer.anchorX.toFixed(3)}|${peer.anchorY.toFixed(3)}`;
}

/** For each key, how many earlier entries share it (0 for the first). */
export function stackIndexes(keys: readonly string[]): number[] {
  const seen = new Map<string, number>();
  return keys.map((key) => {
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return n;
  });
}
