"use client";

import { animate, inView } from "motion";
import type { BuilderAnimation, EaseType, EntryAnimationType, EntryEffect } from "./animation";
import { hasAnimation } from "./animation";

// Default starting state per preset. Custom `initial` overrides take precedence.
const INITIAL_BY_TYPE: Record<
  Exclude<EntryAnimationType, "none">,
  (distance: number) => EntryEffect
> = {
  fade:       () => ({ opacity: 0 }),
  slideUp:    (d) => ({ opacity: 0, offsetY: d }),
  slideDown:  (d) => ({ opacity: 0, offsetY: -d }),
  slideLeft:  (d) => ({ opacity: 0, offsetX: d }),
  slideRight: (d) => ({ opacity: 0, offsetX: -d }),
  scale:      () => ({ opacity: 0, scale: 0.9 }),
};

const EASE_MAP: Record<EaseType, [number, number, number, number]> = {
  easeOut:   [0.16, 1, 0.3, 1],     // ease-out-expo
  easeIn:    [0.42, 0, 1, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  linear:    [0, 0, 1, 1],
};

const DEFAULT_EASE: [number, number, number, number] = EASE_MAP.easeOut;

const START_TO_AMOUNT: Record<"top" | "center" | "bottom", number> = {
  top: 0,
  center: 0.4,
  bottom: 0.9,
};

function mergedInitial(
  type: EntryAnimationType,
  distance: number,
  override: EntryEffect | undefined,
): EntryEffect {
  const preset: EntryEffect =
    type === "none" ? {} : INITIAL_BY_TYPE[type](distance);
  return { ...preset, ...(override ?? {}) };
}

// Apply the initial state synchronously via inline style. Motion's animate()
// is asynchronous (queued through rAF) so a duration-0 "snap" can race the
// inView callback — we'd end up animating from 1 → 1 and seeing nothing.
function applyInitialStyle(dom: HTMLElement, initial: EntryEffect) {
  if (initial.opacity != null) dom.style.opacity = String(initial.opacity);
  const transforms: string[] = [];
  const hasOffset = initial.offsetX != null || initial.offsetY != null;
  if (hasOffset) {
    transforms.push(`translate(${initial.offsetX ?? 0}px, ${initial.offsetY ?? 0}px)`);
  }
  if (initial.scale != null) transforms.push(`scale(${initial.scale})`);
  if (initial.rotate != null) transforms.push(`rotate(${initial.rotate}deg)`);
  const hasSkew = initial.skewX != null || initial.skewY != null;
  if (hasSkew) {
    transforms.push(`skew(${initial.skewX ?? 0}deg, ${initial.skewY ?? 0}deg)`);
  }
  if (transforms.length > 0) dom.style.transform = transforms.join(" ");
}

function buildFinalFromInitial(initial: EntryEffect): Record<string, number> {
  const final: Record<string, number> = {};
  if (initial.opacity != null) final.opacity = 1;
  if (initial.scale != null) final.scale = 1;
  if (initial.rotate != null) final.rotate = 0;
  if (initial.offsetX != null) final.x = 0;
  if (initial.offsetY != null) final.y = 0;
  if (initial.skewX != null) final.skewX = 0;
  if (initial.skewY != null) final.skewY = 0;
  return final;
}

/**
 * Apply a BuilderAnimation to a DOM element using motion's imperative API.
 * Returns a cleanup function. Safe to call multiple times — call cleanup
 * before re-applying.
 */
export function applyBuilderAnimation(
  dom: HTMLElement,
  animation: BuilderAnimation | undefined,
): () => void {
  if (!hasAnimation(animation)) return () => {};

  const cleanups: Array<() => void> = [];

  // ── Entry ──────────────────────────────────────────────────────────────
  const entry = animation!.entry;
  const hasEntryInitial = entry?.initial && Object.keys(entry.initial).length > 0;
  if (entry && (entry.type !== "none" || hasEntryInitial)) {
    const type = entry.type;
    const duration = entry.duration ?? 0.5;
    const delay = entry.delay ?? 0;
    const trigger = entry.trigger ?? "inView";
    const distance = entry.distance ?? 24;
    const start = entry.start ?? "top";          // fire ASAP by default
    const replay = entry.replay !== false;         // default true
    const ease = entry.ease ? EASE_MAP[entry.ease] : DEFAULT_EASE;

    const initial = mergedInitial(type, distance, entry.initial);
    const final = buildFinalFromInitial(initial);

    if (Object.keys(final).length > 0) {
      // Apply initial state synchronously via inline style. motion.animate()
      // is queued through rAF; setting it via animate(_, _, {duration:0})
      // races inView's callback and we'd animate 1 → 1 (no visible change).
      applyInitialStyle(dom, initial);

      const play = () => {
        animate(dom, final, { duration, delay, ease });
      };

      if (trigger === "immediate") {
        // Wait one frame so the initial paint is visible (otherwise the
        // browser may batch initial + final into a single paint = no anim).
        const id = requestAnimationFrame(() => play());
        cleanups.push(() => cancelAnimationFrame(id));
      } else {
        let played = false;
        console.log("[anim] inView observing", dom, "amount:", START_TO_AMOUNT[start]);
        const stop = inView(
          dom,
          () => {
            console.log("[anim] inView fired for", dom);
            if (!replay && played) return;
            played = true;
            requestAnimationFrame(() => play());
          },
          { amount: START_TO_AMOUNT[start] },
        );
        cleanups.push(() => stop());
        // Safety net: if IO never fires within 1s, assume element is in view
        // and trigger anyway. Some browsers / scroll containers misreport.
        const fallback = setTimeout(() => {
          if (played) return;
          console.warn("[anim] inView fallback fired (IO never reported intersect) for", dom);
          played = true;
          play();
        }, 1000);
        cleanups.push(() => clearTimeout(fallback));
      }
    }
  }

  // ── Hover ──────────────────────────────────────────────────────────────
  const hoverCfg = animation!.hover;
  if (hoverCfg && (hoverCfg.scale != null || hoverCfg.y != null || hoverCfg.rotate != null)) {
    const hoverScale = hoverCfg.scale ?? 1;
    const hoverY = hoverCfg.y ?? 0;
    const hoverRotate = hoverCfg.rotate ?? 0;
    const hoverDuration = hoverCfg.duration ?? 0.2;

    const onEnter = () => {
      animate(dom, { scale: hoverScale, y: hoverY, rotate: hoverRotate }, { duration: hoverDuration });
    };
    const onLeave = () => {
      animate(dom, { scale: 1, y: 0, rotate: 0 }, { duration: hoverDuration });
    };
    dom.addEventListener("mouseenter", onEnter);
    dom.addEventListener("mouseleave", onLeave);
    cleanups.push(() => {
      dom.removeEventListener("mouseenter", onEnter);
      dom.removeEventListener("mouseleave", onLeave);
    });
  }

  // ── Tap ────────────────────────────────────────────────────────────────
  const tapCfg = animation!.tap;
  if (tapCfg?.scale != null) {
    const tapScale = tapCfg.scale;

    const onDown = () => {
      animate(dom, { scale: tapScale }, { duration: 0.1 });
    };
    const onUp = () => {
      animate(dom, { scale: 1 }, { duration: 0.15 });
    };
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointerleave", onUp);
    dom.addEventListener("pointercancel", onUp);
    cleanups.push(() => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointerleave", onUp);
      dom.removeEventListener("pointercancel", onUp);
    });
  }

  return () => {
    for (const fn of cleanups) fn();
  };
}
