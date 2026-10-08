// Which toolbar groups fit (slides.md §7.3): groups are laid out by fixed widths, and the ones that don't fit move,
// whole, into the ⋮ popover, as in the Docs toolbar. Pure.

const SEPARATOR = 11;
const MORE = 36;
const PADDING = 16;

/** How many leading groups fit in `width` (all of them while the width is unknown). */
export function visibleGroupCount(widths: readonly number[], width: number): number {
  if (width <= 0) return widths.length;
  const total = widths.reduce((sum, w, i) => sum + w + (i > 0 ? SEPARATOR : 0), PADDING);
  if (total <= width) return widths.length;
  let used = PADDING + MORE;
  let count = 0;
  for (let i = 0; i < widths.length; i++) {
    const next = used + widths[i] + (i > 0 ? SEPARATOR : 0);
    if (next > width) break;
    used = next;
    count++;
  }
  return count;
}
