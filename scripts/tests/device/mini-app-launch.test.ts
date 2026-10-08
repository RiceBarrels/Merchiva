// components/device/mini-app-launch.ts: the frames of the device app launch. The window starts exactly on the
// tapped icon, ends covering the surface with nothing left on it, its content always covers its clip, and the
// splash is gone well before the end. Icons measured while the home screen is receded map back to their rest box.
// A reopen that reverses a close keeps its path only while it is for the same app and the same icon.

import { describe, expect, test } from "bun:test";
import {
  HOME_SCALE,
  SPLASH_GLYPH_PX,
  fadeFrame,
  homeScaleAt,
  iconAtRest,
  launchFrame,
  needsNewPath,
  transformCss,
  type LaunchGeometry,
  type LaunchTarget,
} from "@/components/device/mini-app-launch";

const PHONE: LaunchGeometry = { w: 390, h: 844, icon: { x: 16, y: 120, w: 60, h: 60, r: 14 }, screenRadius: 12 };
const TABLET: LaunchGeometry = { w: 1280, h: 800, icon: { x: 1100, y: 640, w: 76, h: 76, r: 17 }, screenRadius: 12 };

/** The clip-path's insets and radius, in px. */
function clipOf(clipPath: string) {
  const m = /^inset\((\S+)px (\S+)px (\S+)px (\S+)px round (\S+)px\)$/.exec(clipPath);
  if (!m) throw new Error(`unexpected clip-path ${clipPath}`);
  const [top, right, bottom, left, radius] = m.slice(1).map(Number);
  return { top, right, bottom, left, radius };
}

const STEPS = Array.from({ length: 21 }, (_, i) => i / 20);

describe("homeScaleAt", () => {
  test("rests at 1, recedes to HOME_SCALE, and clamps a spring's overshoot", () => {
    expect(homeScaleAt(0)).toBe(1);
    expect(homeScaleAt(1)).toBeCloseTo(HOME_SCALE, 10);
    expect(homeScaleAt(-0.2)).toBe(1);
    expect(homeScaleAt(1.2)).toBeCloseTo(HOME_SCALE, 10);
  });
});

describe("iconAtRest", () => {
  const surface = { w: 390, h: 844 };

  test("a measurement with the home at rest is the icon's box", () => {
    expect(iconAtRest({ cx: 46, cy: 150, w: 60, h: 60 }, surface, 1)).toEqual({ x: 16, y: 120, w: 60, h: 60 });
  });

  test("a measurement taken with the home receded maps back to the rest box", () => {
    const s = homeScaleAt(1);
    const cx = surface.w / 2 + (46 - surface.w / 2) * s;
    const cy = surface.h / 2 + (150 - surface.h / 2) * s;
    const box = iconAtRest({ cx, cy, w: 60, h: 60 }, surface, s);
    expect(box?.x).toBeCloseTo(16, 6);
    expect(box?.y).toBeCloseTo(120, 6);
    expect(box?.w).toBe(60);
  });

  test("no box for an empty icon or one outside the surface (the other page of a PagesTrack)", () => {
    expect(iconAtRest({ cx: 46, cy: 150, w: 0, h: 60 }, surface, 1)).toBeNull();
    expect(iconAtRest({ cx: 46 + 390, cy: 150, w: 60, h: 60 }, surface, 1)).toBeNull();
    expect(iconAtRest({ cx: 46, cy: -40, w: 60, h: 60 }, surface, 1)).toBeNull();
  });
});

