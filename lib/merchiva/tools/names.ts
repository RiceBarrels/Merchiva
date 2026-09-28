/**
 * Every read tool `buildMerchivaTools` registers, by name. Pure, so the tool
 * events, the AI cursor targets (lib/merchiva/tool-targets.ts) and tests can
 * check against the same list; tools.ts fails to compile if they drift.
 */

export const MERCHIVA_TOOL_NAMES = [
  "viewTeam",
  "viewRoles",
  "viewScheduleHistory",
  "viewUpcomingShifts",
  "viewShiftPresets",
  "viewAvailability",
  "viewInventory",
  "viewSuppliers",
  "viewProducts",
  "viewSales",
  "viewFinance",
  "viewForecast",
  "viewRestockSuggestions",
  "proposeSchedule",
] as const;

export type MerchivaToolName = (typeof MERCHIVA_TOOL_NAMES)[number];
