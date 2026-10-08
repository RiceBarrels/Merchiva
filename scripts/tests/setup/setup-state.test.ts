import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { isSetupKnownDone, markSetupDone } from "@/lib/setup-state";
import { analyzeSetupState, type MemberRow, type IndexRow, type SettingsRow, type OrgRow } from "../../check-setup-state";

describe("setup-state memory", () => {
  const store = new Map<string, string>();
  const original = (globalThis as { localStorage?: unknown }).localStorage;
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
  });
  afterEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = original;
  });

  test("a store is unknown until marked, then stays done", () => {
    expect(isSetupKnownDone("org-a")).toBe(false);
    markSetupDone("org-a");
    expect(isSetupKnownDone("org-a")).toBe(true);
    expect(isSetupKnownDone("org-b")).toBe(false);
  });

  test("ignores an empty org id and survives a throwing storage", () => {
    markSetupDone("");
    expect(store.size).toBe(0);
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(() => markSetupDone("org-a")).not.toThrow();
    expect(isSetupKnownDone("org-a")).toBe(false);
  });
});

describe("analyzeSetupState", () => {
  const orgs: OrgRow[] = [
    { id: "o1", name: "Done" },
    { id: "o2", name: "Never saved" },
    { id: "o3", name: "No settings" },
  ];
  const settings: SettingsRow[] = [
    { organizationId: "o1", createdMs: 1_000, updatedMs: 60_000 },
    { organizationId: "o2", createdMs: 5_000, updatedMs: 5_400 },
  ];

  test("reports missing, mismatched and stale index rows", () => {
    const members: MemberRow[] = [
      { id: "m1", organizationId: "o1", userId: "u1", status: "active" },
      { id: "m2", organizationId: "o1", userId: "u2", status: "active" },
      { id: "m3", organizationId: "o2", userId: "u3", status: "active" },
      { id: "m4", organizationId: "o2", userId: "u4", status: "disabled" },
    ];
    const index: IndexRow[] = [
      { memberId: "m1", organizationId: "o1", userId: "u1" },
      { memberId: "m3", organizationId: "o2", userId: "someone-else" },
      { memberId: "m4", organizationId: "o2", userId: "u4" },
    ];
    const r = analyzeSetupState(members, index, settings, orgs);
    expect(r.activeMembers).toBe(3);
    expect(r.missingIndex.map((m) => m.id)).toEqual(["m2"]);
    expect(r.mismatchedIndex.map((x) => x.member.id)).toEqual(["m3"]);
    expect(r.staleIndex.map((x) => x.memberId)).toEqual(["m4"]);
  });

  test("separates stores with no settings row from stores whose setup never saved", () => {
    const r = analyzeSetupState([], [], settings, orgs);
    expect(r.orgsWithoutSettings.map((o) => o.id)).toEqual(["o3"]);
    expect(r.orgsNeverSetUp.map((o) => o.id)).toEqual(["o2"]);
  });
});
