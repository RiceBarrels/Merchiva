/**
 * Which of Mr. Merchiva's read tools a caller may be given. Pure.
 *
 * Each tool reads what a /manager page shows, so it needs `view` on the
 * section(s) that page's PermissionGuard checks: Mr. Merchiva never shows a
 * caller more than they could open themselves. The permissions come from the
 * caller's own org_member row, verified server-side (lib/auth/verify-member.ts),
 * and owners see everything. A tool the caller may not use is not given to the
 * model at all; the prompt then tells it to say so rather than guess
 * (lib/merchiva/tools/prompt.ts). MCP tools are the user's own connections and
 * are not gated here.
 */

import { canAccess, type MemberAccess } from "@/lib/auth/verify-member";
import { MERCHIVA_TOOL_NAMES, type MerchivaToolName } from "@/lib/merchiva/tools/names";

/** Permission sections a read tool can depend on. */
export type ToolSection = "sales" | "staffing" | "team" | "inventory" | "products";

/** The sections each tool needs `view` on — ALL of them. */
export const MERCHIVA_TOOL_SECTIONS: Record<MerchivaToolName, readonly ToolSection[]> = {
  // /manager/personnel/* — the personnel layout guards "staffing".
  viewRoles: ["staffing"],
  viewScheduleHistory: ["staffing"],
  viewUpcomingShifts: ["staffing"],
  viewShiftPresets: ["staffing"],
  viewAvailability: ["staffing"],
  proposeSchedule: ["staffing"],
  // /manager/personnel/team — inside that layout, plus its own "team" guard.
  viewTeam: ["staffing", "team"],
  // /manager/inventory (its Restock tab included) and /manager/suppliers — "inventory".
  viewInventory: ["inventory"],
  viewSuppliers: ["inventory"],
  viewRestockSuggestions: ["inventory"],
  // /manager/products and /manager/pricing — "products".
  viewProducts: ["products"],
  // /manager/sales (the forecast lives there), /manager/finances, /manager/reports — "sales".
  viewSales: ["sales"],
  viewFinance: ["sales"],
  viewForecast: ["sales"],
};

export function canUseTool(access: MemberAccess, tool: MerchivaToolName): boolean {
  return MERCHIVA_TOOL_SECTIONS[tool].every((section) => canAccess(access, section, "view"));
}

/** The read tools this caller may be given, in registry order. */
export function allowedMerchivaTools(access: MemberAccess): MerchivaToolName[] {
  return MERCHIVA_TOOL_NAMES.filter((tool) => canUseTool(access, tool));
}
