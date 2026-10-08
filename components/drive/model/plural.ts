// Count-dependent message keys. `fmt` (lib/i18n/fmt.ts) has no plural rules, so a count message
// comes in two keys: `<base>One` for exactly one ("1 file") and `<base>` for every other count
// ("{count} files"). Locales whose grammar needs more forms write both in a count-neutral way.

/** `<base>One` when `count` is 1, else `<base>`. */
export function countKey(base: string, count: number): string {
  return count === 1 ? `${base}One` : base;
}
