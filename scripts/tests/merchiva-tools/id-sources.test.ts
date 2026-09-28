import { describe, expect, test } from "bun:test";
import { generateActionsPrompt, getActionCatalog } from "@/lib/merchiva/action-registry";
import { buildIdRulesBlock, ID_SOURCES, idParamDescription } from "@/lib/merchiva/tools/id-sources";
import { MERCHIVA_TOOL_NAMES, type MerchivaToolName } from "@/lib/merchiva/tools/names";
import { allowedMerchivaTools } from "@/lib/merchiva/tools/access";
import { memberAccess } from "@/lib/auth/verify-member";

const ALL = [...MERCHIVA_TOOL_NAMES];
const catalog = getActionCatalog();
const mentioned = (text: string) => ALL.filter((tool) => new RegExp(`\\b${tool}\\b`).test(text));

// That the tools really return these fields, hyphenated, is checked end to end over the SQL
// endpoint in sql-source.isolated.ts ("every id an action takes is where ID_SOURCES says").
describe("ID_SOURCES covers the action registry", () => {
  test("every id parameter of every action has a source", () => {
    const uncovered: string[] = [];
    for (const action of catalog) {
      for (const param of action.parameters.filter((p) => /Id$/.test(p.name))) {
        const source = ID_SOURCES.find((s) => s.param === param.name);
        if (!source?.actions.includes(action.name)) uncovered.push(`${action.name}.${param.name}`);
      }
    }
    expect(uncovered).toEqual([]);
  });

  test("every source names real actions that take that id", () => {
    for (const source of ID_SOURCES) {
      for (const name of source.actions) {
        const action = catalog.find((a) => a.name === name);
        expect(action, name).toBeDefined();
        // inventoryItemId sits inside inventoryUsage[].
        const param = action!.parameters.find((p) => p.name === (source.param === "inventoryItemId" ? "inventoryUsage" : source.param));
        expect(param, `${name}.${source.param}`).toBeDefined();
        for (const { tool } of source.from) expect(param!.description, `${name}.${source.param}`).toContain(tool);
      }
    }
  });

  test("parameter descriptions name the tool, and keep the LIVE STORE DATA field for the tools-off path", () => {
    const setPunch = catalog.find((a) => a.name === "setPunchInCode")!.parameters.find((p) => p.name === "memberId")!;
    expect(setPunch.description).toContain('viewTeam team[].memberId (kind "member")');
    expect(setPunch.description).toContain("without tools, LIVE STORE DATA team[].id");
    for (const action of catalog) {
      for (const p of action.parameters) expect(p.description, `${action.name}.${p.name}`).not.toMatch(/^.*from LIVE STORE DATA/);
    }
    expect(idParamDescription("couponId", "The coupon")).toContain("No read tool lists these");
    expect(() => idParamDescription("nopeId", "x")).toThrow();
  });
});

describe("buildIdRulesBlock", () => {
  test("with every tool: every id has a tool, and the user is never asked for one", () => {
    const block = buildIdRulesBlock(ALL);
    for (const s of ID_SOURCES.filter((s) => s.from.length)) expect(block).toContain(`- ${s.param} (`);
    expect(block).toContain("never ask the user for an id, a code or any other internal identifier");
    expect(block).toContain("setPunchInCode, addShift) → viewTeam team[].memberId");
    expect(block).toContain("No tool you have lists: couponId");
  });

  test("names only the tools the caller has; ids only a withheld tool returns are listed as unavailable", () => {
    const access = memberAccess("staff", JSON.stringify({ staffing: { view: false }, products: { view: false } }));
    const tools = allowedMerchivaTools(access);
    const block = buildIdRulesBlock(tools);
    expect(mentioned(block).every((tool) => tools.includes(tool))).toBe(true);
    expect(block).not.toContain("viewTeam");
    expect(block).toMatch(/No tool you have lists: memberId, staffMemberId, shiftId, requestId, tradeId, roleId, taskId, dayId, objectiveId, productId, couponId\./);
    expect(block).toContain("say in one sentence that you can't look it up here");
  });

  test("tools off: the ids come from LIVE STORE DATA", () => {
    const block = buildIdRulesBlock(null);
    expect(mentioned(block)).toEqual([]);
    expect(block).toContain("Take every id from LIVE STORE DATA");
    expect(block).toContain("- memberId (setPunchInCode, addShift) → team[].id");
    expect(block).toContain("LIVE STORE DATA does not list: staffMemberId, couponId.");
  });

  test("a tool is only named for the ids it returns", () => {
    const only: MerchivaToolName[] = ["viewSuppliers"];
    const block = buildIdRulesBlock(only);
    expect(mentioned(block)).toEqual(["viewSuppliers"]);
    expect(block).toContain("- supplierId (orderFromSupplier, createPurchaseOrder, updateSupplier, deleteSupplier) → viewSuppliers suppliers[].id");
  });
});

describe("the actions prompt", () => {
  test("no longer makes a punch-in code a scheduling prerequisite", () => {
    const prompt = generateActionsPrompt();
    expect(prompt).not.toContain("hasPunchInCode");
    expect(prompt).not.toContain("STOP and ASK");
    expect(prompt).toContain("A shift needs nothing else: no punch-in code, no availability entry");
    expect(catalog.find((a) => a.name === "setPunchInCode")!.description).toContain("only when the user asks");
  });

  test("a missing role is proposed with addRole in the same reply, not asked for", () => {
    const prompt = generateActionsPrompt();
    expect(prompt).toContain("put an `addRole` block for one first, in the same reply");
    const staffRoles = catalog.find((a) => a.name === "addShift")!.parameters.find((p) => p.name === "staffRoles")!;
    expect(staffRoles.description).toContain("rolesToCreate");
    expect(staffRoles.description).not.toContain("ask the user");
  });
});
