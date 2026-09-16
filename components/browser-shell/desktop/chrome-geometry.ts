/**
 * Desktop chrome sizes in CSS px (desktop spec §3.1). Explicit px keep the strip aligned
 * with Tauri's logical-pixel traffic-light and caption-button insets; the theme spacing
 * unit (0.24rem) would drift about 4% from them.
 *
 * Touch devices at ≥1024px (lead decision Q4) get the same chrome with coarse density:
 * close glyphs always visible and hit targets of at least 36px.
 */
export interface ChromeGeometry {
  /** Tab strip row height. */
  readonly STRIP_H: number;
  /** Tab height; tabs are bottom-aligned in the strip. */
  readonly TAB_H: number;
  readonly TAB_STANDARD_W: number;
  readonly TAB_MIN_W: number;
  readonly TAB_PINNED_W: number;
  /** New-tab / tab-search square buttons. */
  readonly STRIP_BUTTON: number;
  readonly TOOLBAR_H: number;
  readonly OMNIBOX_H: number;
  readonly BOOKMARKS_H: number;
  /** 16 (x) + 3×12 buttons + 2×8 gaps + 10 breathing room. */
  readonly MAC_TRAFFIC_INSET: number;
  /** Lead inset on the web and in macOS fullscreen. */
  readonly LEAD_INSET: number;
  readonly CAPTION_BTN_W: number;
  readonly MIN_DRAG_GAP_NATIVE: number;
  readonly MIN_DRAG_GAP_WEB: number;
  /** Gap between the last tab and the new-tab button. */
  readonly NEW_TAB_GAP: number;
  /** Sidebar panel: default width, drag range and the collapsed icon rail (legacy 140-360). */
  readonly SIDEBAR_W: number;
  readonly SIDEBAR_MIN_W: number;
  readonly SIDEBAR_MAX_W: number;
  readonly SIDEBAR_RAIL_W: number;
  /** Smallest the page region may become while the sidebar is dragged. */
  readonly CONTENT_MIN_W: number;
}

export const CHROME: ChromeGeometry = Object.freeze({
  STRIP_H: 40,
  TAB_H: 32,
  TAB_STANDARD_W: 240,
  TAB_MIN_W: 56,
  TAB_PINNED_W: 40,
  STRIP_BUTTON: 28,
  TOOLBAR_H: 40,
  OMNIBOX_H: 30,
  BOOKMARKS_H: 28,
  MAC_TRAFFIC_INSET: 78,
  LEAD_INSET: 8,
  CAPTION_BTN_W: 46,
  MIN_DRAG_GAP_NATIVE: 64,
  MIN_DRAG_GAP_WEB: 24,
  NEW_TAB_GAP: 4,
  SIDEBAR_W: 232,
  SIDEBAR_MIN_W: 140,
  SIDEBAR_MAX_W: 360,
  SIDEBAR_RAIL_W: 64,
  CONTENT_MIN_W: 360,
});

export const CHROME_COARSE: ChromeGeometry = Object.freeze({
  ...CHROME,
  STRIP_H: 44,
  TAB_H: 36,
  TAB_MIN_W: 72,
  TAB_PINNED_W: 48,
  STRIP_BUTTON: 36,
  TOOLBAR_H: 48,
  OMNIBOX_H: 36,
  BOOKMARKS_H: 36,
  SIDEBAR_W: 248,
  SIDEBAR_RAIL_W: 72,
});

export function chromeGeometry(coarse: boolean): ChromeGeometry {
  return coarse ? CHROME_COARSE : CHROME;
}

/** Slop above the rail width that still counts as collapsed once a drag snapped the panel. */
export const SIDEBAR_RAIL_SLOP = 8;

/** True when a sidebar panel width is the collapsed icon rail rather than a resized sidebar. */
export function isSidebarRail(widthPx: number, geometry: ChromeGeometry = CHROME): boolean {
  return widthPx <= geometry.SIDEBAR_RAIL_W + SIDEBAR_RAIL_SLOP;
}

/** Width of the three Windows/Linux caption buttons. */
export function captionButtonsWidth(geometry: ChromeGeometry): number {
  return geometry.CAPTION_BTN_W * 3;
}

/** Hover card and tooltip delays (desktop spec §3.2, §3.3). */
export const TAB_HOVER_CARD_DELAY_MS = 800;
export const TOOLBAR_TOOLTIP_DELAY_MS = 600;
/** Long-press on Back / Forward opens the history menu. */
export const HISTORY_PRESS_MS = 500;
/** A drag starts once the pointer moved this far. */
export const DRAG_THRESHOLD_PX = 4;
/** Auto-scroll zone at the tablist edges while dragging. */
export const DRAG_EDGE_ZONE_PX = 24;
export const DRAG_EDGE_SCROLL_STEP_PX = 8;
/** Pending spinners appear only after this delay so fast navigations don't flash. */
export const PENDING_SPINNER_DELAY_MS = 150;
/** Page-loaded announcements only for navigations slower than this. */
export const SLOW_LOAD_ANNOUNCE_MS = 1000;
