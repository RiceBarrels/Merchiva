import { describe, expect, test } from "bun:test";
import { parseAllSkills } from "@/lib/merchiva/skills/registry";

const ROLE_ID = "95c5ca9c-9985-4478-9708-f7b9bf2ef5fc";
const ROLE_HEX = "95c5ca9c998544789708f7b9bf2ef5fc";
const TASK_ID = "aaaaaaaa-0000-4000-8000-000000000001";

function block(action: Record<string, unknown>): string {
  return "```action\n" + JSON.stringify(action) + "\n```";
}

describe("parseAllSkills: addRoleTask blocks become task cards with the id in its own field", () => {
  test("the reported reply: roleId only — the id never lands in `role`, which the card shows", () => {
    const parsed = parseAllSkills(
      "咖啡店员工的日常任务：\n" +
        block({ action: "addRoleTask", roleId: ROLE_ID, title: "开店准备", description: "开机、备豆", startTime: "06:30", endTime: "07:00" }) +
        block({ action: "addRoleTask", roleId: ROLE_ID, title: "闭店收尾", requiresEvidence: true }),
    );
    expect(parsed.actions).toEqual([]);
    expect(parsed.tasksAdd).toEqual([
      { role: "", roleId: ROLE_ID, title: "开店准备", des: "开机、备豆", startTime: "06:30", endTime: "07:00", requiresEvidence: false },
      { role: "", roleId: ROLE_ID, title: "闭店收尾", des: "", startTime: null, endTime: null, requiresEvidence: true },
    ]);
    expect(parsed.cleanText).toBe("咖啡店员工的日常任务：");
  });

  test("a 32-hex roleId (older replies) is carried hyphenated", () => {
    const parsed = parseAllSkills(block({ action: "addRoleTask", roleId: ROLE_HEX, title: "Clean up" }));
    expect(parsed.tasksAdd[0].roleId).toBe(ROLE_ID);
    expect(parsed.tasksAdd[0].role).toBe("");
  });

  test("a role name stays in `role`, and no roleId is invented", () => {
    const parsed = parseAllSkills(block({ action: "addRoleTask", role: "Barista", title: "Clean up" }));
    expect(parsed.tasksAdd[0]).toMatchObject({ role: "Barista", title: "Clean up" });
    expect("roleId" in parsed.tasksAdd[0]).toBe(false);
  });

  test("requiresEvidence written as the string \"false\" is false", () => {
    const parsed = parseAllSkills(block({ action: "addRoleTask", roleId: ROLE_ID, title: "Mop", requiresEvidence: "false" }));
    expect(parsed.tasksAdd[0].requiresEvidence).toBe(false);
  });
});

describe("parseAllSkills: deleteRoleTask blocks", () => {
  test("a taskId goes in `taskId`, not in `title` (the card showed the uuid and deleted nothing)", () => {
    const parsed = parseAllSkills(block({ action: "deleteRoleTask", taskId: TASK_ID }));
    expect(parsed.tasksDelete).toEqual([{ role: "", title: "", taskId: TASK_ID }]);
  });

  test("a title with a roleId keeps both, the roleId hyphenated", () => {
    const parsed = parseAllSkills(block({ action: "deleteRoleTask", roleId: ROLE_HEX, title: "Clean up" }));
    expect(parsed.tasksDelete).toEqual([{ role: "", title: "Clean up", roleId: ROLE_ID }]);
  });
});

describe("parseAllSkills: legacy /tasks commands are unchanged", () => {
  test("a name-based add still parses", () => {
    const parsed = parseAllSkills(`/tasks add '{"role":"Barista","title":"Restock cups","requiresEvidence":"false"}'`);
    expect(parsed.tasksAdd).toEqual([
      { role: "Barista", title: "Restock cups", des: "", startTime: null, endTime: null, requiresEvidence: false },
    ]);
  });
});

describe("parseAllSkills: other actions keep their ids hyphenated", () => {
  test("an update's 32-hex id is normalized when the block is parsed", () => {
    const parsed = parseAllSkills(block({ action: "deleteShift", shiftId: ROLE_HEX }));
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0].action).toEqual({ action: "deleteShift", shiftId: ROLE_ID });
  });
});
