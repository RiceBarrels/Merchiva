import { describe, expect, test } from "bun:test";
import { defaultPermissions, ownerPermissions } from "@/lib/db/team";
import {
  canAccess,
  canUseMerchiva,
  memberAccess,
  permissionSummary,
  roleDefaultPermissions,
} from "@/lib/auth/verify-member";

// Sections the client still carries in its defaults but that no page or tool
// reads any more (their features were removed).
const RETIRED = ["pos", "website"];

function live(perms: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(perms).filter(([key]) => !RETIRED.includes(key)));
}

describe("role defaults mirror the client's (lib/db/team.ts)", () => {
  test("staff and manager rows merge onto defaultPermissions()", () => {
    expect(roleDefaultPermissions("staff")).toEqual(live(defaultPermissions()));
    expect(roleDefaultPermissions("manager")).toEqual(live(defaultPermissions()));
  });

  test("owner rows merge onto ownerPermissions()", () => {
    expect(roleDefaultPermissions("owner")).toEqual(live(ownerPermissions()));
  });
});

describe("memberAccess — the layout's merge", () => {
  test("stored sections override the role defaults; missing ones keep them", () => {
    const access = memberAccess("staff", JSON.stringify({ sales: { view: false }, team: { view: true } }));
    expect(access.isOwner).toBe(false);
    expect(access.permissions.sales).toEqual({ view: false });
    expect(access.permissions.team).toEqual({ view: true });
    expect(access.permissions.staffing).toEqual({ view: true, edit: false });
  });

  test("unreadable JSON falls back to the role defaults", () => {
    expect(memberAccess("staff", "not json").permissions).toEqual(roleDefaultPermissions("staff"));
    expect(memberAccess("staff", "").permissions).toEqual(roleDefaultPermissions("staff"));
    expect(memberAccess("owner", "{").permissions).toEqual(roleDefaultPermissions("owner"));
  });

  test("a JSON null keeps the defaults, as the spread in the layout does", () => {
    expect(memberAccess("manager", "null").permissions).toEqual(roleDefaultPermissions("manager"));
  });
});

describe("canAccess — lib/context/permissions.tsx can()", () => {
  test("owners may do anything, even with every section switched off", () => {
    const owner = memberAccess("owner", JSON.stringify({ sales: { view: false }, inventory: null }));
    expect(canAccess(owner, "sales", "view")).toBe(true);
    expect(canAccess(owner, "inventory", "edit")).toBe(true);
    expect(canAccess(owner, "unknown-section", "view")).toBe(true);
  });

  test("everyone else needs the flag to be exactly true", () => {
    const staff = memberAccess(
      "staff",
      JSON.stringify({ sales: { view: "yes" }, products: true, inventory: null, team: { view: true, invite: true } }),
    );
    expect(canAccess(staff, "sales", "view")).toBe(false);
    expect(canAccess(staff, "products", "view")).toBe(false);
    expect(canAccess(staff, "inventory", "view")).toBe(false);
    expect(canAccess(staff, "team", "view")).toBe(true);
    expect(canAccess(staff, "team", "invite")).toBe(true);
    expect(canAccess(staff, "team", "edit")).toBe(false);
    expect(canAccess(staff, "staffing", "view")).toBe(true);
    expect(canAccess(staff, "staffing", "edit")).toBe(false);
    expect(canAccess(staff, "unknown-section", "view")).toBe(false);
  });

  test("the action defaults to view", () => {
    expect(canAccess(memberAccess("staff", "{}"), "sales")).toBe(true);
    expect(canAccess(memberAccess("staff", "{}"), "team")).toBe(false);
  });
});

describe("canUseMerchiva — the chat and dock's `isOwner || can(\"merchiva\", \"view\")`", () => {
  test("on by default for every role", () => {
    expect(canUseMerchiva(memberAccess("staff", "{}"))).toBe(true);
    expect(canUseMerchiva(memberAccess("manager", "{}"))).toBe(true);
    expect(canUseMerchiva(memberAccess("owner", "{}"))).toBe(true);
  });

  test("an admin's per-member switch turns it off, except for owners", () => {
    const off = JSON.stringify({ merchiva: { view: false } });
    expect(canUseMerchiva(memberAccess("staff", off))).toBe(false);
    expect(canUseMerchiva(memberAccess("manager", off))).toBe(false);
    expect(canUseMerchiva(memberAccess("owner", off))).toBe(true);
  });
});

describe("permissionSummary — the prompt's permissions block", () => {
  test("has the client payload's shape, built from the verified row", () => {
    const summary = permissionSummary(memberAccess("manager", JSON.stringify({ inventory: { view: true, edit: true } })));
    expect(summary.isOwner).toBe(false);
    expect(summary.role).toBe("manager");
    expect(summary.sections.inventory).toEqual({ view: true, edit: true });
    expect(summary.sections.team).toEqual({ view: false, edit: false });
    expect(summary.sections.sales).toEqual({ view: true, edit: undefined });
  });
});
