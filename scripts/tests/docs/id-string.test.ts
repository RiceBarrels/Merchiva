// idString must give an SDK Uuid the hyphenated form the module writes into
// every reference column (`member.id.toString()`), or a mapped id never equals
// a stored ownerMemberId / memberId / versionId.

import { describe, expect, test } from "bun:test";
import { Uuid } from "spacetimedb";
import { idString } from "@/lib/docs/mappers";

describe("idString", () => {
  test("a Uuid maps to its lowercase 8-4-4-4-12 form, equal to Uuid.toString()", () => {
    const uuid = Uuid.fromRandomBytesV4(new Uint8Array(16).map((_, i) => (i * 37 + 11) & 0xff));
    const id = idString(uuid);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(id).toBe(uuid.toString().toLowerCase());
  });

  test("strings pass through; nullish is empty; hex-only values keep toHexString", () => {
    expect(idString("abc")).toBe("abc");
    expect(idString(null)).toBe("");
    expect(idString(undefined)).toBe("");
    expect(idString({ toHexString: () => "c0ffee" })).toBe("c0ffee");
  });
});
