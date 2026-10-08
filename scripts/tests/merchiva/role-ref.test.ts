import { describe, expect, test } from "bun:test";
import {
  excludeTasks,
  findRoleTask,
  pinTaskDeletes,
  resolveRoleRef,
  resolveRoleRefs,
  resolveTaskRef,
  roleRefLabel,
  tasksOfRole,
} from "@/lib/merchiva/role-ref";

// The reported role: the model sent its id, the card printed it.
const STAFF_ID = "95c5ca9c-9985-4478-9708-f7b9bf2ef5fc";
const STAFF_HEX = "95c5ca9c998544789708f7b9bf2ef5fc";
const BARISTA_ID = "0a1b2c3d-4e5f-4061-8273-8495a6b7c8d9";

/** An SDK Uuid stand-in: String() gives the hyphenated form, toHexString() the bare one. */
function uuid(hyphenated: string) {
  return { toString: () => hyphenated, toHexString: () => hyphenated.replace(/-/g, "") };
}

const roles = [
  { id: uuid(STAFF_ID), name: "Staff", color: "#44403c" },
  { id: uuid(BARISTA_ID), name: "Barista", color: "#78716c" },
];

describe("resolveRoleRef", () => {
  test("a hyphenated role id resolves to its role", () => {
    expect(resolveRoleRef(roles, STAFF_ID)?.name).toBe("Staff");
  });

  test("the 32-hex form of the same id resolves too", () => {
    expect(resolveRoleRef(roles, STAFF_HEX)?.name).toBe("Staff");
    expect(resolveRoleRef(roles, STAFF_ID.toUpperCase())?.name).toBe("Staff");
  });

  test("a name resolves trimmed and case-insensitively", () => {
    expect(resolveRoleRef(roles, "  barista ")?.name).toBe("Barista");
    expect(resolveRoleRef(roles, "STAFF")?.name).toBe("Staff");
  });

  test("an unknown id, an unknown name or nothing resolves to nothing", () => {
    expect(resolveRoleRef(roles, "11111111-2222-4333-8444-555555555555")).toBeUndefined();
    expect(resolveRoleRef(roles, "Cashier")).toBeUndefined();
    expect(resolveRoleRef(roles, "")).toBeUndefined();
    expect(resolveRoleRef(roles, undefined)).toBeUndefined();
  });

  test("the first ref that resolves wins: roleId before the name", () => {
    expect(resolveRoleRefs(roles, [BARISTA_ID, "Staff"])?.name).toBe("Barista");
    expect(resolveRoleRefs(roles, [undefined, "staff"])?.name).toBe("Staff");
  });
});

describe("roleRefLabel never shows an id", () => {
  test("an id shows the role's name", () => {
    expect(roleRefLabel(roles, { roleId: STAFF_ID })).toBe("Staff");
    // History saved before the fix: the id sat in `role`.
    expect(roleRefLabel(roles, { role: STAFF_HEX })).toBe("Staff");
  });

  test("a name the store lacks is shown as asked", () => {
    expect(roleRefLabel(roles, { role: "Cashier" })).toBe("Cashier");
    expect(roleRefLabel(roles, { roleId: "11111111-2222-4333-8444-555555555555", role: "Cashier" })).toBe("Cashier");
  });

  test("an id that names no role gives null — the caller's 'unknown role' label", () => {
    expect(roleRefLabel(roles, { roleId: "11111111-2222-4333-8444-555555555555" })).toBeNull();
    expect(roleRefLabel(roles, { roleId: "11111111222243338444555555555555", role: "" })).toBeNull();
  });

  test("a roleId is never shown, well-formed or not: a few-shot placeholder or a truncated uuid", () => {
    expect(roleRefLabel(roles, { roleId: "cashier-role-id" })).toBeNull();
    expect(roleRefLabel(roles, { roleId: "95c5ca9c-9985-4478-9708-f7b9bf2ef5f" })).toBeNull();
    expect(roleRefLabel(roles, { roleId: "Cashier" })).toBeNull();
  });

  test("an id-like value in the name field is not shown either", () => {
    expect(roleRefLabel(roles, { role: "95c5ca9c-9985-4478-9708-f7b9bf2ef5f" })).toBeNull();
    expect(roleRefLabel(roles, { role: "cashier-role-id" })).toBeNull();
    expect(roleRefLabel(roles, { role: "the-role-id-here" })).toBeNull();
  });
});

