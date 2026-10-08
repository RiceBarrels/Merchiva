// Defensive readers for the pptxtojson result. Its d.ts describes the happy path, but the values come from an
// untrusted file (NaN from a missing attribute, a string where a number belongs, an object that is null), so the
// mapper reads every field through these instead of trusting the declared types.

export type LeanRecord = Readonly<Record<string, unknown>>;

export function rec(value: unknown): LeanRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as LeanRecord) : null;
}

export function arr(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/** A finite number (numeric strings included), else `fallback`. */
export function num(value: unknown, fallback = 0): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function flag(value: unknown): boolean {
  return value === true || value === "1" || value === 1;
}

/** Document order within one XML part (pptxtojson's `order`); elements without one sort first. */
export function orderOf(el: LeanRecord): number {
  return num(el.order, -1);
}

/** `elements` sorted by `order` ascending (F27); the sort is stable, so equal orders keep their array order. */
export function byOrder<T extends LeanRecord>(elements: readonly T[]): T[] {
  return elements.map((el, i) => ({ el, i })).sort((a, b) => orderOf(a.el) - orderOf(b.el) || a.i - b.i).map((x) => x.el);
}

/** The records of an array (anything else dropped). */
export function records(value: unknown): LeanRecord[] {
  const out: LeanRecord[] = [];
  for (const item of arr(value)) {
    const r = rec(item);
    if (r) out.push(r);
  }
  return out;
}
