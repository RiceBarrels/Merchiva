import { describe, expect, test } from "bun:test";
import { memberAccess } from "@/lib/auth/verify-member";
import { MERCHIVA_TOOL_NAMES, type MerchivaToolName } from "@/lib/merchiva/tools/names";
import {
  allowedMerchivaTools,
  canUseTool,
  MERCHIVA_TOOL_SECTIONS,
} from "@/lib/merchiva/tools/access";

const SALES: MerchivaToolName[] = ["viewSales", "viewFinance", "viewForecast"];
const STAFFING: MerchivaToolName[] = [
  "viewRoles",
  "viewScheduleHistory",
  "viewUpcomingShifts",
  "viewShiftPresets",
  "viewAvailability",
  "proposeSchedule",
];
const INVENTORY: MerchivaToolName[] = ["viewInventory", "viewSuppliers", "viewRestockSuggestions"];

const staff = (perms: object = {}) => memberAccess("staff", JSON.stringify(perms));

describe("tool → section map", () => {
  test("every registered tool is gated by at least one section", () => {
    for (const tool of MERCHIVA_TOOL_NAMES) {
      expect(MERCHIVA_TOOL_SECTIONS[tool]?.length ?? 0, tool).toBeGreaterThan(0);
    }
    expect(Object.keys(MERCHIVA_TOOL_SECTIONS).sort()).toEqual([...MERCHIVA_TOOL_NAMES].sort());
  });

  test("the sections are the ones the matching pages guard", () => {
    for (const tool of SALES) expect(MERCHIVA_TOOL_SECTIONS[tool]).toEqual(["sales"]);
    for (const tool of STAFFING) expect(MERCHIVA_TOOL_SECTIONS[tool]).toEqual(["staffing"]);
    for (const tool of INVENTORY) expect(MERCHIVA_TOOL_SECTIONS[tool]).toEqual(["inventory"]);
    expect(MERCHIVA_TOOL_SECTIONS.viewProducts).toEqual(["products"]);
    // /manager/personnel/team sits in the staffing layout AND has its own team guard.
    expect(MERCHIVA_TOOL_SECTIONS.viewTeam).toEqual(["staffing", "team"]);
  });
});

describe("allowedMerchivaTools", () => {
  test("owners get every tool, whatever their stored sections say", () => {
    const owner = memberAccess("owner", JSON.stringify({ sales: { view: false }, staffing: { view: false } }));
    expect(allowedMerchivaTools(owner)).toEqual([...MERCHIVA_TOOL_NAMES]);
  });

  test("a default staff member gets everything but the team roster (team is off by default)", () => {
    const allowed = allowedMerchivaTools(staff());
    expect(allowed).not.toContain("viewTeam");
    expect(allowed).toEqual(MERCHIVA_TOOL_NAMES.filter((tool) => tool !== "viewTeam"));
  });

  test("no sales access → no sales, finance or forecast tools", () => {
    const allowed = allowedMerchivaTools(staff({ sales: { view: false } }));
    for (const tool of SALES) expect(allowed).not.toContain(tool);
    for (const tool of [...STAFFING, ...INVENTORY, "viewProducts" as const]) expect(allowed).toContain(tool);
  });

  test("no staffing access → no schedule, availability, roles, proposeSchedule — nor team", () => {
    const allowed = allowedMerchivaTools(staff({ staffing: { view: false }, team: { view: true } }));
    for (const tool of STAFFING) expect(allowed).not.toContain(tool);
    expect(allowed).not.toContain("viewTeam");
    for (const tool of SALES) expect(allowed).toContain(tool);
  });

  test("team access on top of staffing adds the roster", () => {
    expect(allowedMerchivaTools(staff({ team: { view: true } }))).toContain("viewTeam");
  });

  test("no inventory access → no inventory, supplier or restock tools", () => {
    const allowed = allowedMerchivaTools(staff({ inventory: { view: false } }));
    for (const tool of INVENTORY) expect(allowed).not.toContain(tool);
  });

  test("no products access → no products tool", () => {
    expect(allowedMerchivaTools(staff({ products: { view: false } }))).not.toContain("viewProducts");
  });

  test("everything switched off → no tools at all", () => {
    const none = staff({
      sales: { view: false },
      staffing: { view: false },
      inventory: { view: false },
      products: { view: false },
    });
    expect(allowedMerchivaTools(none)).toEqual([]);
    for (const tool of MERCHIVA_TOOL_NAMES) expect(canUseTool(none, tool)).toBe(false);
  });

  test("edit rights are not needed to read", () => {
    const viewOnly = staff({ inventory: { view: true, edit: false } });
    expect(canUseTool(viewOnly, "viewRestockSuggestions")).toBe(true);
  });
});
