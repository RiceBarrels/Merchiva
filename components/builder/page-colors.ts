/**
 * Shared page swatch colours for the builder navigators (pages tree, left panels).
 * Uses the design-system chart ramp (design-system/README.md §2) instead of ad-hoc hues.
 */
export const PAGE_COLORS = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
] as const;

export function pageColor(index: number): string {
  return PAGE_COLORS[index % PAGE_COLORS.length];
}