describe("role tasks, whatever form their roleId was stored in", () => {
  const tasks = [
    { id: uuid("aaaaaaaa-0000-4000-8000-000000000001"), roleId: STAFF_ID, title: "Clean up" },
    { id: uuid("aaaaaaaa-0000-4000-8000-000000000002"), roleId: STAFF_HEX, title: "Open store" },
    { id: uuid("aaaaaaaa-0000-4000-8000-000000000003"), roleId: BARISTA_ID, title: "Clean up" },
  ];

  test("tasksOfRole matches hyphenated and 32-hex roleIds against a Uuid object", () => {
    expect(tasksOfRole(tasks, roles[0].id).map((t) => t.title)).toEqual(["Clean up", "Open store"]);
  });

  test("findRoleTask is the duplicate check: same role, same title, any case", () => {
    expect(findRoleTask(tasks, STAFF_HEX, "open STORE")?.title).toBe("Open store");
    expect(findRoleTask(tasks, roles[1].id, "clean up")?.roleId).toBe(BARISTA_ID);
    expect(findRoleTask(tasks, roles[1].id, "Open store")).toBeUndefined();
  });

  test("resolveTaskRef takes the taskId first, in either form", () => {
    expect(resolveTaskRef(tasks, roles, { taskId: "aaaaaaaa000040008000000000000003" })?.roleId).toBe(BARISTA_ID);
  });

  test("a title resolves only within its role — never another role's task of the same name", () => {
    expect(resolveTaskRef(tasks, roles, { roleId: BARISTA_ID, title: "Clean up" })?.id).toBe(tasks[2].id);
    expect(resolveTaskRef(tasks, roles, { role: "staff", title: "clean up" })?.id).toBe(tasks[0].id);
    // No role, or an unknown one: no title-only match across roles.
    expect(resolveTaskRef(tasks, roles, { title: "Clean up" })).toBeUndefined();
    expect(resolveTaskRef(tasks, roles, { role: "Cashier", title: "Clean up" })).toBeUndefined();
  });

  test("a taskId naming no task falls back to the title within the role", () => {
    const ref = { taskId: "ffffffff-0000-4000-8000-000000000000", roleId: STAFF_ID, title: "Open store" };
    expect(resolveTaskRef(tasks, roles, ref)?.title).toBe("Open store");
  });

  test("a delete saved by b44acf0 — the taskId in `title`, no role — resolves by id", () => {
    expect(resolveTaskRef(tasks, roles, { role: "", title: "aaaaaaaa-0000-4000-8000-000000000002" })?.title).toBe("Open store");
    expect(resolveTaskRef(tasks, roles, { role: "", title: "aaaaaaaa000040008000000000000003" })?.roleId).toBe(BARISTA_ID);
  });

  test("excludeTasks leaves out the named tasks, in either id form", () => {
    expect(excludeTasks(tasks, ["aaaaaaaa000040008000000000000001"]).map((t) => t.title)).toEqual(["Open store", "Clean up"]);
    expect(excludeTasks(tasks, [])).toHaveLength(3);
  });
});

describe("pinTaskDeletes", () => {
  const OLD_ID = "bbbbbbbb-0000-4000-8000-000000000001";
  const NEW_ID = "bbbbbbbb-0000-4000-8000-000000000002";
  const before = [
    { id: uuid(OLD_ID), roleId: STAFF_ID, title: "开店准备" },
    { id: uuid("bbbbbbbb-0000-4000-8000-000000000003"), roleId: BARISTA_ID, title: "Clean up" },
  ];

  test("pins each delete to its task's stored id, title and role name", () => {
    const [byTitle, byId, legacy] = pinTaskDeletes(
      [
        { role: "Staff", title: "开店准备" },
        { role: "", title: "", taskId: "bbbbbbbb000040008000000000000003" },
        { role: "", title: OLD_ID },
      ],
      before,
      roles,
    );
    expect(byTitle).toMatchObject({ taskId: OLD_ID, taskTitle: "开店准备", roleName: "Staff" });
    expect(byId).toMatchObject({ taskId: "bbbbbbbb-0000-4000-8000-000000000003", taskTitle: "Clean up", roleName: "Barista" });
    expect(legacy).toMatchObject({ taskId: OLD_ID, taskTitle: "开店准备", roleName: "Staff" });
  });

  test("a delete naming no task is left as it is", () => {
    const del = { role: "Staff", title: "Nope" };
    expect(pinTaskDeletes([del], before, roles)[0]).toEqual(del);
  });

  test("delete + re-add of one title: the replacement is not a duplicate, and the delete keeps the old task", () => {
    // The reply: deleteRoleTask 开店准备 and addRoleTask 开店准备 for Staff.
    const [pinned] = pinTaskDeletes([{ role: "Staff", title: "开店准备" }], before, roles);
    const replaced = [pinned.taskId];
    // CommandGroup's duplicate check leaves the task on its way out aside, so the new one is added.
    expect(findRoleTask(excludeTasks(before, replaced), STAFF_ID, "开店准备")).toBeUndefined();
    const after = [...before, { id: uuid(NEW_ID), roleId: STAFF_ID, title: "开店准备" }];
    // The delete still names the old row, whichever same-titled row a title lookup would hit.
    expect(resolveTaskRef(after, roles, pinned)?.id.toString()).toBe(OLD_ID);
    // And the add card finds its own row.
    expect(findRoleTask(excludeTasks(after, replaced), STAFF_ID, "开店准备")?.id.toString()).toBe(NEW_ID);
  });
});
