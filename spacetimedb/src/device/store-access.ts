// Who may run a shared store device (the /store surface): owners and managers by role, and any
// other member an owner granted `store_device.view` in their permissions JSON. Every reducer a
// store tablet uses to work as one — registering itself, the QR and PIN log-ins, the operator's
// punches and chat — checks the tablet's account with requireStoreDevice. Mirrored on the client
// by lib/store-device-access.ts (scripts/tests/store-device/store-access.test.ts runs both).
//
// Pure: no SDK imports, so Bun tests load it directly.

export const STORE_DEVICE_DENIED =
  '[store_device] Only an owner, a manager or a member with the store device permission can run a store device';

/** Whether `member` (a tablet's signed-in account) may run a store device. Unreadable permissions grant nothing. */
export function canRunStoreDevice(member: { role: string; permissions?: string | null }): boolean {
  if (member.role === 'owner' || member.role === 'manager') return true;
  try {
    const parsed = JSON.parse(member.permissions || '{}') as { store_device?: { view?: unknown } };
    return parsed.store_device?.view === true;
  } catch {
    return false;
  }
}

/**
 * `permissions` with store_device switched off and every other section kept (a manager's
 * invitation: only owners grant it, as updateMemberPermissions is owner-only). Anything that is
 * not a JSON object passes through unchanged.
 */
export function withoutStoreDevicePower(permissions: string): string {
  if (typeof permissions !== 'string' || permissions.trim() === '') return permissions;
  let stored: unknown;
  try {
    stored = JSON.parse(permissions);
  } catch {
    return permissions;
  }
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) return permissions;
  return JSON.stringify({ ...(stored as Record<string, unknown>), store_device: { view: false } });
}

/** Throws (through the caller's SenderError) unless `member` may run a store device. */
export function requireStoreDevice(
  member: { role: string; permissions?: string | null },
  SenderError: new (message: string) => Error,
): void {
  if (!canRunStoreDevice(member)) throw new SenderError(STORE_DEVICE_DENIED);
}
