// Who may run a shared store device: the module's rule (spacetimedb/src/device/store-access.ts)
// and the client's (lib/store-device-access.ts) over one matrix, and the strip a manager's
// invitation gets.

import { describe, expect, test } from "bun:test";
import { canRunStoreDevice as serverCan, withoutStoreDevicePower } from "@/spacetimedb/src/device/store-access";
import { canRunStoreDevice as clientCan } from "@/lib/store-device-access";

const CASES: Array<{ role: string; stored: unknown; can: boolean }> = [
  { role: "owner", stored: {}, can: true },
  { role: "manager", stored: {}, can: true },
  { role: "manager", stored: { store_device: { view: false } }, can: true },
  { role: "staff", stored: {}, can: false },
  { role: "staff", stored: { store_device: { view: true } }, can: true },
  { role: "staff", stored: { store_device: { view: false } }, can: false },
  { role: "staff", stored: { store_device: { view: "yes" } }, can: false },
  { role: "staff", stored: { settings: { view: true }, drive: { view: true, edit: true } }, can: false },
];

describe("canRunStoreDevice", () => {
  test("owners and managers by role; staff only with store_device.view — the module and the client agree", () => {
    for (const { role, stored, can } of CASES) {
      expect(serverCan({ role, permissions: JSON.stringify(stored) })).toBe(can);
      expect(clientCan(role, stored as never)).toBe(can);
    }
  });

  test("unreadable stored permissions grant nothing", () => {
    for (const permissions of ["", "not json", "null", undefined, null]) {
      expect(serverCan({ role: "staff", permissions })).toBe(false);
    }
    expect(clientCan("staff", null)).toBe(false);
    expect(clientCan(null, undefined)).toBe(false);
  });
});

describe("withoutStoreDevicePower", () => {
  test("forces store_device off and keeps every other section", () => {
    const stripped = JSON.parse(withoutStoreDevicePower('{"inventory":{"view":true},"store_device":{"view":true}}'));
    expect(stripped).toEqual({ inventory: { view: true }, store_device: { view: false } });
    expect(JSON.parse(withoutStoreDevicePower("{}"))).toEqual({ store_device: { view: false } });
    for (const unchanged of ["", "not json", "null", "[]", "7"]) expect(withoutStoreDevicePower(unchanged)).toBe(unchanged);
  });
});
