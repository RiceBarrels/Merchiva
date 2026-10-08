import { describe, expect, test } from "bun:test";
import { memberAccess } from "@/lib/auth/verify-member";
import { allowedMerchivaTools } from "@/lib/merchiva/tools/access";
import { MERCHIVA_TOOL_NAMES, type MerchivaToolName } from "@/lib/merchiva/tools/names";
import {
  buildEngineNumbersBlock,
  buildToolsPromptBlock,
  TOOL_AREAS,
  withheldAreas,
} from "@/lib/merchiva/tools/prompt";

const ALL = [...MERCHIVA_TOOL_NAMES];
const without = (...drop: MerchivaToolName[]) => ALL.filter((tool) => !drop.includes(tool));

/** Tool names mentioned in `text`, matched as whole identifiers. */
function mentioned(text: string): MerchivaToolName[] {
  return ALL.filter((tool) => new RegExp(`\\b${tool}\\b`).test(text));
}

describe("buildToolsPromptBlock", () => {
  test("with every tool: all of them are described and nothing is withheld", () => {
    const block = buildToolsPromptBlock(ALL);
    expect(mentioned(block)).toEqual(ALL);
    expect(block).not.toContain("NO ACCESS");
    expect(block).toContain("ALGORITHMS COMPUTE, YOU EXPLAIN");
    expect(block).toContain("CALL THE READ TOOLS");
  });

  test("a withheld tool is never named, and its area is listed as no access", () => {
    const sales: MerchivaToolName[] = ["viewSales", "viewFinance", "viewForecast"];
    const tools = without(...sales);
    const block = buildToolsPromptBlock(tools);
    expect(mentioned(block)).toEqual(tools);
    expect(block).toContain("NO ACCESS");
    for (const tool of sales) expect(block).toContain(TOOL_AREAS[tool]);
    // Tells the model what to say, and not to guess.
    expect(block).toContain("doesn't have access");
    expect(block).toContain("Never guess, estimate, recall or compute those figures");
  });

  test("tracks exactly the tools a real member was given", () => {
    const access = memberAccess("staff", JSON.stringify({ staffing: { view: false }, products: { view: false } }));
    const tools = allowedMerchivaTools(access);
    const block = buildToolsPromptBlock(tools);
    expect(mentioned(block)).toEqual(tools);
    expect(block).not.toContain("proposeSchedule");
    expect(block).not.toContain("addShift block per returned shift");
    expect(block).toContain(TOOL_AREAS.proposeSchedule);
    expect(block).toContain(TOOL_AREAS.viewProducts);
  });

  test("comparisons only point at tools that exist", () => {
    expect(buildToolsPromptBlock(without("viewFinance"))).toContain("compare viewSales periods");
    expect(buildToolsPromptBlock(ALL)).toContain("compare viewSales and viewFinance periods");
  });

  test("restock guidance maps the engine's fields onto the order line", () => {
    const block = buildToolsPromptBlock(ALL);
    expect(block).toContain("items[].quantity = orderQty");
    expect(block).toContain("items[].unitCost");
    expect(block).toContain("Leave subtotal and total out");
  });

  test("no tools at all: says so, lists everything as no access, never names a tool", () => {
    const block = buildToolsPromptBlock([]);
    expect(mentioned(block)).toEqual([]);
    expect(block).toContain("You have no read tools for this user");
    expect(block).not.toContain("CALL THE READ TOOLS");
    for (const tool of ALL) expect(block).toContain(TOOL_AREAS[tool]);
  });

  test("withheldAreas lists the missing tools' areas in registry order", () => {
    expect(withheldAreas(ALL)).toEqual([]);
    expect(withheldAreas(without("viewTeam", "viewProducts"))).toEqual([TOOL_AREAS.viewTeam, TOOL_AREAS.viewProducts]);
  });
});

describe("buildEngineNumbersBlock", () => {
  test("names the engine tools the caller has", () => {
    const block = buildEngineNumbersBlock(ALL);
    expect(mentioned(block)).toEqual(["viewFinance", "viewForecast", "viewRestockSuggestions", "proposeSchedule"]);
    expect(block).not.toContain("no access");
  });

  test("a missing engine is described as no access, never by name", () => {
    const block = buildEngineNumbersBlock(without("viewFinance", "viewForecast"));
    expect(mentioned(block)).toEqual(["viewRestockSuggestions", "proposeSchedule"]);
    expect(block).toContain("Profit, margin, costs, payroll and cash flow → this user has no access");
    expect(block).toContain("Forecasts and what-if questions → this user has no access");
    expect(block).toContain("never produce those numbers yourself");
  });

  test("the forecast line only mentions viewFinance when it is available", () => {
    expect(buildEngineNumbersBlock(without("viewFinance"))).not.toContain("viewFinance");
    expect(buildEngineNumbersBlock(ALL)).toContain("(and viewFinance as well when money is involved)");
  });
});
