import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AutonomyConfig, AutonomyMode, GateDecision } from "@/lib/merchiva/autonomy";
import { gateReasonLabel } from "@/lib/merchiva/autonomy-reason";
import {
  awaitedRole,
  gateRoleTaskAction,
  gateRoleTaskCards,
  mayRun,
  pendingCardGate,
  replyRoleIndex,
  type RoleTaskAction,
} from "@/lib/merchiva/role-task-gate";

// Mr. Merchiva's role and task cards (CommandGroup, TaskDeleteGroup) take the
// same gate as every other action: no staffing edit rights ⇒ denied, never run;
// otherwise the org's autonomy config decides auto vs. Confirm. A command the
// user typed needs the permission too, and then runs as typed.

const ACTIONS: readonly RoleTaskAction[] = ["addRole", "addRoleTask", "deleteRoleTask", "deleteRole"];
const MODES: readonly AutonomyMode[] = ["off", "propose_only", "auto_low", "auto_low_medium", "full"];

function config(mode: AutonomyMode, extra: Partial<AutonomyConfig> = {}): AutonomyConfig {
  return {
    enabled: true,
    mode,
    perCategory: {},
    caps: { maxAutoOrderValue: 200, maxAutoRefund: 0, maxPriceChangePct: 10, dailyActionLimit: 30 },
    ...extra,
  };
}

const canAll = () => true;
/** A member who may view staffing but not edit it. */
const viewOnly = (section: string, action: "view" | "edit" | "invite") => section === "staffing" && action === "view";

/** What each mode does with each card: addRole / deleteRoleTask are medium risk, addRoleTask low, deleteRole high. */
const EXPECTED: Record<AutonomyMode, Record<RoleTaskAction, GateDecision>> = {
  off: { addRole: "propose", addRoleTask: "propose", deleteRoleTask: "propose", deleteRole: "propose" },
  propose_only: { addRole: "propose", addRoleTask: "propose", deleteRoleTask: "propose", deleteRole: "propose" },
  auto_low: { addRole: "propose", addRoleTask: "auto", deleteRoleTask: "propose", deleteRole: "propose" },
  auto_low_medium: { addRole: "auto", addRoleTask: "auto", deleteRoleTask: "auto", deleteRole: "propose" },
  full: { addRole: "auto", addRoleTask: "auto", deleteRoleTask: "auto", deleteRole: "auto" },
};

describe("no permission: every role and task card is denied, whatever the config", () => {
  for (const mode of MODES) {
    for (const action of ACTIONS) {
      test(`${action} under ${mode}`, () => {
        const gate = gateRoleTaskAction(action, config(mode), viewOnly);
        expect(gate.decision).toBe("deny");
        expect(gate.why).toEqual({ code: "missingPermission", section: "staffing", action: "edit" });
        expect(mayRun(gate)).toBe(false);
      });
    }
  }

  test("the permission asked for is staffing.edit", () => {
    const asked: string[] = [];
    gateRoleTaskCards(config("full"), (section, action) => {
      asked.push(`${section}.${action}`);
      return true;
    });
    expect(asked).toEqual(["staffing.edit", "staffing.edit", "staffing.edit", "staffing.edit"]);
  });

  test("autonomy switched off does not turn a denial into a proposal", () => {
    for (const action of ACTIONS) {
      expect(gateRoleTaskAction(action, config("full", { enabled: false }), viewOnly).decision).toBe("deny");
    }
  });
});

