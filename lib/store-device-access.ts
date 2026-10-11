// Who may set up and run a shared store device (app mode "store", the /store surface): owners and
// managers by role, and members an owner granted `store_device.view`. UI gating only — the
// module refuses a store tablet's log-ins, punches and chat to anyone else
// (spacetimedb/src/device/store-access.ts; scripts/tests/store-device/store-access.test.ts runs
// both over one matrix). Read the member's own permissions, not role-merged ones.

import type { PermissionSection } from "@/lib/types";

export function canRunStoreDevice(
  role: string | null | undefined,
  permissions: { store_device?: PermissionSection | null } | null | undefined,
): boolean {
  if (role === "owner" || role === "manager") return true;
  return permissions?.store_device?.view === true;
}
