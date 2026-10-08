// The client mirror of setDocumentVisibility's owner rule (lib/docs/access.ts docVisibilityRule): only a private
// document's owner may open it to the store, unless the owner has left; anyone else who makes a store document
// private cannot undo it. Plus the id helpers the rule and the version links rely on.
import { describe, expect, test } from "bun:test";

import { docVisibilityRule, sameMemberId } from "@/lib/docs/access";
import { canonicalUuidText } from "@/lib/docs/ids";
import { idString } from "@/lib/docs/mappers";

const OWNER = "5b2f8e1c-3a4d-4e6f-8a9b-0c1d2e3f4a5b";
const MANAGER = "9d1c2b3a-4e5f-4a6b-8c7d-0e1f2a3b4c5d";

describe("docVisibilityRule", () => {
  const rule = (visibility: "private" | "org_view" | "org_edit", senderMemberId: string | null, ownerActive = true) =>
    docVisibilityRule({ visibility, ownerMemberId: OWNER, senderMemberId, ownerActive });

  test("the owner may do anything", () => {
    for (const visibility of ["private", "org_view", "org_edit"] as const) {
      expect(rule(visibility, OWNER)).toEqual({ storeLocked: false, privateIsOneWay: false });
    }
    // The same member read through toHexString (no dashes, any case).
    expect(rule("private", OWNER.replace(/-/g, "").toUpperCase())).toEqual({ storeLocked: false, privateIsOneWay: false });
  });

  test("anyone else cannot open a private document to the store, and making one private is one-way", () => {
    expect(rule("private", MANAGER)).toEqual({ storeLocked: true, privateIsOneWay: false });
    expect(rule("org_view", MANAGER)).toEqual({ storeLocked: false, privateIsOneWay: true });
    expect(rule("org_edit", MANAGER)).toEqual({ storeLocked: false, privateIsOneWay: true });
    // Not known yet: the reducer decides, so nothing is promised.
    expect(rule("private", null)).toEqual({ storeLocked: true, privateIsOneWay: false });
  });

  test("a document whose owner has left can be reopened by a manager", () => {
    expect(rule("private", MANAGER, false)).toEqual({ storeLocked: false, privateIsOneWay: false });
    expect(rule("org_edit", MANAGER, false)).toEqual({ storeLocked: false, privateIsOneWay: false });
  });
});

describe("member and row ids", () => {
  test("sameMemberId ignores dashes and case, never matches empty", () => {
    expect(sameMemberId(OWNER, OWNER.replace(/-/g, "").toUpperCase())).toBe(true);
    expect(sameMemberId(OWNER, MANAGER)).toBe(false);
    expect(sameMemberId("", "")).toBe(false);
    expect(sameMemberId(null, null)).toBe(false);
  });

  test("canonicalUuidText gives a 32-hex id its dashes back, as idString writes a Uuid", () => {
    const hyphenated = "0f8fad5b-d9cb-469f-a165-70867728950e";
    expect(canonicalUuidText("0f8fad5bd9cb469fa16570867728950e")).toBe(hyphenated);
    expect(canonicalUuidText(` ${hyphenated.toUpperCase()} `)).toBe(hyphenated);
    expect(canonicalUuidText("t-1")).toBe("t-1");
    // idString of an SDK Uuid is that same form.
    const uuid = { __uuid__: 0x0f8fad5bd9cb469fa16570867728950en, toString: () => hyphenated, toHexString: () => hyphenated.replace(/-/g, "") };
    expect(idString(uuid)).toBe(canonicalUuidText(uuid.toHexString()));
  });
});
