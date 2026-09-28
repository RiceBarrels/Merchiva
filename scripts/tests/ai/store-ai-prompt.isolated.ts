// Isolated fixture for scripts/tests/ai/store-ai-prompt.test.ts — NOT auto-discovered by
// `bun test` (no .test. in the name). lib/ai/store-ai-prompt.ts is server-only, and stubbing
// "server-only" with mock.module would leak into other test files sharing a process.
//
// It checks the rules that answer the report "给我排一下班 → asked for a member ID, a punch-in
// code and availability": ids are looked up, nothing unasked is a prerequisite, a missing role is
// proposed, and the rules only name tools the caller has.

import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { buildSystemPrompt } = await import("@/lib/ai/store-ai-prompt");
const { MERCHIVA_TOOL_NAMES } = await import("@/lib/merchiva/tools/names");
const { allowedMerchivaTools } = await import("@/lib/merchiva/tools/access");
const { memberAccess } = await import("@/lib/auth/verify-member");

const ALL = [...MERCHIVA_TOOL_NAMES];
const CONTEXT = { storeName: "BJ Cafe", today: "2026-09-27", team: [{ id: "m1", name: "Muheng Fan" }], roles: [] };
const prompt = (tools: typeof ALL | null) => buildSystemPrompt(CONTEXT, "zh-cn", {}, { isOwner: true }, "chat", tools);
const mentioned = (text: string) => ALL.filter((tool) => new RegExp(`\\b${tool}\\b`).test(text));
/** The system prompt's own rules — from RULES to the auto-schedule block — without the static action catalog. */
const rulesOf = (text: string) => text.slice(text.indexOf("RULES:\n- Always explain"), text.indexOf("AUTO-SCHEDULE BEHAVIOR"));

describe("the main prompt, tools on", () => {
  const text = prompt(ALL);

  test("ids are looked up, never asked for", () => {
    expect(text).toContain("IDS (CRITICAL)");
    expect(text).toContain("never ask the user for an id, a code or any other internal identifier");
    expect(text).toContain("setPunchInCode, addShift) → viewTeam team[].memberId");
    expect(text).not.toContain("Check the LIVE STORE DATA for the relevant IDs");
    expect(text).not.toContain("ask the user to identify the item");
  });

  test("nothing the user didn't ask for is a prerequisite; a missing role is proposed, not asked for", () => {
    expect(text).toContain("ASKING AND PREREQUISITES (CRITICAL)");
    expect(text).toContain("a punch-in code, an availability entry or any other setup is not needed to schedule shifts");
    expect(text).toContain("propose that action block in the same reply");
    expect(text).toContain("Use an /ask card only for a genuine choice between 2–6 concrete options");
    expect(text).not.toContain("hasPunchInCode");
    expect(text).not.toContain("STOP and ASK");
  });

  test("the auto-schedule rules create missing roles first and never teach permission levels as roles", () => {
    expect(text).toContain("If it returns `rolesToCreate`, emit one `addRole` block per entry FIRST");
    expect(text).toContain("do not ask for availability, punch-in codes or any other setup first");
    expect(text).toContain('{"action":"addRole","name":"Staff"');
    expect(text).not.toMatch(/"staffRoles":\["(owner|manager)"\]/);
  });

  test("the rules point at the tools, not at a LIVE STORE DATA dump the model doesn't have", () => {
    const rules = rulesOf(text);
    expect(rules).not.toContain("LIVE STORE DATA");
    expect(rules).toContain("existing team members — viewTeam or the names proposeSchedule returns");
    expect(rules).toContain("orgName = the STORE OVERVIEW's Store line");
    expect(text).not.toContain("LIVE STORE DATA:\n");
  });
});

describe("the main prompt's calendar and read questions", () => {
  test("the store's weeks are spelled out, and a read question is answered, not confirmed", () => {
    const text = prompt(ALL);
    expect(text).toContain("- Today: 2026-09-27 (Sunday).");
    expect(text).toContain("- Last week (上周): 2026-09-14 – 2026-09-20.");
    expect(text).toContain("A question that only reads data needs no confirmation round.");
    expect(text).not.toContain("CURRENT DATE AND TIME (use this for time-based analysis)");
  });
});

describe("the main prompt, tools on for a member without staffing access", () => {
  test("its rules only name tools the member has", () => {
    const tools = allowedMerchivaTools(memberAccess("staff", JSON.stringify({ staffing: { view: false } })));
    const rules = rulesOf(prompt(tools));
    expect(mentioned(rules).every((tool) => tools.includes(tool))).toBe(true);
    expect(rules).toContain("the team roster, which this user has no access to");
  });
});

describe("the main prompt, tools off", () => {
  test("ids and the roster come from LIVE STORE DATA", () => {
    const text = prompt(null);
    expect(text).toContain("LIVE STORE DATA:\n");
    expect(text).toContain("Take every id from LIVE STORE DATA");
    expect(text).toContain('existing team members — the "team" array in LIVE STORE DATA');
    expect(text).toContain('Check "todayShifts" and "upcomingShifts"');
    expect(text).toContain("ASKING AND PREREQUISITES (CRITICAL)");
  });
});

describe("the main prompt's role tasks", () => {
  // The report: a closing task flagged for photo proof unasked, stuck on a store with no group
  // channel. The few-shot taught it (日结对账 had requiresEvidence:true).
  test("photo proof only when the user asks, and never a question about channels", () => {
    const text = prompt(ALL);
    expect(text).toContain("requiresEvidence (photo proof) on addRoleTask / updateRoleTask: set it true ONLY when the user asks");
    expect(text).toContain("never ask about channels yourself");
    expect(text).not.toContain('"requiresEvidence":true');
    expect(text).not.toContain("好的，我来为收银员添加日常任务");
  });

  // "写一下staff的任务" was answered with "请提供任务标题", and "是一家咖啡店 你安排一下" with a shift schedule.
  test("writes a role's tasks itself, reads 安排 in a tasks chat as the tasks, and never copies a placeholder id", () => {
    const text = prompt(ALL);
    expect(text).toContain("Never ask the user to list the tasks");
    expect(text).toContain("\"安排\" means those tasks, not the shift schedule");
    expect(text).toContain("stand for real ids you look up as IDS says, never text to copy");
    expect(text).toContain("Never write such a line yourself; write action blocks.");
  });
});
