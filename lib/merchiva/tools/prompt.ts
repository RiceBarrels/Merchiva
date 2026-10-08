/**
 * The read-tool parts of Mr. Merchiva's system prompt, built from the tools
 * this caller was actually given (lib/merchiva/tools/access.ts). Pure.
 *
 * A tool the caller may not use is not in the request at all, so the guide
 * only describes the ones that are, then names what the caller has no access
 * to and tells the model to say so. "Algorithms compute, AI explains" also
 * means no tool, no number: the model must not fill the gap from the store
 * overview, earlier messages or a guess.
 */

import { MERCHIVA_TOOL_NAMES, type MerchivaToolName } from "@/lib/merchiva/tools/names";

type Has = (tool: MerchivaToolName) => boolean;

function hasIn(tools: readonly MerchivaToolName[]): Has {
  const set = new Set(tools);
  return (tool) => set.has(tool);
}

/** What the caller cannot see when a tool is withheld, in words for the user. */
export const TOOL_AREAS: Record<MerchivaToolName, string> = {
  viewTeam: "the team roster",
  viewRoles: "roles, role tasks and the training curriculum",
  viewScheduleHistory: "shift history",
  viewUpcomingShifts: "upcoming shifts",
  viewShiftPresets: "shift templates",
  viewAvailability: "staff availability and time off",
  proposeSchedule: "schedule proposals",
  viewInventory: "inventory",
  viewSuppliers: "suppliers",
  viewRestockSuggestions: "restock suggestions",
  viewProducts: "products and prices",
  viewSales: "sales figures",
  viewFinance: "finances (profit, costs, payroll, cash flow)",
  viewForecast: "sales forecasts",
};

/** The areas behind every tool NOT in `tools`, in registry order. */
export function withheldAreas(tools: readonly MerchivaToolName[]): string[] {
  const has = hasIn(tools);
  return MERCHIVA_TOOL_NAMES.filter((tool) => !has(tool)).map((tool) => TOOL_AREAS[tool]);
}

// One line per domain, present only when its tool(s) are.
const PEOPLE_TOOLS: Array<[MerchivaToolName, string]> = [
  ["viewUpcomingShifts", "viewUpcomingShifts (today's and future shifts, with the ids updateShift/deleteShift need)"],
  ["viewScheduleHistory", "viewScheduleHistory (past shifts: who usually works when)"],
  ["viewAvailability", "viewAvailability (weekly availability, pending time off and shift trades)"],
  ["viewShiftPresets", "viewShiftPresets (shift templates)"],
  ["viewTeam", "viewTeam (the roster with each person's memberId or staffMemberId; addShift.staffName must match a name in it)"],
];

function domainLines(has: Has): string[] {
  const lines: string[] = [];
  if (has("proposeSchedule")) {
    lines.push(
      `- Scheduling ("排班", "schedule next week"): call proposeSchedule — it needs no setup first (no availability, presets or roles required). Put every constraint the user stated into its \`constraints\` (who is unavailable when, personal hour limits, how many people a shift needs). In the same reply, emit one addRole block per rolesToCreate entry, then exactly one addShift block per returned shift, copying staffName, memberId, date, startTime, endTime, shiftType and staffRoles — each block is an approval card, so don't ask first. Never add, drop or move shifts yourself — to change the plan, call proposeSchedule again with new constraints.`,
    );
  }
  const people = PEOPLE_TOOLS.filter(([tool]) => has(tool)).map(([, text]) => text);
  if (people.length > 0) lines.push(`- Shifts and people: ${people.join("; ")}.`);
  if (has("viewRestockSuggestions")) {
    lines.push(
      `- Restock / what to order: call viewRestockSuggestions — it gives priority, days until stockout, order quantity (supplier minimum and whole cases already applied), unit cost and estimated cost, grouped by supplier with supplierId and supplierLanguage. Unless the user named a quantity, copy it as-is into orderFromSupplier: items[].quantity = orderQty, items[].caseCount = cases, items[].unitsPerCase and items[].unitCost from the suggestion, supplierId and supplierLanguage from its bySupplier entry.`,
    );
  }
  const stock = [
    has("viewInventory") &&
      "viewInventory (stock levels and item details, with item ids — one item's stock: pass its itemId or search by name; lowOnly is only for what is running low)",
    has("viewSuppliers") && "viewSuppliers (supplier ids, contacts and language)",
  ].filter(Boolean);
  if (stock.length > 0) lines.push(`- Inventory and suppliers: ${stock.join("; ")}.`);
  if (has("viewRestockSuggestions") || has("viewInventory") || has("viewSuppliers")) {
    lines.push(
      `- Supplier restock actions must pass the supplier's language as supplierLanguage, include every item name, and include unitsPerCase/caseCount when ordering full cases. Leave subtotal and total out — the app computes them from each item's unitCost × quantity.`,
    );
  }
  if (has("viewFinance")) {
    lines.push(
      `- Finance — profit, margin, costs, labor, payroll, cash flow, P&L: call viewFinance (period: this_week, last_week, this_month, last_month, this_quarter, this_year, or days for a rolling window).`,
    );
  }
  if (has("viewForecast")) lines.push(`- Forecast — expected sales, how busy, what-if: call viewForecast.`);
  if (has("viewSales")) {
    const compare = has("viewFinance") ? "compare viewSales and viewFinance periods" : "compare viewSales periods";
    lines.push(
      `- Sales history / trends / anomalies: call viewSales (daily revenue with weekdays, the range's exact total and the currency) — pass period (last_week for "上周", this_month, …) or from/to for calendar ranges, days only for "the last N days", and quote its total. For "why did X change", ${compare}; don't invent causes the data doesn't show.`,
    );
  }
  if (has("viewRoles")) lines.push(`- Roles, role tasks and training: call viewRoles (role and task ids, training day and objective ids).`);
  if (has("viewProducts")) lines.push(`- Pricing / products: call viewProducts.`);
  return lines;
}

