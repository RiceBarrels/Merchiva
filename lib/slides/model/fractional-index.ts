// Fractional order keys and deck-local ids (slides.md §2.4, §2.5). Our own implementation, no dependency.
//
// A key is a base-62 fraction written without the leading "0.": "V" is 31/62, "V8" is 31/62 + 8/62². Digits run
// "0-9A-Za-z", whose ASCII order is digit order, so plain string comparison sorts keys. A key never ends in "0",
// so there is always room below it, and never is "" (that is the lower bound, 0). Slide order, element z-order and
// table row/column order all use these keys inside Y.Map values: concurrent Y.Array moves would duplicate items.

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = DIGITS.length;
const BIG_BASE = BigInt(BASE);
/**
 * A usable key: base-62 digits, not ending in "0". The length bound (about 6,000 inserts into one gap) only keeps a
 * hostile row from making key arithmetic arbitrarily slow.
 */
const KEY_RE = /^[0-9A-Za-z]{0,1023}[1-9A-Za-z]$/;

/** True for a well-formed order key (what every reader accepts; anything else sorts as ""). */
export function isOrderKey(key: unknown): key is string {
  return typeof key === "string" && KEY_RE.test(key);
}

function randomInts(count: number, below: number): number[] {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === "function") {
    const buf = new Uint32Array(count);
    c.getRandomValues(buf);
    return Array.from(buf, (n) => n % below);
  }
  return Array.from({ length: count }, () => Math.floor(Math.random() * below));
}

/** New deck-local id: 12 base-62 chars (~71 bits). */
export function newSlidesId(): string {
  return randomInts(12, BASE).map((n) => DIGITS[n]).join("");
}

function devWarn(message: string): void {
  if (process.env.NODE_ENV === "development") console.warn(`[slides] ${message}`);
}

/** Shortest key strictly between `a` ("" = 0) and `b` (null = 1). Requires a < b, both well formed. */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while ((a[n] ?? "0") === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = a ? DIGITS.indexOf(a[0]) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b[0]) : BASE;
  if (digitB - digitA > 1) return DIGITS[Math.round((digitA + digitB) / 2)];
  // Consecutive digits: b's first digit alone is between them when b continues; else extend a.
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA] + midpoint(a.slice(1), null);
}

/**
 * A key strictly between `a` and `b` (null = open end). Never throws: a malformed bound counts as open, and a
 * degenerate `a >= b` (equal neighbours before a repair) gives the gap after `a`. `jitter` appends two random
 * digits, so two clients inserting into the same gap at once get different keys.
 */
export function keyBetween(a: string | null, b: string | null, opts?: { jitter?: boolean }): string {
  const lo = isOrderKey(a) ? a : "";
  let hi = isOrderKey(b) ? b : null;
  if (hi !== null && lo >= hi) {
    devWarn(`keyBetween(${lo}, ${hi}): bounds out of order; using the gap after ${lo}`);
    hi = null;
  }
  let key = midpoint(lo, hi);
  if (!opts?.jitter) return key;
  // An extension of `key` stays below `hi` only when `key` is not a prefix of it: step down until it isn't.
  while (hi !== null && hi.startsWith(key)) key = midpoint(lo, key);
  const [first, last] = randomInts(2, BASE);
  return `${key}${DIGITS[first]}${DIGITS[1 + (last % (BASE - 1))]}`;
}

function toBig(key: string, length: number): bigint {
  let n = 0n;
  for (let i = 0; i < length; i++) n = n * BIG_BASE + BigInt(i < key.length ? DIGITS.indexOf(key[i]) : 0);
  return n;
}

function fromBig(n: bigint, length: number): string {
  const out: string[] = [];
  let rest = n;
  for (let i = 0; i < length; i++) {
    out.push(DIGITS[Number(rest % BIG_BASE)]);
    rest /= BIG_BASE;
  }
  return out.reverse().join("").replace(/0+$/, "");
}

/** `n` evenly spaced keys strictly between `a` and `b`, ascending (no jitter). */
export function keysBetween(a: string | null, b: string | null, n: number): string[] {
  const count = Math.max(0, Math.floor(n));
  if (count === 0) return [];
  const lo = isOrderKey(a) ? a : "";
  let hi = isOrderKey(b) ? b : null;
  if (hi !== null && lo >= hi) {
    devWarn(`keysBetween(${lo}, ${hi}): bounds out of order; using the gap after ${lo}`);
    hi = null;
  }
  // Enough digits that the gap holds `count` keys at least BASE units apart.
  let spare = 1;
  while (BASE ** spare < count + 1) spare++;
  const length = Math.max(lo.length, hi?.length ?? 0) + spare + 1;
  const low = toBig(lo, length);
  const high = hi === null ? BIG_BASE ** BigInt(length) : toBig(hi, length);
  const step = (high - low) / BigInt(count + 1);
  return Array.from({ length: count }, (_, i) => fromBig(low + step * BigInt(i + 1), length));
}

/** `n` evenly spaced keys for a fresh list (import/build). */
export function sequentialKeys(n: number): string[] {
  return keysBetween(null, null, n);
}

/** Sort order of everything keyed: the key, then the id. Malformed keys sort as "" (first). */
export function compareKeyed(a: { key: string; id: string }, b: { key: string; id: string }): number {
  const ka = isOrderKey(a.key) ? a.key : "";
  const kb = isOrderKey(b.key) ? b.key : "";
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The entries whose key must change so that every key is well formed and unique, sorted by id. Deterministic, so
 * two clients repairing the same state write the same keys. In each run of equal keys the smallest id keeps its
 * key and the rest are spread up to the next distinct key; malformed keys are all re-keyed before the first good one.
 */
export function repairDuplicateKeys(entries: ReadonlyArray<{ id: string; key: string }>): Array<{ id: string; key: string }> {
  const sorted = [...entries].sort(compareKeyed);
  const out: Array<{ id: string; key: string }> = [];
  let i = 0;
  while (i < sorted.length) {
    const key = isOrderKey(sorted[i].key) ? sorted[i].key : "";
    let j = i + 1;
    while (j < sorted.length && (isOrderKey(sorted[j].key) ? sorted[j].key : "") === key) j++;
    const next = j < sorted.length ? sorted[j].key : null;
    const redo = key === "" ? sorted.slice(i, j) : sorted.slice(i + 1, j);
    if (redo.length > 0) {
      const keys = keysBetween(key === "" ? null : key, next, redo.length);
      redo.forEach((entry, k) => out.push({ id: entry.id, key: keys[k] }));
    }
    i = j;
  }
  return out.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

/**
 * Neighbour keys for an insert after `sorted[insertAfterIndex]` (-1 = before the first). Skips ties and malformed
 * keys, so `b` is the next well-formed key strictly greater than `a`.
 */
export function gapAround(
  sorted: ReadonlyArray<{ id: string; key: string }>,
  insertAfterIndex: number,
): { a: string | null; b: string | null } {
  const index = Math.min(Math.max(insertAfterIndex, -1), sorted.length - 1);
  const a = index >= 0 && isOrderKey(sorted[index].key) ? sorted[index].key : null;
  for (let j = index + 1; j < sorted.length; j++) {
    const key = sorted[j].key;
    if (isOrderKey(key) && (a === null || key > a)) return { a, b: key };
  }
  return { a, b: null };
}
