/**
 * Coercing a SpacetimeDB timestamp to epoch milliseconds.
 *
 * A timestamp reaches the client in more than one shape depending on how the
 * row got there: `{ microsSinceUnixEpoch: bigint }` from the live subscription,
 * an object with `.toDate()` from the SDK wrapper, a plain number or ISO string
 * from something that pre-serialised it, and a real `Date` from code that has
 * already converted. Five modules had each written their own version of this,
 * three of them byte-identical.
 */

/** Epoch ms, or `NaN` when the value is not a timestamp in any known shape. */
export function timestampToMs(v: unknown): number {
  if (v == null) return NaN;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  if (typeof v === "string") return new Date(v).getTime();
  if (typeof v === "object") {
    const obj = v as { microsSinceUnixEpoch?: bigint | number; toDate?: () => Date };
    if (typeof obj.toDate === "function") {
      try {
        return obj.toDate().getTime();
      } catch {
        return NaN;
      }
    }
    const micros = obj.microsSinceUnixEpoch;
    if (typeof micros === "bigint") return Number(micros / 1000n);
    if (typeof micros === "number") return micros / 1000;
  }
  return NaN;
}

/** Same, for callers that would rather branch on `null` than on `NaN`. */
export function timestampToMsOrNull(v: unknown): number | null {
  const ms = timestampToMs(v);
  return Number.isFinite(ms) ? ms : null;
}