describe("with permission: the org's autonomy config decides, as for any action", () => {
  for (const mode of MODES) {
    for (const action of ACTIONS) {
      test(`${action} under ${mode} → ${EXPECTED[mode][action]}`, () => {
        const gate = gateRoleTaskAction(action, config(mode), canAll);
        expect(gate.decision).toBe(EXPECTED[mode][action]);
        expect(mayRun(gate)).toBe(true);
      });
    }
  }

  test("the old bypass is gone: addRole and addRoleTask no longer run on their own under off / propose_only", () => {
    for (const mode of ["off", "propose_only"] as const) {
      const gates = gateRoleTaskCards(config(mode), canAll);
      expect(gates.addRole.decision).toBe("propose");
      expect(gates.addRoleTask.decision).toBe("propose");
    }
  });

  test("the reasons are the gate's own codes", () => {
    expect(gateRoleTaskAction("addRole", config("off"), canAll).why).toEqual({ code: "autonomyDisabled" });
    expect(gateRoleTaskAction("addRole", config("auto_low"), canAll).why).toEqual({
      code: "riskNeedsApproval",
      risk: "medium",
      mode: "auto_low",
    });
    expect(gateRoleTaskAction("deleteRole", config("auto_low_medium"), canAll).why).toEqual({
      code: "riskNeedsApproval",
      risk: "high",
      mode: "auto_low_medium",
    });
    expect(gateRoleTaskAction("addRoleTask", config("auto_low"), canAll).why).toEqual({ code: "auto", mode: "auto_low" });
  });

  test("the kill switch proposes everything", () => {
    const gates = gateRoleTaskCards(config("full", { enabled: false }), canAll);
    for (const action of ACTIONS) {
      expect(gates[action].decision).toBe("propose");
      expect(gates[action].why).toEqual({ code: "autonomyDisabled" });
    }
  });

  test("a per-category override for roles beats the global mode", () => {
    const gates = gateRoleTaskCards(config("auto_low", { perCategory: { roles: "full" } }), canAll);
    for (const action of ACTIONS) expect(gates[action].decision).toBe("auto");
    const held = gateRoleTaskCards(config("full", { perCategory: { roles: "propose_only" } }), canAll);
    for (const action of ACTIONS) expect(held[action].decision).toBe("propose");
  });
});

describe("a command the user typed", () => {
  for (const mode of MODES) {
    test(`runs as typed under ${mode}: typing it was the confirm`, () => {
      const gates = gateRoleTaskCards(config(mode), canAll, { fromCommand: true });
      for (const action of ACTIONS) {
        expect(gates[action].decision).toBe("auto");
        expect(gates[action].why).toEqual({ code: "userCommand" });
        expect(gates[action].reason).toBe("user-typed command runs as typed");
        expect(mayRun(gates[action])).toBe(true);
      }
    });

    test(`still needs the permission under ${mode}`, () => {
      const gates = gateRoleTaskCards(config(mode), viewOnly, { fromCommand: true });
      for (const action of ACTIONS) {
        expect(gates[action].decision).toBe("deny");
        expect(gates[action].why.code).toBe("missingPermission");
      }
    });
  }

  test("the reason reads in the viewer's language", () => {
    const zh = JSON.parse(readFileSync(join(import.meta.dir, "../../../messages/zh-cn.json"), "utf8"));
    const t = (key: string): string => key.split(".").reduce((cur, k) => cur?.[k], zh) ?? key;
    const gate = gateRoleTaskAction("deleteRoleTask", config("full"), canAll, { fromCommand: true });
    expect(gateReasonLabel(gate.why, t, String)).toBe("这是你输入的命令，会按输入直接执行。");
  });

  test("the kill switch does not hold back a typed command either", () => {
    const gate = gateRoleTaskAction("deleteRoleTask", config("full", { enabled: false }), canAll, { fromCommand: true });
    expect(gate.decision).toBe("auto");
  });
});

describe("pendingCardGate: what a card waiting its turn shows", () => {
  const deny = gateRoleTaskAction("addRole", config("full"), viewOnly);
  const propose = gateRoleTaskAction("addRole", config("auto_low"), canAll);
  const auto = gateRoleTaskAction("addRole", config("full"), canAll);

  test("a lost permission wins, even over a card queued to run", () => {
    expect(pendingCardGate(deny, true)).toEqual({ decision: "deny", why: deny.why });
    expect(pendingCardGate(deny, false)).toEqual({ decision: "deny", why: deny.why });
  });

  test("a card queued when the reply arrived shows no buttons", () => {
    expect(pendingCardGate(auto, true)).toEqual({ decision: "auto" });
    expect(pendingCardGate(propose, true)).toEqual({ decision: "auto" });
  });

  test("a card not queued waits for Confirm, with the reason when the gate holds it back", () => {
    expect(pendingCardGate(propose, false)).toEqual({ decision: "propose", why: propose.why });
    // A config that loaded later and now says auto: still Confirm (never stranded), with no contradicting reason.
    expect(pendingCardGate(auto, false)).toEqual({ decision: "propose", why: undefined });
  });
});

