import { describe, expect, test } from "bun:test";
import { RefIndex, actionTarget, captureRefLabels, savedRefLabel, type RefWords } from "@/lib/merchiva/ref-labels";
import { resolveShiftRoles, resolveShiftStaff, shiftRoleEntries } from "@/lib/merchiva/shift-refs";
import { actionFailureText, actionSuccessText, scrubIds } from "@/lib/merchiva/action-toasts";
import { ActionError } from "@/lib/merchiva/action-error";

const STAFF_ROLE = "95c5ca9c-9985-4478-9708-f7b9bf2ef5fc";
const ANA = "11111111-1111-4111-8111-111111111111";
const PLACEHOLDER = "22222222-2222-4222-8222-222222222222";
const SHIFT = "33333333-3333-4333-8333-333333333333";
const TASK = "44444444-4444-4444-8444-444444444444";
const DAY = "55555555-5555-4555-8555-555555555555";
const ITEM = "66666666-6666-4666-8666-666666666666";
const hex = (id: string) => id.replace(/-/g, "");

const refs = new RefIndex({
  members: [{ id: ANA, displayName: "Ana", userId: "abc", status: "active" }],
  placeholders: [{ id: PLACEHOLDER, name: "Temp Tom" }],
  shifts: [{ id: SHIFT, staffName: "Ana", date: "2026-09-30", startTime: "09:00", endTime: "17:00" }],
  timeOff: [{ id: "77777777-7777-4777-8777-777777777777", userId: "abc", startDate: "2026-10-01", endDate: "2026-10-03" }],
  roles: [{ id: STAFF_ROLE, name: "Staff" }],
  tasks: [{ id: TASK, roleId: hex(STAFF_ROLE), title: "闭店收尾" }],
  trainingDays: [{ id: DAY, dayNumber: 3, title: "Espresso" }],
  objectives: [{ id: "88888888-8888-4888-8888-888888888888", text: "<p>Pull a <b>shot</b></p>" }],
  items: [{ id: ITEM, name: "Oat milk", retailPrice: 4.5 }],
  suppliers: [{ id: "99999999-9999-4999-8999-999999999999", name: "Bean Co" }],
  coupons: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", code: "FALL10" }],
});
const words: RefWords = { day: (n) => `Day ${n}` };

