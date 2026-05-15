"use client";

import { useEffect } from "react";
import type { BuilderAnimation } from "./animation";
import { applyBuilderAnimation } from "./apply-builder-animation";

export { applyBuilderAnimation } from "./apply-builder-animation";

/**
 * React-friendly wrapper around {@link applyBuilderAnimation}. Apply motion
 * config to a DOM element. Pass `skip: true` (e.g. while in an editor's edit
 * mode) to disable animations without changing the config.
 */
export function useBuilderAnimation(
  dom: HTMLElement | null,
  animation: BuilderAnimation | undefined,
  options: { skip?: boolean } = {},
): void {
  useEffect(() => {
    if (!dom || options.skip) return;
    return applyBuilderAnimation(dom, animation);
  }, [dom, animation, options.skip]);
}