describe("launchFrame", () => {
  test("at 0 the window is exactly the icon, with the icon's corners and a fully opaque splash", () => {
    const f = launchFrame(0, PHONE);
    expect(clipOf(f.clipPath)).toEqual({ top: 120, right: 390 - 76, bottom: 844 - 180, left: 16, radius: 14 });
    expect(f.tint).toEqual({ x: 16, y: 120, sx: 60 / 390, sy: 60 / 844 });
    expect(f.splashOpacity).toBe(1);
  });

  test("at 1 the window covers the surface with an identity zoom and no splash", () => {
    const f = launchFrame(1, PHONE);
    expect(clipOf(f.clipPath)).toEqual({ top: 0, right: 0, bottom: 0, left: 0, radius: 12 });
    expect(f.stage).toEqual({ x: 0, y: 0, scale: 1 });
    expect(f.splashOpacity).toBe(0);
  });

  test("a spring's overshoot or undershoot holds the end frames", () => {
    expect(launchFrame(1.03, PHONE)).toEqual(launchFrame(1, PHONE));
    expect(launchFrame(-0.02, PHONE)).toEqual(launchFrame(0, PHONE));
  });

  test("the splash stays opaque early, then only fades, and is gone before the end", () => {
    let last = 1;
    for (const p of STEPS) {
      const o = launchFrame(p, PHONE).splashOpacity;
      expect(o).toBeLessThanOrEqual(last);
      last = o;
    }
    expect(launchFrame(0.5, PHONE).splashOpacity).toBe(1);
    expect(launchFrame(0.9, PHONE).splashOpacity).toBe(0);
  });

  for (const [name, geo] of [["portrait phone", PHONE], ["landscape tablet", TABLET]] as const) {
    test(`${name}: the content and the tint cover the clip at every step, the glyph sits centred in it`, () => {
      for (const p of STEPS) {
        const f = launchFrame(p, geo);
        const c = clipOf(f.clipPath);
        const clip = { l: c.left, t: c.top, r: geo.w - c.right, b: geo.h - c.bottom };
        const eps = 0.02;
        // Content: translate then scale the full-surface stage from its top-left.
        expect(f.stage.x).toBeLessThanOrEqual(clip.l + eps);
        expect(f.stage.y).toBeLessThanOrEqual(clip.t + eps);
        expect(f.stage.x + geo.w * f.stage.scale).toBeGreaterThanOrEqual(clip.r - eps);
        expect(f.stage.y + geo.h * f.stage.scale).toBeGreaterThanOrEqual(clip.b - eps);
        // Tint: stretched exactly over the clip.
        expect(f.tint.x).toBeCloseTo(clip.l, 1);
        expect(f.tint.y).toBeCloseTo(clip.t, 1);
        expect(f.tint.x + geo.w * f.tint.sx).toBeCloseTo(clip.r, 1);
        expect(f.tint.y + geo.h * f.tint.sy).toBeCloseTo(clip.b, 1);
        // Glyph: centred, and never drawn larger than it is rendered.
        const size = SPLASH_GLYPH_PX * f.glyph.scale;
        expect(f.glyph.x + size / 2).toBeCloseTo((clip.l + clip.r) / 2, 1);
        expect(f.glyph.y + size / 2).toBeCloseTo((clip.t + clip.b) / 2, 1);
        expect(f.glyph.scale).toBeLessThanOrEqual(1);
      }
    });
  }

  test("the window grows monotonically from the icon to the surface", () => {
    let last = -1;
    for (const p of STEPS) {
      const c = clipOf(launchFrame(p, TABLET).clipPath);
      const area = (TABLET.w - c.left - c.right) * (TABLET.h - c.top - c.bottom);
      expect(area).toBeGreaterThan(last);
      last = area;
    }
  });
});

describe("needsNewPath", () => {
  const gridIcon = {};
  const dockIcon = {};
  const closing: LaunchTarget = { appId: "inventory", origin: gridIcon };

  test("a launch from the home screen and every close measure", () => {
    expect(needsNewPath(true, 0, closing, closing)).toBe(true);
    expect(needsNewPath(true, 0, null, closing)).toBe(true);
    expect(needsNewPath(false, 0.6, closing, closing)).toBe(true);
    expect(needsNewPath(false, 1, closing, closing)).toBe(true);
  });

  test("reopening the closing app from the same icon keeps its path", () => {
    expect(needsNewPath(true, 0.4, closing, { appId: "inventory", origin: gridIcon })).toBe(false);
  });

  test("another app tapped while the last one closes grows out of its own icon", () => {
    expect(needsNewPath(true, 0.4, closing, { appId: "schedule", origin: {} })).toBe(true);
    // Opened by a link with no app: still not the closing app's path.
    expect(needsNewPath(true, 0.4, closing, { appId: null, origin: null })).toBe(true);
  });

  test("the same app tapped on another copy of its icon re-aims too", () => {
    expect(needsNewPath(true, 0.4, closing, { appId: "inventory", origin: dockIcon })).toBe(true);
  });

  test("no path measured yet always measures", () => {
    expect(needsNewPath(true, 0.4, null, closing)).toBe(true);
  });
});

describe("fadeFrame", () => {
  test("fades and scales in about the centre without an icon", () => {
    expect(fadeFrame(0).opacity).toBe(0);
    expect(fadeFrame(0).scale).toBeLessThan(1);
    expect(fadeFrame(1)).toEqual({ opacity: 1, scale: 1 });
    expect(fadeFrame(1.1)).toEqual({ opacity: 1, scale: 1 });
  });
});

describe("transformCss", () => {
  test("never prints exponent notation", () => {
    expect(transformCss(1e-9, -2e-12, 1.0000000001)).toBe("translate(0px, 0px) scale(1, 1)");
    expect(transformCss(12.3456, 7, 0.5, 0.25)).toBe("translate(12.35px, 7px) scale(0.5, 0.25)");
  });
});
