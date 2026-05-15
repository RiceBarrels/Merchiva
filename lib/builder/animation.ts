// Animation config attached to any builder node via props.animation (or
// data-animation on the published HTML). Applied imperatively via motion's
// animate / inView APIs in lib/builder/apply-builder-animation.ts.

export type EntryAnimationType =
  | "none"
  | "fade"
  | "slideUp"
  | "slideDown"
  | "slideLeft"
  | "slideRight"
  | "scale";

export type EaseType = "easeOut" | "easeIn" | "easeInOut" | "linear";

// Custom transform overrides for the entry's starting state. If a field is
// undefined, the preset's default is used. (Final state is always the natural
// rendered state — opacity:1, scale:1, no transform.)
export interface EntryEffect {
  opacity?: number;       // 0..1
  scale?: number;         // 1 = no scale
  rotate?: number;        // degrees
  offsetX?: number;       // px
  offsetY?: number;       // px
  skewX?: number;         // degrees
  skewY?: number;         // degrees
}

export interface EntryAnimation {
  type: EntryAnimationType;
  duration?: number;            // seconds, default 0.5
  delay?: number;               // seconds, default 0
  trigger?: "immediate" | "inView";  // default "inView"
  distance?: number;            // px, slide displacement when no custom offset; default 24
  // Custom starting state — overrides the preset's defaults per axis.
  initial?: EntryEffect;
  // Viewport position that triggers inView (default "center"):
  //   top    → amount: 0     (top edge enters)
  //   center → amount: 0.4   (~half visible)
  //   bottom → amount: 0.9   (mostly visible)
  start?: "top" | "center" | "bottom";
  // For inView trigger: replay every time element re-enters viewport (default true).
  replay?: boolean;
  ease?: EaseType;
}

export interface HoverAnimation {
  scale?: number;               // e.g. 1.05
  y?: number;                   // px lift, e.g. -4
  rotate?: number;              // degrees
  duration?: number;            // default 0.2
}

export interface TapAnimation {
  scale?: number;               // e.g. 0.95
}

export interface BuilderAnimation {
  entry?: EntryAnimation;
  hover?: HoverAnimation;
  tap?: TapAnimation;
}

export function hasAnimation(a: BuilderAnimation | undefined): boolean {
  if (!a) return false;
  if (a.entry && a.entry.type && a.entry.type !== "none") return true;
  if (a.entry?.initial && Object.keys(a.entry.initial).length > 0) return true;
  if (a.hover && (a.hover.scale != null || a.hover.y != null || a.hover.rotate != null)) return true;
  if (a.tap && a.tap.scale != null) return true;
  return false;
}
