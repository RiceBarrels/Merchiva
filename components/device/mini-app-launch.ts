// Geometry of the device surfaces' app launch (./mini-app-shell.tsx).
//
// One progress value drives the whole launch: 0 is the home screen, 1 is the
// app covering the surface. The window's clip grows from the tapped icon to
// the full surface while its content zooms out of the icon, a splash in the
// tile's own tint covers the content early on, and the home screen behind
// recedes. Closing plays the same frames backwards into the app's tile.
//
// Everything here is pure (no DOM), so the frames are unit-tested.

import type { Transition } from "motion/react";

/** A box in surface coordinates: px from the surface's top-left corner. */
export interface LaunchBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaunchGeometry {
  /** The surface the app covers. */
  w: number;
  h: number;
  /** The app's icon with the home screen at rest, and its corner radius. */
  icon: LaunchBox & { r: number };
  /** Corner radius of the window as it reaches the full surface. */
  screenRadius: number;
}

/** How far the home screen recedes behind an open app (about its centre). */
export const HOME_SCALE = 0.94;
/** Black laid over the receded home screen. */
export const HOME_DIM = 0.35;
/** Corner radius of the receded home screen. */
export const HOME_RADIUS_PX = 20;
/** Size the splash glyph is rendered at; frames only ever scale it down. */
export const SPLASH_GLYPH_PX = 64;

/** Progress over which the splash fades out (and back in on the way home). */
const SPLASH_FADE_FROM = 0.55;
const SPLASH_FADE_TO = 0.9;
/** A tile's glyph is ~53% of its icon (32 of 60px, 40 of 76px). */
const GLYPH_RATIO = 0.53;
/** The splash glyph grows to this many times its size on the tile. */
const GLYPH_GROWTH = 1.5;
/** Without an icon the window fades in from (and out to) this scale. */
const FADE_SCALE = 0.86;

// Rest thresholds are in progress units: 0.002 is under a pixel on a phone,
// and the default speed threshold would keep a sub-pixel tail running.
/** Opening: critically damped, at rest in ~420ms. A spring keeps its velocity when a close reverses it. */
export const OPEN_SPRING: Transition = { type: "spring", stiffness: 400, damping: 40, restDelta: 0.002, restSpeed: 0.05 };
/** Closing: quicker, at rest in ~350ms. */
export const CLOSE_SPRING: Transition = { type: "spring", stiffness: 600, damping: 49, restDelta: 0.002, restSpeed: 0.05 };
/** Reduced motion: a short cross-fade, no zoom and no splash. */
export const REDUCED_FADE: Transition = { duration: 0.12, ease: "easeOut" };

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Rounded so a vanishing value never prints as `1e-7px`. */
const px = (v: number) => `${Math.round(v * 100) / 100}px`;

/** The home screen's scale at progress p. */
export function homeScaleAt(p: number): number {
  return lerp(1, HOME_SCALE, clamp01(p));
}

/**
 * The icon's box with the home screen at rest, from a measurement taken with
 * the home at `scale`: the icon's centre in surface coordinates, and its
 * layout size (offsetWidth / offsetHeight), which no transform changes —
 * neither the recede nor the tile's own press. Null when the box is empty or
 * not inside the surface (off screen, on the other page of a PagesTrack).
 */
export function iconAtRest(
  measured: { cx: number; cy: number; w: number; h: number },
  surface: { w: number; h: number },
  scale: number,
): LaunchBox | null {
  const { w, h } = measured;
  if (!(w > 0 && h > 0 && surface.w > 0 && surface.h > 0 && scale > 0)) return null;
  const x = surface.w / 2 + (measured.cx - surface.w / 2) / scale - w / 2;
  const y = surface.h / 2 + (measured.cy - surface.h / 2) / scale - h / 2;
  const slack = 1;
  if (x < -slack || y < -slack || x + w > surface.w + slack || y + h > surface.h + slack) return null;
  return { x: Math.min(Math.max(0, x), surface.w - w), y: Math.min(Math.max(0, y), surface.h - h), w, h };
}

/** What a launch path was measured for: the app and the icon that was tapped. */
export interface LaunchTarget {
  appId: string | null;
  origin: object | null;
}

/**
 * Whether the window needs a newly measured path at progress `from`. A launch
 * from the home screen starts at the tapped icon and a close aims at the
 * current app's icon, so both measure. A reopen that reverses a close keeps
 * the path it is on, unless it opens another app (or another copy of the
 * icon) than the one the path leads to: that app grows out of its own icon.
 */
export function needsNewPath(present: boolean, from: number, measuredFor: LaunchTarget | null, target: LaunchTarget): boolean {
  if (!present || from <= 0) return true;
  return measuredFor === null || measuredFor.appId !== target.appId || measuredFor.origin !== target.origin;
}

export interface LaunchFrame {
  /** The window's clip-path. */
  clipPath: string;
  /** The content's zoom: translate, then scale from its top-left corner. */
  stage: { x: number; y: number; scale: number };
  /** The splash's tint stretched over the clip: translate, then scale from its top-left corner. */
  tint: { x: number; y: number; sx: number; sy: number };
  /** The splash glyph (rendered at SPLASH_GLYPH_PX), centred in the clip. */
  glyph: { x: number; y: number; scale: number };
  splashOpacity: number;
}

/** The launch at progress p: at 0 the window is exactly the icon, at 1 it covers the surface. */
export function launchFrame(progress: number, geo: LaunchGeometry): LaunchFrame {
  const p = clamp01(progress);
  const { w: W, h: H, icon } = geo;
  // The icon rides on the receding home screen, so the path starts from
  // where the icon is at this progress, not where it was at rest.
  const s = homeScaleAt(p);
  const ix = W / 2 + (icon.x - W / 2) * s;
  const iy = H / 2 + (icon.y - H / 2) * s;
  const top = lerp(iy, 0, p);
  const right = lerp(W - ix - icon.w * s, 0, p);
  const bottom = lerp(H - iy - icon.h * s, 0, p);
  const left = lerp(ix, 0, p);
  const cw = W - left - right;
  const ch = H - top - bottom;
  // The content covers the clip, anchored to its top so the app's first row
  // grows out of the icon.
  const k = Math.max(cw / W, ch / H);
  const glyph = lerp(icon.w * GLYPH_RATIO * s, icon.w * GLYPH_RATIO * GLYPH_GROWTH, p);
  return {
    clipPath: `inset(${px(top)} ${px(right)} ${px(bottom)} ${px(left)} round ${px(lerp(icon.r * s, geo.screenRadius, p))})`,
    stage: { x: left + (cw - W * k) / 2, y: top, scale: k },
    tint: { x: left, y: top, sx: cw / W, sy: ch / H },
    glyph: { x: left + (cw - glyph) / 2, y: top + (ch - glyph) / 2, scale: glyph / SPLASH_GLYPH_PX },
    splashOpacity: 1 - clamp01((p - SPLASH_FADE_FROM) / (SPLASH_FADE_TO - SPLASH_FADE_FROM)),
  };
}

/** No icon to zoom from (opened by a link, the icon off screen): the window fades and scales about its centre. */
export function fadeFrame(progress: number): { opacity: number; scale: number } {
  const p = clamp01(progress);
  return { opacity: p, scale: lerp(FADE_SCALE, 1, p) };
}

/** `translate(x, y) scale(sx, sy)` with px rounding. */
export function transformCss(x: number, y: number, sx: number, sy: number = sx): string {
  const n = (v: number) => Math.round(v * 100000) / 100000;
  return `translate(${px(x)}, ${px(y)}) scale(${n(sx)}, ${n(sy)})`;
}