describe("RefIndex.label: a card shows the row's name, never its id", () => {
  test("every id parameter resolves, in either id form", () => {
    expect(refs.label("roleId", hex(STAFF_ROLE), words)).toBe("Staff");
    expect(refs.label("memberId", ANA, words)).toBe("Ana");
    expect(refs.label("staffMemberId", hex(PLACEHOLDER), words)).toBe("Temp Tom");
    expect(refs.label("shiftId", SHIFT, words)).toBe("Ana · 2026-09-30 · 09:00–17:00");
    expect(refs.label("requestId", "77777777777747778777777777777777", words)).toBe("Ana · 2026-10-01–2026-10-03");
    expect(refs.label("taskId", TASK, words)).toBe("闭店收尾 · Staff");
    expect(refs.label("dayId", DAY, words)).toBe("Day 3 · Espresso");
    expect(refs.label("objectiveId", "88888888-8888-4888-8888-888888888888", words)).toBe("Pull a shot");
    expect(refs.label("productId", ITEM, words)).toBe("Oat milk");
    expect(refs.label("supplierId", "99999999-9999-4999-8999-999999999999", words)).toBe("Bean Co");
    expect(refs.label("couponId", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", words)).toBe("FALL10");
  });

  test("an id that names nothing gives null (the card's neutral label), not the id", () => {
    expect(refs.label("roleId", "12345678-1234-4234-8234-123456789012", words)).toBeNull();
    expect(refs.label("unknownParam", "12345678-1234-4234-8234-123456789012", words)).toBeNull();
    expect(refs.label("roleId", "", words)).toBeNull();
  });

  test("the price cap's baseline is the item's current retail price", () => {
    expect(refs.retailPrice(hex(ITEM))).toBe(4.5);
    expect(refs.retailPrice("nope")).toBeNull();
  });
});

describe("actionTarget: what a toast names", () => {
  test("the row an id names, before the action runs", () => {
    expect(actionTarget({ action: "deleteShift", shiftId: SHIFT }, refs, words)).toBe("Ana · 2026-09-30 · 09:00–17:00");
  });

  test("a setPunchInCode toast never names the PIN", () => {
    expect(actionTarget({ action: "setPunchInCode", memberId: "nope", code: "1234" }, refs, words)).toBeNull();
    expect(actionTarget({ action: "setPunchInCode", memberId: ANA, code: "1234" }, refs, words)).toBe("Ana");
  });

  test("falls back to a name the action carries, never to a uuid", () => {
    expect(actionTarget({ action: "addSupplier", name: "Milk Co" }, refs, words)).toBe("Milk Co");
    expect(actionTarget({ action: "updateRole", roleId: "12345678-1234-4234-8234-123456789012" }, refs, words)).toBeNull();
  });
});

describe("addShift approval: the person and the roles", () => {
  const members = [
    { id: { toString: () => ANA }, displayName: "Ana" },
    { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", displayName: "Ana" },
  ];
  const placeholders = [{ id: PLACEHOLDER, name: "Temp Tom" }];

  test("the model's memberId wins over a name that differs or is shared", () => {
    expect(resolveShiftStaff({ memberId: "bbbbbbbbbbbb4bbb8bbbbbbbbbbbbbbb", staffName: "ana m." }, members, placeholders))
      .toEqual({ memberId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Ana" });
  });

  test("a placeholder staff member is accepted by id or by name", () => {
    expect(resolveShiftStaff({ memberId: PLACEHOLDER }, members, placeholders)).toEqual({ memberId: PLACEHOLDER, name: "Temp Tom" });
    expect(resolveShiftStaff({ staffName: "temp tom" }, members, placeholders)).toEqual({ memberId: PLACEHOLDER, name: "Temp Tom" });
  });

  test("no id and an unknown name: nobody", () => {
    expect(resolveShiftStaff({ staffName: "Zed" }, members, placeholders)).toBeNull();
  });

  test("staffRoles may hold role names or role ids; the shift is written with names", () => {
    const roles = [{ id: STAFF_ROLE, name: "Staff" }];
    const out = resolveShiftRoles([hex(STAFF_ROLE), "staff", "morning", "12345678-1234-4234-8234-123456789012"], roles);
    expect(out.names).toEqual(["Staff"]);
    expect(out.entries).toEqual([
      { name: "Staff", shown: "Staff" },
      { name: "Staff", shown: "Staff" },
      { name: null, shown: "morning" },
      { name: null, shown: null },
    ]);
  });

  test("staffRoles as a JSON string or one bare name", () => {
    expect(shiftRoleEntries('["Staff","Barista"]')).toEqual(["Staff", "Barista"]);
    expect(shiftRoleEntries("Staff")).toEqual(["Staff"]);
    expect(shiftRoleEntries(undefined)).toEqual([]);
  });
});

describe("action toasts", () => {
  const t = (key: string) => ({
    "merchiva.actions.deleteShift": "Delete shift",
    "merchiva.toast.done": "Done: {action}",
    "merchiva.toast.doneWithTarget": "Done: {action} · {target}",
    "merchiva.toast.orderEmailed": "Order emailed",
    "merchiva.toast.orderDraft": "Order saved as draft",
    "merchiva.toast.failed": "Action failed: {reason}",
    "merchiva.toast.targetMissing": "Couldn't find it",
    "merchiva.toast.unknownAction": "Unknown action",
  } as Record<string, string>)[key] ?? key;

  test("success names the target, translated", () => {
    expect(actionSuccessText(t, { action: "deleteShift" }, "Ana · 2026-09-30")).toBe("Done: Delete shift · Ana · 2026-09-30");
    expect(actionSuccessText(t, { action: "deleteShift" }, null)).toBe("Done: Delete shift");
    expect(actionSuccessText(t, { action: "orderFromSupplier", __emailed: true }, null)).toBe("Order emailed");
  });

  test("failures never carry an id", () => {
    expect(actionFailureText(t, new ActionError("targetMissing", "Shift not found"))).toBe("Couldn't find it");
    expect(actionFailureText(t, new Error(`Role task ${TASK} not found`))).toBe("Action failed: Role task … not found");
    expect(actionFailureText(t, new Error("Action not recognized: nope"))).toBe("Unknown action");
    expect(scrubIds(`x ${hex(TASK)} y`)).toBe("x … y");
  });
});

describe("captureRefLabels: a card still names a row once it is gone", () => {
  test("every id the action carries, nested ones too, keyed by its canonical id", () => {
    const saved = captureRefLabels(
      { action: "updateProduct", productId: hex(ITEM), inventoryUsage: [{ inventoryItemId: ITEM, quantity: 1 }], roleId: "nope" },
      refs,
      words,
    );
    expect(saved).toEqual({ [ITEM]: "Oat milk" });
  });

  test("after a delete the live lookup fails and the saved label answers, in either id form", () => {
    const saved = captureRefLabels({ action: "deleteShift", shiftId: SHIFT }, refs, words);
    const gone = new RefIndex({});
    expect(gone.label("shiftId", SHIFT, words)).toBeNull();
    expect(savedRefLabel(saved, hex(SHIFT))).toBe("Ana · 2026-09-30 · 09:00–17:00");
    expect(savedRefLabel(saved, "12345678-1234-4234-8234-123456789012")).toBeNull();
    expect(savedRefLabel(undefined, SHIFT)).toBeNull();
  });
});
