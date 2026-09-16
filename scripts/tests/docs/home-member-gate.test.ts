import { describe, expect, test } from "bun:test";
import { memberCanUseDocs, type DocsGateMemberRow } from "@/components/docs/home/member-gate";
import { loadServerDeclarations } from "./server-source";

// [role, stored permissions JSON, can use Docs]
const CASES: ReadonlyArray<readonly [string, string, boolean]> = [
  ["owner", JSON.stringify({ dashboard: { view: false } }), true],
  ["owner", "not json", true],
  ["manager", JSON.stringify({ dashboard: { view: true } }), true],
  ["manager", JSON.stringify({ dashboard: { view: false } }), false],
  ["staff", JSON.stringify({ dashboard: { view: true } }), true],
  ["staff", JSON.stringify({ dashboard: { view: false } }), false],
  ["staff", JSON.stringify({ dashboard: {} }), false],
  ["staff", JSON.stringify({ dashboard: null }), false],
  ["staff", JSON.stringify({ dashboard: { view: "true" } }), false],
  ["staff", JSON.stringify({ dashboard: true }), false],
  // No stored dashboard key: the role default (view: true) applies, on the server and in the layout merge.
  ["staff", JSON.stringify({ inventory: { view: true } }), true],
  ["staff", "{}", true],
  ["staff", "", true],
  ["staff", "null", true],
  ["staff", "[]", true],
  ["staff", "{broken", true],
];

describe("memberCanUseDocs", () => {
  for (const [role, permissions, expected] of CASES) {
    test(`${role} ${permissions || "(empty)"} → ${expected}`, () => {
      expect(memberCanUseDocs({ role, permissions })).toBe(expected);
    });
  }
});

const server = loadServerDeclarations(["docMemberGate"]);

describe.if(server !== null)("server docMemberGate parity (spacetimedb/src/index.ts)", () => {
  const serverGate = server?.docMemberGate as (member: DocsGateMemberRow) => boolean;
  for (const [role, permissions] of CASES) {
    test(`${role} ${permissions || "(empty)"}`, () => {
      expect(memberCanUseDocs({ role, permissions })).toBe(serverGate({ role, permissions }));
    });
  }
});
