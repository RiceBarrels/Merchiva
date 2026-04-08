import type { SiteElement, ElementType } from "@/lib/types";

// Default sizes per element type
const DEFAULT_SIZES: Record<string, { w: number; h: number }> = {
  hero:              { w: 900, h: 400 },
  nav:               { w: 900, h: 60 },
  footer:            { w: 900, h: 80 },
  text:              { w: 400, h: 60 },
  image:             { w: 400, h: 300 },
  button:            { w: 160, h: 44 },
  divider:           { w: 900, h: 20 },
  spacer:            { w: 900, h: 48 },
  layout:            { w: 600, h: 400 },
  container:         { w: 600, h: 400 },
  columns:           { w: 600, h: 300 },
  "product-card":    { w: 320, h: 360 },
  "booking-form":    { w: 400, h: 300 },
  "coupon-banner":   { w: 500, h: 100 },
  "pricing-table":   { w: 700, h: 400 },
  testimonial:       { w: 400, h: 200 },
  faq:               { w: 500, h: 300 },
  gallery:           { w: 600, h: 400 },
  "custom-html":     { w: 500, h: 200 },
  "login-form":      { w: 360, h: 300 },
  "code-block":      { w: 500, h: 300 },
  "membership-widget": { w: 400, h: 300 },
  cart:              { w: 400, h: 300 },
  checkout:          { w: 400, h: 400 },
  reward:            { w: 400, h: 200 },
  icon:              { w: 64, h: 64 },
};

export function getDefaultSize(type: ElementType): { w: number; h: number } {
  return DEFAULT_SIZES[type] ?? { w: 400, h: 200 };
}

/**
 * Normalize elements that lack x/y/width/height by stacking them vertically.
 * Returns a new array — does not mutate the input.
 */
export function normalizeElements(elements: SiteElement[]): SiteElement[] {
  let cursorY = 40;
  const GAP = 20;
  const LEFT_MARGIN = 40;

  return elements.map((el) => {
    if (el.x !== undefined && el.y !== undefined && el.width !== undefined && el.height !== undefined) {
      return el;
    }
    const size = getDefaultSize(el.type);
    const normalized: SiteElement = {
      ...el,
      x: el.x ?? LEFT_MARGIN,
      y: el.y ?? cursorY,
      width: el.width ?? size.w,
      height: el.height ?? size.h,
    };
    cursorY = (normalized.y ?? 0) + (normalized.height ?? 0) + GAP;
    return normalized;
  });
}

/**
 * Convert screen coordinates to canvas (world) coordinates.
 */
export function screenToCanvas(
  screenX: number,
  screenY: number,
  canvasRect: DOMRect,
  zoom: number,
  panX: number,
  panY: number
): { x: number; y: number } {
  return {
    x: (screenX - canvasRect.left) / zoom + panX,
    y: (screenY - canvasRect.top) / zoom + panY,
  };
}

/**
 * Compute the center of the visible viewport in canvas coordinates.
 */
export function viewportCenter(
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  panX: number,
  panY: number
): { x: number; y: number } {
  return {
    x: panX + viewportWidth / zoom / 2,
    y: panY + viewportHeight / zoom / 2,
  };
}

/**
 * Clamp zoom to reasonable bounds.
 */
export function clampZoom(z: number): number {
  return Math.min(5, Math.max(0.1, z));
}
