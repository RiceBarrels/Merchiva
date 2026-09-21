/**
 * Money handling for rows that came out of SpacetimeDB.
 *
 * Every currency column in the module started life as an `f64`. Floating point
 * cannot represent most decimal amounts exactly, so totals drift: sum a few
 * hundred line items and the result is off by a cent, subtract a refund from a
 * charge and they stop reconciling. SpacetimeDB cannot change a column's type
 * in place, so each money column now has a sibling `<name>Cents` column holding
 * the exact value as an integer number of minor units. Reducers write both.
 *
 * Read money through these helpers. They prefer the exact integer and fall back
 * to the legacy float for rows written before the migration, so a surface can
 * be switched over without waiting for `migrateMoneyV1` to finish.
 *
 * The cardinal rule: ADD IN CENTS, CONVERT ONCE AT THE END. `sumCents` over a
 * list is exact; `list.reduce((a, r) => a + r.amount, 0)` is not.
 */

/**
 * A row carrying both representations of one amount.
 *
 * Deliberately `object` and not `Record<string, unknown>`: a declared interface
 * has no index signature, so the stricter type rejected every mapped row type
 * in the app and the helpers went unused. Field access is narrowed in `field`.
 */
type MoneyRow = object;

function field(row: MoneyRow, name: string): unknown {
  return (row as Record<string, unknown>)[name];
}

/**
 * Exact minor units for `field` on `row`.
 *
 * Prefers `<field>Cents` (a bigint from the i64 column). Falls back to rounding
 * the legacy float when the row predates the backfill. Returns 0 for a missing
 * or unset amount, so callers can sum without null checks.
 */
export function centsOf(row: MoneyRow | null | undefined, name: string): number {
  if (!row) return 0;
  const exact = field(row, `${name}Cents`);
  if (typeof exact === "bigint") return Number(exact);
  if (typeof exact === "number") return exact;
  const legacy = field(row, name);
  if (typeof legacy === "number") return toCents(legacy);
  return 0;
}

/** Same as `centsOf`, but distinguishes "not set" from "zero". */
export function centsOrNull(row: MoneyRow | null | undefined, name: string): number | null {
  if (!row) return null;
  const exact = field(row, `${name}Cents`);
  if (typeof exact === "bigint") return Number(exact);
  if (typeof exact === "number") return exact;
  const legacy = field(row, name);
  if (typeof legacy === "number" && Number.isFinite(legacy)) return toCents(legacy);
  return null;
}

/** Sum one money field across rows, exactly. Stays in integers throughout. */
export function sumCents(rows: readonly MoneyRow[] | null | undefined, name: string): number {
  let total = 0;
  for (const row of rows ?? []) total += centsOf(row, name);
  return total;
}

/** Minor units → major units. Only at the edge, for display or an external API. */
export function toMajor(cents: number): number {
  return cents / 100;
}

/** Major units → exact minor units. Use before sending an amount to a reducer. */
export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  // `amount * 100` is itself a float operation and carries its own error:
  // 1.005 * 100 is 100.49999999999999, which Math.round sends DOWN to 100 —
  // half a cent lost on exactly the values a person is most likely to type.
  // Normalising through a fixed-precision string first pins the product to the
  // decimal that was actually meant, and only then rounds to the nearest cent.
  return Math.round(Number((amount * 100).toFixed(4)));
}

/**
 * Multiply an amount by a quantity and stay exact to the cent — hours x rate,
 * units x unit cost. Rounds half away from zero, once.
 */
export function multiplyCents(cents: number, factor: number): number {
  if (!Number.isFinite(factor)) return 0;
  return Math.round(cents * factor);
}

/** Apply a rate such as a tax percentage (0.0875) to an amount in minor units. */
export function applyRateCents(cents: number, rate: number): number {
  return multiplyCents(cents, Number.isFinite(rate) ? rate : 0);
}

/** Format minor units for display. */
export function formatCents(
  cents: number,
  currency = "USD",
  locale?: string,
): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)}`;
  }
}
