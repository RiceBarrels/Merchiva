/**
 * Where every id an action block takes comes from. Pure.
 *
 * With read tools on, the system prompt carries only a slim STORE OVERVIEW,
 * so an id is only ever as reachable as the tool that returns it: a parameter
 * description that pointed at the LIVE STORE DATA dump sent the model looking
 * for data it did not have, and it asked the user for a "member ID" instead.
 * This map is the single list of which tool returns which id (and where the
 * dump keeps it when tools are off); scripts/tests/merchiva-tools/id-sources.test.ts
 * checks it covers every id parameter in lib/merchiva/action-registry.ts and
 * that the tools really return those fields.
 */

import type { MerchivaToolName } from "@/lib/merchiva/tools/names";

export interface IdSource {
  /** The action parameter (`inventoryItemId` sits inside `inventoryUsage[]`). */
  param: string;
  /** The actions that take it. */
  actions: readonly string[];
  /** The read tools that return it, and where in their result. Empty: no tool lists it. */
  from: ReadonlyArray<{ tool: MerchivaToolName; field: string }>;
  /** Where the LIVE STORE DATA dump keeps it (tools off), when it does. */
  live?: string;
}

export const ID_SOURCES: readonly IdSource[] = [
  {
    param: "memberId",
    actions: ["setPunchInCode", "addShift"],
    from: [
      { tool: "viewTeam", field: 'team[].memberId (kind "member")' },
      { tool: "proposeSchedule", field: "shifts[].memberId" },
    ],
    live: "team[].id",
  },
  {
    param: "staffMemberId",
    actions: ["updateStaffMember", "deleteStaffMember"],
    from: [{ tool: "viewTeam", field: 'team[].staffMemberId (kind "placeholder")' }],
  },
  {
    param: "shiftId",
    actions: ["updateShift", "deleteShift"],
    from: [
      { tool: "viewUpcomingShifts", field: "shifts[].id" },
      { tool: "viewScheduleHistory", field: "shifts[].id" },
    ],
    live: "todayShifts[].id / upcomingShifts[].id",
  },
  {
    param: "requestId",
    actions: ["approveTimeOff"],
    from: [{ tool: "viewAvailability", field: "pendingTimeOff[].requestId" }],
    live: "timeOffRequests[].id",
  },
  {
    param: "tradeId",
    actions: ["approveShiftTrade"],
    from: [{ tool: "viewAvailability", field: "pendingShiftTrades[].tradeId" }],
    live: "shiftTrades[].id",
  },
  {
    param: "roleId",
    actions: ["updateRole", "deleteRole", "addRoleTask"],
    from: [{ tool: "viewRoles", field: "roles[].id" }],
    live: "roles[].id",
  },
  {
    param: "taskId",
    actions: ["updateRoleTask", "deleteRoleTask"],
    from: [{ tool: "viewRoles", field: "roles[].tasks[].id" }],
    live: "roles[].tasks[].id",
  },
  {
    param: "dayId",
    actions: ["updateTrainingDay", "deleteTrainingDay", "addTrainingObjective"],
    from: [{ tool: "viewRoles", field: "training[].dayId (or pass dayNumber)" }],
    live: "training.days[].id (or pass dayNumber)",
  },
  {
    param: "objectiveId",
    actions: ["updateTrainingObjective", "deleteTrainingObjective"],
    from: [{ tool: "viewRoles", field: "training[].objectives[].objectiveId" }],
    live: "training.days[].objectives[].id",
  },
  {
    param: "itemId",
    actions: ["updateInventory", "updateInventoryItem", "deleteInventoryItem"],
    from: [
      { tool: "viewInventory", field: "items[].id" },
      { tool: "viewRestockSuggestions", field: "suggestions[].itemId" },
    ],
    live: "inventory[].id",
  },
  {
    param: "inventoryItemId",
    actions: ["addProduct", "updateProduct"],
    from: [{ tool: "viewInventory", field: "items[].id" }],
    live: "inventory[].id",
  },
  {
    param: "productId",
    actions: ["updatePrice", "updateProduct", "deleteProduct"],
    from: [{ tool: "viewProducts", field: "products[].id" }],
    live: "products[].id",
  },
  {
    param: "supplierId",
    actions: ["orderFromSupplier", "createPurchaseOrder", "updateSupplier", "deleteSupplier"],
    from: [
      { tool: "viewSuppliers", field: "suppliers[].id" },
      { tool: "viewRestockSuggestions", field: "bySupplier[].supplierId" },
    ],
    live: "suppliers[].id",
  },
  // Coupons lived on the marketing page, which was removed; nothing lists them.
  { param: "couponId", actions: ["updateCoupon", "deleteCoupon"], from: [] },
];

/**
 * An action parameter's description: `what` it is, then where it comes from —
 * the tools that return it, and the LIVE STORE DATA field for the tools-off path.
 */
export function idParamDescription(param: string, what: string): string {
  const source = ID_SOURCES.find((s) => s.param === param);
  if (!source) throw new Error(`No id source for ${param}`);
  if (source.from.length === 0) return `${what}. No read tool lists these; without one, say so rather than ask the user for it`;
  const tools = source.from.map((f) => `${f.tool} ${f.field}`).join(" or ");
  return `${what}: ${tools}${source.live ? `; without tools, LIVE STORE DATA ${source.live}` : ""}`;
}

function line(source: IdSource, where: string): string {
  return `- ${source.param} (${source.actions.join(", ")}) → ${where}`;
}

/**
 * The prompt's id rule: where each id comes from, among the tools this caller
 * has (`readTools`), or in the LIVE STORE DATA dump when tools are off (null).
 * A tool the caller was not given is never named; the ids only it returns are
 * listed as ones this user cannot look up.
 */
export function buildIdRulesBlock(readTools: readonly MerchivaToolName[] | null): string {
  const toolsOn = readTools !== null;
  const has = new Set(readTools ?? []);
  const found: string[] = [];
  const missing: string[] = [];
  for (const source of ID_SOURCES) {
    if (toolsOn) {
      const from = source.from.filter((f) => has.has(f.tool));
      if (from.length) found.push(line(source, from.map((f) => `${f.tool} ${f.field}`).join(" or ")));
      else missing.push(source.param);
    } else if (source.live) {
      found.push(line(source, source.live));
    } else {
      missing.push(source.param);
    }
  }
  const where = toolsOn ? "Look every id up with your read tools" : "Take every id from LIVE STORE DATA";
  const parts = [
    `IDS (CRITICAL): Action blocks need the real ids of the rows they change. ${where} — never ask the user for an id, a code or any other internal identifier, and never make one up. To find which row the user means, match the name they used against the tool's rows; ask them only when that name matches several rows or none.`,
  ];
  if (found.length) parts.push(`Where each id comes from:\n${found.join("\n")}`);
  if (missing.length) {
    parts.push(
      `${toolsOn ? "No tool you have lists" : "LIVE STORE DATA does not list"}: ${missing.join(", ")}. If a request needs one of those, say in one sentence that you can't look it up here — don't ask the user for it.`,
    );
  }
  return parts.join("\n");
}
