// Per-store "first-run setup is done" memory for this device.
//
// The live signal is the store's settings row (updatedAt past createdAt, see
// app/manager/layout.tsx), but that row is only as good as the client cache:
// right after a reconnect the cache can be empty while the cached auth state
// already says "ready". Setup never becomes undone, so once this device has
// seen it done for a store it remembers that and never sends the user back to
// /manager/setup for it.

const KEY_PREFIX = "merchiva_setup_done:";

export function isSetupKnownDone(organizationId: string): boolean {
  try {
    return localStorage.getItem(KEY_PREFIX + organizationId) === "1";
  } catch {
    return false;
  }
}

export function markSetupDone(organizationId: string): void {
  if (!organizationId) return;
  try {
    localStorage.setItem(KEY_PREFIX + organizationId, "1");
  } catch {}
}
