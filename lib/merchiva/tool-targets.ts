/**
 * Where in /manager Mr. Merchiva is working when he calls a tool or runs an action — the page
 * his cursor moves to. `anchor` is a presence id: `nav:<route>` is the sidebar row of that page
 * (see components/presence), which the cursor falls back to when the viewer is on another page.
 *
 * Pure: shared by the chat (client) and anything on the server that wants the same mapping.
 */

export interface AiTarget {
  /** A /manager route, no query or hash. */
  route: string;
  /** Presence id of the element to point at: `nav:<route>` for the page's sidebar row. */
  anchor: string;
}

function page(route: string): AiTarget {
  return { route, anchor: `nav:${route}` };
}

const SCHEDULE = page("/manager/personnel/schedule");
const TEAM = page("/manager/personnel/team");
const ROLES = page("/manager/personnel/roles");
const TRAINING = page("/manager/personnel/training");
const INVENTORY = page("/manager/inventory");
const SUPPLIERS = page("/manager/suppliers");
const PRODUCTS = page("/manager/products");
const PRICING = page("/manager/pricing");
const SALES = page("/manager/sales");
const FINANCES = page("/manager/finances");

/** Read tools (lib/merchiva/tools.ts) → the page that shows the same data. */
const TOOL_TARGETS: Record<string, AiTarget> = {
  viewTeam: TEAM,
  viewRoles: ROLES,
  viewScheduleHistory: SCHEDULE,
  viewUpcomingShifts: SCHEDULE,
  viewShiftPresets: SCHEDULE,
  viewAvailability: SCHEDULE,
  proposeSchedule: SCHEDULE,
  viewInventory: INVENTORY,
  viewRestockSuggestions: INVENTORY,
  viewSuppliers: SUPPLIERS,
  viewProducts: PRODUCTS,
  viewSales: SALES,
  viewForecast: SALES,
  viewFinance: FINANCES,
};

/**
 * Write actions, by ActionDefinition.category (lib/merchiva/action-registry.ts). `notifications`
 * (createNotification) has no page: notifications are built in, with no inbox to point at.
 */
const CATEGORY_TARGETS: Record<string, AiTarget> = {
  scheduling: SCHEDULE,
  staffing: TEAM,
  roles: ROLES,
  training: TRAINING,
  inventory: INVENTORY,
  suppliers: SUPPLIERS,
  products: PRODUCTS,
  pricing: PRICING,
};

/** The page a read tool works on; `null` for MCP tools and anything unknown. */
export function toolTarget(tool: string): AiTarget | null {
  return Object.prototype.hasOwnProperty.call(TOOL_TARGETS, tool) ? TOOL_TARGETS[tool] : null;
}

/** The page a write action of this category changes; `null` when the category is unknown. */
export function categoryTarget(category: string | undefined): AiTarget | null {
  if (!category) return null;
  return Object.prototype.hasOwnProperty.call(CATEGORY_TARGETS, category) ? CATEGORY_TARGETS[category] : null;
}