/** Said whenever something is withheld: name it, never guess it. */
function noAccessBlock(areas: string[]): string {
  return `NO ACCESS — this user's account cannot see: ${areas.join("; ")}. You have no tool for that data. If they ask about it, or ask for work that depends on it, say in one short sentence that their account doesn't have access to it, and that an owner (or a manager who has that access) can check it or grant it. Never guess, estimate, recall or compute those figures — not from the store overview, earlier messages or general knowledge.`;
}

/**
 * The read-tool guide for exactly `tools` (the caller's allowed tools, see
 * allowedMerchivaTools). Appended to the system prompt when tools are on.
 */
export function buildToolsPromptBlock(tools: readonly MerchivaToolName[]): string {
  const has = hasIn(tools);
  const areas = withheldAreas(tools);
  const parts: string[] = [];

  if (tools.length === 0) {
    parts.push(
      `LIVE DATA ACCESS — READ TOOLS:
You have no read tools for this user: their account has no access to the store's live data, so you cannot look anything up. You only have the brief STORE OVERVIEW (below).`,
    );
  } else {
    parts.push(
      `LIVE DATA ACCESS — READ TOOLS:
You start with only a brief STORE OVERVIEW (below). Before answering data questions or producing any \`\`\`action\`\`\` blocks, CALL THE READ TOOLS to fetch the current data you need. The tools return the real row ids every action block needs (see IDS) — look them up; never ask the user for one.`,
    );
  }

  parts.push(
    `ALGORITHMS COMPUTE, YOU EXPLAIN. Forecast, finance, schedule and restock numbers come ONLY from Merchiva's engine tools. Never estimate, add up, average or project them yourself, and never build a schedule or an order quantity by hand — call the engine tool, then explain its output in plain words (what drives it, what stands out, what to do). If an engine tool returns an error or notEnoughData, say so; do not fill the gap with your own numbers.`,
  );

  const lines = domainLines(has);
  if (lines.length > 0) parts.push(`Domain → tools:\n${lines.join("\n")}`);
  if (areas.length > 0) parts.push(noAccessBlock(areas));

  if (tools.length > 0) {
    parts.push(
      `Fetch only what the request needs — don't call every tool. NEVER invent ids, names, or numbers; if a tool returns an error, tell the user the live data is unavailable. After fetching, give your answer and any action blocks as usual.`,
    );
  } else {
    parts.push(`NEVER invent ids, names, or numbers.`);
  }
  return parts.join("\n\n");
}

// ── Engine numbers ────────────────────────────────────────────────────────────

const ENGINE_LINES: Array<{ tool: MerchivaToolName; use: (has: Has) => string; topic: string }> = [
  {
    tool: "viewFinance",
    use: () => "Profit, margin, revenue totals, labor or payroll cost, cost structure, cash flow, P&L → call **viewFinance**.",
    topic: "Profit, margin, costs, payroll and cash flow",
  },
  {
    tool: "viewForecast",
    use: (has) =>
      `Future sales or demand, "next week", "if this continues", what-if questions → call **viewForecast**${
        has("viewFinance") ? " (and viewFinance as well when money is involved)" : ""
      }.`,
    topic: "Forecasts and what-if questions",
  },
  {
    tool: "viewRestockSuggestions",
    use: () => "What to reorder and how much → call **viewRestockSuggestions**.",
    topic: "What to reorder and how much",
  },
  {
    tool: "proposeSchedule",
    use: () => "Building or filling a schedule → call **proposeSchedule** (see AUTO-SCHEDULE BEHAVIOR).",
    topic: "Building or filling a schedule",
  },
];

/** The engines rule, listing the engine tools the caller has and naming the ones they don't. */
export function buildEngineNumbersBlock(tools: readonly MerchivaToolName[]): string {
  const has = hasIn(tools);
  const bullets = ENGINE_LINES.map(({ tool, use, topic }) =>
    has(tool)
      ? `- ${use(has)}`
      : `- ${topic} → this user has no access (no tool). Say so; never produce those numbers yourself.`,
  );
  return `NUMBERS COME FROM MERCHIVA'S ENGINES (CRITICAL):
Forecasts, finances, schedules and restock quantities are computed by Merchiva's own engines and exposed as read tools. Call the tool and explain what it returns; never produce those numbers yourself.
${bullets.join("\n")}
Quote the figures exactly as the tool returns them — same amounts, same periods, same units. Never add them up, average, extrapolate, re-derive or "adjust" them, and never fill a gap with an estimate of your own. If the tool does not return a figure the question needs, say which figures it does give and what is missing. Your part is the explanation: what the numbers mean, what drives them, and what the user could do about it.`;
}
