/**
 * Minimal `{name}` interpolation for i18n strings. `t()` returns raw strings
 * (lib/i18n/context.tsx), so templates like "Closed {count} tabs" are filled in
 * here. Unknown placeholders are left untouched so a missing variable is
 * visible instead of silently rendering "undefined".
 */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
