import { activeSectionHref } from "@/components/browser-shell/desktop/sidebar/sidebar-nav";
import { SIDEBAR_ELEMENT_ID } from "@/components/browser-shell/desktop/sidebar/sidebar-state";
import { resolveLegacyRedirect } from "@/lib/browser-shell/routes";
import { activeTabRoot } from "@/lib/browser-shell/scroll";
import type { NavSection } from "@/lib/browser-shell/types";
import { PRESENCE_ID_ATTR, describeAnchor, isPageAnchor, navPresenceId, resolveAnchor } from "./anchor";
import { fractionIn, isTransformActive, pinInside, pointIn, type Box, type Point } from "./geometry";

/*
 * The DOM side of page presence: what a click is anchored to, and where a cursor goes on this
 * viewer's screen. Page lookups are scoped to the active tab's slot (activeTabRoot, contract G):
 * kept-alive background tabs stay in the document.
 */

/** Where a cursor is drawn, in viewport pixels; `dim` when its target is scrolled out of view. */
export interface Placement {
  readonly x: number;
  readonly y: number;
  readonly dim: boolean;
}

/** What a published click says: its anchor and the two fallbacks' fractions. */
export interface ClickSpot {
  readonly anchor: string;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly pointX: number;
  readonly pointY: number;
}

/** Last resolution of one cursor's anchor, reused for a moment (measuring runs every frame of a scroll). */
export interface AnchorCache {
  anchor: string;
  root: Element | null;
  element: Element | null;
  /** The element's clipping ancestors below the root (`clippingAncestors`), innermost first. */
  clips: readonly Element[];
  at: number;
}

const RESOLVE_TTL_MS = 1000;
/** Cursors stay this far inside the page region when their target is off screen. */
const EDGE_MARGIN = 4;

export function createAnchorCache(): AnchorCache {
  return { anchor: "", root: null, element: null, clips: [], at: Number.NEGATIVE_INFINITY };
}

/** The browser shell's page region (only one of the two exists at a time). */
export function pageRegion(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById("desktop-content") ?? document.getElementById("mobile-content");
}

export function isDisplayed(el: Element): boolean {
  return el.isConnected && el.getClientRects().length > 0;
}

/**
 * What page anchors are described and resolved in: the active tab's slot in the browser shell, the
 * page region itself in the legacy shell (no slots). Clicks and cursors use the same root.
 */
function pageRootIn(region: HTMLElement): HTMLElement {
  return activeTabRoot() ?? region;
}

/** The two overflow values of an element (overflow-x, overflow-y). */
export type OverflowOf = (el: Element) => readonly [string, string];

const computedOverflow: OverflowOf = (el) => {
  const style = getComputedStyle(el);
  return [style.overflowX, style.overflowY];
};

/**
 * The ancestors of `el` below `root` that clip it — any overflow but `visible` (auto, scroll,
 * hidden, clip) — innermost first. A row scrolled out of a short inner list is hidden by that list,
 * so its cursor must pin to the list's edge, not float over whatever lies below it.
 */
export function clippingAncestors(el: Element, root: Element, overflowOf: OverflowOf = computedOverflow): Element[] {
  const out: Element[] = [];
  for (let node = el.parentElement; node && node !== root; node = node.parentElement) {
    const [x, y] = overflowOf(node);
    if ((x && x !== "visible") || (y && y !== "visible")) out.push(node);
  }
  return out;
}

/** Describes a click on `target` inside `region`. Keyboard activation has no pointer: the element's centre. */
export function describeClick(
  target: Element,
  clientX: number,
  clientY: number,
  keyboard: boolean,
  region: HTMLElement,
  rtl: boolean,
): ClickSpot {
  const root = pageRootIn(region);
  const described = root.contains(target) ? describeAnchor(target, root) : null;
  const element = (described?.element as Element | undefined) ?? target;
  const box = element.getBoundingClientRect();
  const x = keyboard ? box.left + box.width / 2 : clientX;
  const y = keyboard ? box.top + box.height / 2 : clientY;
  const inElement = fractionIn(box, x, y, rtl);
  const inRegion = fractionIn(region.getBoundingClientRect(), x, y, rtl);
  return {
    anchor: described?.anchor ?? "",
    anchorX: inElement.x,
    anchorY: inElement.y,
    pointX: inRegion.x,
    pointY: inRegion.y,
  };
}

function firstDisplayed(list: NodeListOf<Element>): Element | null {
  for (let i = 0; i < list.length; i++) if (isDisplayed(list[i])) return list[i];
  return null;
}

/** Just under the start of the page heading, else the top start corner of the page region. */
function pageTopPoint(root: Element, region: Box, rtl: boolean): Point {
  const heading = firstDisplayed(root.querySelectorAll("h1")) ?? firstDisplayed(root.querySelectorAll("h2"));
  if (heading) {
    const r = heading.getBoundingClientRect();
    const inset = Math.min(12, r.width / 2);
    return { x: rtl ? r.right - inset : r.left + inset, y: r.bottom - 2 };
  }
  return { x: rtl ? region.left + region.width - 24 : region.left + 24, y: region.top + 24 };
}

