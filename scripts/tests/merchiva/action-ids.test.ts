import { describe, expect, test } from "bun:test";
import { ACTION_ID_PARAMS, boolParam, isUuidRef, looksLikeId, normalizeActionIds, sameId, storedId } from "@/lib/merchiva/action-ids";
import { ID_SOURCES } from "@/lib/merchiva/tools/id-sources";

const HYPHENATED = "95c5ca9c-9985-4478-9708-f7b9bf2ef5fc";
const BARE = "95c5ca9c998544789708f7b9bf2ef5fc";

describe("id forms", () => {
  test("sameId compares hyphenated, 32-hex, upper-case and Uuid-like values", () => {
    expect(sameId(HYPHENATED, BARE)).toBe(true);
    expect(sameId(BARE.toUpperCase(), HYPHENATED)).toBe(true);
    expect(sameId({ toString: () => HYPHENATED }, BARE)).toBe(true);
    expect(sameId(HYPHENATED, "95c5ca9c-9985-4478-9708-f7b9bf2ef5fd")).toBe(false);
  });

  test("nothing equals nothing: an empty id never matches", () => {
    expect(sameId("", "")).toBe(false);
    expect(sameId(undefined, null)).toBe(false);
  });

  test("storedId writes the hyphenated form every reference column holds — never toHexString()", () => {
    expect(storedId(BARE)).toBe(HYPHENATED);
    expect(storedId({ toString: () => HYPHENATED, toHexString: () => BARE })).toBe(HYPHENATED);
  });

  test("isUuidRef tells an id from a name", () => {
    expect(isUuidRef(HYPHENATED)).toBe(true);
    expect(isUuidRef(BARE)).toBe(true);
    expect(isUuidRef("Staff")).toBe(false);
    expect(isUuidRef("")).toBe(false);
  });
});

describe("normalizeActionIds", () => {
  test("every id parameter in ID_SOURCES is covered", () => {
    for (const source of ID_SOURCES) {
      if (source.param === "inventoryItemId") continue;
      expect(ACTION_ID_PARAMS.has(source.param)).toBe(true);
    }
  });

  test("rewrites 32-hex ids to the hyphenated form and leaves everything else alone", () => {
    const out = normalizeActionIds({
      action: "updateShift",
      shiftId: BARE,
      memberId: ` ${BARE.toUpperCase()} `,
      staffName: "Ana",
      date: "2026-09-30",
    });
    expect(out).toEqual({
      action: "updateShift",
      shiftId: HYPHENATED,
      memberId: HYPHENATED,
      staffName: "Ana",
      date: "2026-09-30",
    });
  });

  test("reaches the inventoryItemId inside inventoryUsage[]", () => {
    const out = normalizeActionIds({
      action: "addProduct",
      inventoryUsage: [{ inventoryItemId: BARE, quantity: 2 }, "junk"],
    });
    expect(out.inventoryUsage).toEqual([{ inventoryItemId: HYPHENATED, quantity: 2 }, "junk"]);
  });

  test("does not mutate its input, and keeps values that are not uuids", () => {
    const input = { action: "deleteRoleTask", taskId: BARE, dayId: "not-an-id" };
    const out = normalizeActionIds(input);
    expect(input.taskId).toBe(BARE);
    expect(out.dayId).toBe("not-an-id");
  });
});

describe("boolParam", () => {
  test("only true and \"true\" are true — Boolean(\"false\") was", () => {
    expect(boolParam(true)).toBe(true);
    expect(boolParam("true")).toBe(true);
    expect(boolParam(" TRUE ")).toBe(true);
    expect(boolParam("false")).toBe(false);
    expect(boolParam(false)).toBe(false);
    expect(boolParam(1)).toBe(false);
    expect(boolParam(undefined)).toBe(false);
  });
});

describe("looksLikeId: a ref never shown to a person", () => {
  test("uuids in either form, truncated or padded ones, and few-shot placeholders", () => {
    expect(looksLikeId(HYPHENATED)).toBe(true);
    expect(looksLikeId(BARE)).toBe(true);
    expect(looksLikeId("95c5ca9c-9985-4478-9708-f7b9bf2ef5f")).toBe(true);
    expect(looksLikeId(`${HYPHENATED}0`)).toBe(true);
    expect(looksLikeId("cashier-role-id")).toBe(true);
    expect(looksLikeId("the-role-id-here")).toBe(true);
  });

  test("role names are not ids", () => {
    for (const name of ["Staff", "Barista", "Morning Cashier", "收银员", "ID Checker", "Kid Helper", "Barista 2"]) {
      expect(looksLikeId(name)).toBe(false);
    }
    expect(looksLikeId("")).toBe(false);
    expect(looksLikeId(undefined)).toBe(false);
  });
});
