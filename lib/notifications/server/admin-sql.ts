// What the /merchivaAdmin console may not read or call. Pure.
//
// The console runs its SELECTs as the service identity, which reads
// `notification_delivery` through rls_notification_delivery_service so the
// notifications cron can work (U14 extended to it, user-approved 2026-10-08).
// Those rows hold members' unsent notification text (chat and comment
// previews) and, while a run holds them, their push keys; the console must not
// show them. The check is on the query text, after case, quotes and every
// other non-alphanumeric character are dropped, so no quoting or spacing slips
// the table name past it.
//
// Its reducer calls run as that same identity, so it must not lease or report
// deliveries either: a claim would put those rows (push keys included) under a
// run id it chose, and a forged report would mark them sent. Only the cron
// calls those two reducers. Same normalization, so no casing, snake_case or
// camelCase spelling slips past.

const NOTIFY_ADMIN_SQL_DENIED = ["notification_delivery"] as const;
const NOTIFY_ADMIN_CALL_DENIED = ["service_claim_notification_deliveries", "service_finish_notification_deliveries"] as const;

const flatName = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Why the console refuses `query`, or null when it may run. */
export function notifyAdminSqlRefusal(query: string): string | null {
  const flat = flatName(query);
  for (const table of NOTIFY_ADMIN_SQL_DENIED) {
    if (flat.includes(flatName(table))) return `The ${table} table cannot be read from the admin console`;
  }
  return null;
}

/** Why the console refuses to call `reducer`, or null when it may. */
export function notifyAdminCallRefusal(reducer: string): string | null {
  const flat = flatName(reducer);
  for (const name of NOTIFY_ADMIN_CALL_DENIED) {
    if (flat.includes(flatName(name))) return `The ${name} reducer cannot be called from the admin console`;
  }
  return null;
}
