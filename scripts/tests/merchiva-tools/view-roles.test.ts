import { describe, expect, test } from "bun:test";
import { roleViews } from "@/lib/merchiva/tools/view-roles";
import { uuid } from "./fixtures";

const barista = uuid(401);
const cashier = uuid(402);
const roles = [
  { id: barista, name: "Barista", icon: "coffee", color: "#000", description: "" },
  { id: cashier, name: "Cashier", icon: "cash", color: "#111", description: "" },
];
const task = (n: number, roleId: string, title: string) => ({ id: uuid(n), roleId, title, description: "", requiresEvidence: false });

describe("roleViews", () => {
  test("tasks match their role whether roleId was stored hyphenated or bare hex", () => {
    const out = roleViews(roles, [
      task(501, barista.toString(), "Open the espresso machine"), // manager roles UI / device Tasks app
      task(502, barista.toHexString(), "Clean the grinder"), // chat dashboard task command card
      task(503, cashier.toHexString().toUpperCase(), "Count the float"),
    ]);
    const tasksOf = (name: string) => out.find((r) => r.name === name)!.tasks.map((t) => t.title);
    expect(tasksOf("Barista")).toEqual(["Open the espresso machine", "Clean the grinder"]);
    expect(tasksOf("Cashier")).toEqual(["Count the float"]);
  });

  test("ids handed to the model stay hyphenated for updateRole / updateRoleTask", () => {
    const out = roleViews(roles, [task(504, barista.toHexString(), "Restock cups")]);
    expect(out[0].id).toBe(barista.toString());
    expect(out[0].tasks[0].id).toBe(uuid(504).toString());
  });

  test("a task of another role or with no role is not listed", () => {
    const out = roleViews(roles.slice(0, 1), [task(505, cashier.toString(), "Count the float"), task(506, "", "Orphan")]);
    expect(out[0].tasks).toEqual([]);
  });
});