function resolveCached(cache: AnchorCache, root: Element, anchor: string): Element | null {
  const now = performance.now();
  const cached = cache.element;
  if (
    cache.anchor === anchor &&
    cache.root === root &&
    now - cache.at < RESOLVE_TTL_MS &&
    (!cached || isDisplayed(cached))
  ) {
    return cached;
  }
  const element = resolveAnchor(root, anchor, (node) => isDisplayed(node as Element)) as Element | null;
  // Read with the element, so computed styles are read at most once per RESOLVE_TTL_MS, not per frame.
  cache.clips = element ? clippingAncestors(element, root) : [];
  cache.anchor = anchor;
  cache.root = root;
  cache.element = element;
  cache.at = now;
  return element;
}

/** The page region and the element page anchors resolve in, or null while cursors must hide. */
function pageFrame(): { box: DOMRect; root: Element } | null {
  const region = pageRegion();
  // A DynamicUIElement dialog pushes and scales the page region: hide rather than point beside it.
  if (!region || !isDisplayed(region) || isTransformActive(region.style.transform)) return null;
  const box = region.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;
  return { box, root: pageRootIn(region) };
}

/** `p` pinned inside `clips` (inner scrollers, then the region or nav list); dim when one of them hides it. */
function placed(p: Point, clips: readonly Box[], margin: number): Placement {
  const c = pinInside(p, clips, margin);
  return { x: c.x, y: c.y, dim: c.outside };
}

/** The boxes a resolved anchor is seen through: its clipping ancestors as they are now, then the region. */
function anchorClips(cache: AnchorCache, region: Box): Box[] {
  return [...cache.clips.map((el) => el.getBoundingClientRect()), region];
}

/** A person's cursor on the viewer's page: their anchor, else the point fallback. */
export function locatePersonCursor(
  spot: ClickSpot,
  rtl: boolean,
  cache: AnchorCache,
): Placement | null {
  const frame = pageFrame();
  if (!frame) return null;
  if (isPageAnchor(spot.anchor)) return placed(pageTopPoint(frame.root, frame.box, rtl), [frame.box], EDGE_MARGIN);
  const el = spot.anchor ? resolveCached(cache, frame.root, spot.anchor) : null;
  if (el) {
    const point = pointIn(el.getBoundingClientRect(), spot.anchorX, spot.anchorY, rtl);
    return placed(point, anchorClips(cache, frame.box), EDGE_MARGIN);
  }
  return placed(pointIn(frame.box, spot.pointX, spot.pointY, rtl), [frame.box], EDGE_MARGIN);
}

/** The last displayed element in `container` with presence id `nav:<href>` (a sub-page row follows its section row). */
function navRowIn(container: Element, href: string): Element | null {
  const id = navPresenceId(href);
  const rows = container.querySelectorAll(`[${PRESENCE_ID_ATTR}]`);
  let found: Element | null = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].getAttribute(PRESENCE_ID_ATTR) === id && isDisplayed(rows[i])) found = rows[i];
  }
  return found;
}

/**
 * Mr. Merchiva's cursor. On the viewer's page it points at its anchor, else under the page heading;
 * elsewhere it sits on that page's row in the desktop sidebar, or on the row of the section that
 * owns the page when the sub-page row is not rendered. No sidebar (mobile) → not shown off-page.
 */
export function locateAgentCursor(
  target: { readonly route: string; readonly anchor: string },
  onPage: boolean,
  sections: readonly NavSection[],
  rtl: boolean,
  cache: AnchorCache,
): Placement | null {
  if (onPage) {
    const frame = pageFrame();
    if (!frame) return null;
    const el = target.anchor ? resolveCached(cache, frame.root, target.anchor) : null;
    if (el) return placed(pointIn(el.getBoundingClientRect(), 0.5, 0.5, rtl), anchorClips(cache, frame.box), EDGE_MARGIN);
    return placed(pageTopPoint(frame.root, frame.box, rtl), [frame.box], EDGE_MARGIN);
  }
  const sidebar = typeof document === "undefined" ? null : document.getElementById(SIDEBAR_ELEMENT_ID);
  if (!sidebar || !isDisplayed(sidebar)) return null;
  let row = navRowIn(sidebar, target.route);
  if (!row) {
    const section = activeSectionHref(sections, resolveLegacyRedirect(target.route));
    row = section ? navRowIn(sidebar, section) : null;
  }
  if (!row) return null;
  const r = row.getBoundingClientRect();
  const inset = Math.min(44, r.width * 0.35);
  const point = { x: rtl ? r.left + inset : r.right - inset, y: r.top + r.height / 2 };
  // The nav list scrolls: a row scrolled out of it pins to its edge.
  return placed(point, [(row.closest("nav") ?? sidebar).getBoundingClientRect()], 2);
}