describe("awaitedRole: a task waits for the role its reply creates, while that role waits for Confirm", () => {
  const replyRoles = [{ title: "Barista" }, { title: "Cashier" }];
  const storeRoles = [{ id: "7d8f2c1a-0000-4000-8000-000000000001", name: "Staff" }];

  test("names a role of the reply that is awaiting Confirm (case-insensitive)", () => {
    expect(awaitedRole({ role: " barista " }, replyRoles, new Set([0, 1]), storeRoles)).toBe(0);
    expect(awaitedRole({ role: "Cashier" }, replyRoles, new Set([1]), storeRoles)).toBe(1);
  });

  test("runs now when that role is no longer awaited", () => {
    expect(awaitedRole({ role: "Barista" }, replyRoles, new Set([1]), storeRoles)).toBe(-1);
  });

  test("runs now when the store already has the role, by name or id", () => {
    expect(awaitedRole({ role: "Staff" }, [{ title: "Staff" }], new Set([0]), storeRoles)).toBe(-1);
    expect(
      awaitedRole({ role: "Barista", roleId: "7d8f2c1a-0000-4000-8000-000000000001" }, replyRoles, new Set([0]), storeRoles),
    ).toBe(-1);
  });

  test("runs now when the reply creates no such role", () => {
    expect(awaitedRole({ role: "Manager" }, replyRoles, new Set([0, 1]), storeRoles)).toBe(-1);
    expect(awaitedRole({ role: "" }, replyRoles, new Set([0, 1]), storeRoles)).toBe(-1);
  });

  // addRoleTask's only role field is roleId: a task for a role the same reply
  // creates carries the role's name there (parseAllSkills: { role: "", roleId: "Barista" }).
  test("a name in roleId waits for the reply's role too", () => {
    expect(awaitedRole({ role: "", roleId: "Barista" }, replyRoles, new Set([0, 1]), storeRoles)).toBe(0);
    expect(awaitedRole({ role: "", roleId: " cashier " }, replyRoles, new Set([1]), storeRoles)).toBe(1);
    expect(awaitedRole({ role: "", roleId: "Barista" }, replyRoles, new Set([1]), storeRoles)).toBe(-1);
  });

  test("an id in roleId is never taken for a name", () => {
    const id = "0199aa01-2b3c-4d5e-8f60-7182939a4b5c";
    expect(awaitedRole({ role: "", roleId: id }, [{ title: id }], new Set([0]), storeRoles)).toBe(-1);
  });
});

describe("replyRoleIndex: the role of the reply a task names", () => {
  const replyRoles = [{ title: "Night Clerk" }, { title: "Barista" }];

  test("by role or by a name in roleId, case-insensitive", () => {
    expect(replyRoleIndex({ role: "barista" }, replyRoles)).toBe(1);
    expect(replyRoleIndex({ role: "", roleId: "Night Clerk" }, replyRoles)).toBe(0);
    expect(replyRoleIndex({ role: "Manager", roleId: "night clerk" }, replyRoles)).toBe(0);
  });

  test("none when neither field names one of the reply's roles", () => {
    expect(replyRoleIndex({ role: "", roleId: "7d8f2c1a-0000-4000-8000-000000000001" }, replyRoles)).toBe(-1);
    expect(replyRoleIndex({ role: "Manager" }, replyRoles)).toBe(-1);
    expect(replyRoleIndex({ role: "" }, replyRoles)).toBe(-1);
  });

  test("only the roles `only` keeps", () => {
    expect(replyRoleIndex({ role: "", roleId: "Barista" }, replyRoles, (i) => i === 0)).toBe(-1);
  });
});
