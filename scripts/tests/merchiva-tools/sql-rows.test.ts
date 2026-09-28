import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Identity, Timestamp, Uuid, toCamelCase } from "spacetimedb";
import { centsOf } from "@/lib/money";
import { toPayrollEvents } from "@/lib/payroll";
import { timestampToMs } from "@/lib/spacetimedb/timestamp";
import { canonicalUuid, idHex, opt, rowId, toShift, uuidText } from "@/lib/merchiva/tools/rows";
import { toOrgMember } from "@/lib/merchiva/tools/staff-rows";
import { toPaymentLite } from "@/lib/merchiva/tools/sales-history";
import { toInventoryItem, toInventoryTransaction } from "@/lib/merchiva/tools/view-restock-suggestions";
import { roleViews } from "@/lib/merchiva/tools/view-roles";
import {
  decodeSqlResponse,
  decodeSqlValue,
  quoteBigIntegers,
  type SqlElement,
  type SqlType,
} from "@/lib/merchiva/tools/sql-rows";
import {
  SALES_HISTORY_DAYS,
  TOOL_TABLES,
  TOOL_TABLE_NAMES,
  isUuid,
  toolTableQuery,
  type ToolTable,
} from "@/lib/merchiva/tools/tool-tables";
import { CAPTURED, SCHEMAS, sdkIdentity, sdkTimestamp, sdkUuid, sqlResponseText, tableForSql } from "./sql-fixtures";

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ORG = "0199a001-0000-7000-8000-000000000001";
const decoded = (table: string) => decodeSqlResponse(CAPTURED[table]);

describe("quoteBigIntegers", () => {
  test("quotes integers of 16+ digits so a u128 survives JSON.parse", () => {
    const text = '[[[123456789012345678901234567890123456789],[1789000000000000],42,-1234567890123456789]]';
    expect(JSON.parse(quoteBigIntegers(text))).toEqual([[["123456789012345678901234567890123456789"], ["1789000000000000"], 42, "-1234567890123456789"]]);
  });

  test("leaves floats, exponents and digits inside strings alone", () => {
    const text = '[1.5,2.5e+20,"1234567890123456789","say \\"12345678901234567\\" twice",3]';
    expect(quoteBigIntegers(text)).toBe(text);
  });
});

describe("captured responses decode into SDK row shapes", () => {
  test("uuid → Uuid, hyphenated for rowId / uuidText / canonicalUuid", () => {
    for (const table of Object.keys(CAPTURED).filter((t) => t !== "settings")) {
      for (const r of decoded(table)) {
        expect(r.id).toBeInstanceOf(Uuid);
        expect(rowId(r)).toMatch(UUID_TEXT);
        expect(uuidText(r.id)).toBe(canonicalUuid(r.id.toString()));
      }
    }
  });

  test("identity → Identity, 64 bare hex digits through idHex", () => {
    const members = decoded("org_member");
    for (const m of members) {
      expect(m.userId).toBeInstanceOf(Identity);
      expect(idHex(m.userId)).toMatch(/^c200[0-9a-f]{60}$/);
      expect(toOrgMember(m).userId).toBe(idHex(m.userId));
    }
  });

  test("timestamp → Timestamp, read by timestampToMs and the payroll's punchAtMs", () => {
    const punches = decoded("punch_event");
    for (const p of punches) {
      expect(p.at).toBeInstanceOf(Timestamp);
      expect(timestampToMs(p.at)).toBe(Number(p.at.microsSinceUnixEpoch / 1000n));
    }
    const events = toPayrollEvents(punches, punches[0].organizationId);
    expect(events).toHaveLength(punches.length);
    expect(events.every((e) => Number.isFinite(e.atMs))).toBe(true);
    expect(Number.isFinite(toPaymentLite(decoded("payment")[0]).createdAtMs)).toBe(true);
  });

  test("option → the value or undefined; i64 → bigint; f64 / i32 → number; bool → boolean", () => {
    const [item] = decoded("inventory_item");
    expect(item.squareItemId).toBeUndefined();
    expect(decoded("inventory_item").some((i) => typeof i.retailEnabled === "boolean")).toBe(true);
    expect(opt(item.squareItemId)).toBeNull();
    expect(typeof item.minOrderQty).toBe("number");
    expect(typeof item.costPerUnitCents).toBe("bigint");
    expect(typeof item.currentStock).toBe("number");
    expect(centsOf(item, "costPerUnit")).toBe(Number(item.costPerUnitCents));

    const tasks = decoded("role_task");
    for (const t of tasks) {
      expect(typeof t.sortOrder).toBe("number");
      expect(typeof t.requiresEvidence).toBe("boolean");
      // role_task.organization_id is option<string>; org_id its plain mirror.
      expect(t.organizationId).toBe(t.orgId);
    }
    const payment = decoded("payment")[0];
    expect(typeof payment.amountCents).toBe("bigint");
    expect(payment.refundAmountCents).toBeUndefined();
    expect(toPaymentLite(payment).amountCents).toBe(Number(payment.amountCents));
  });

  test("the tools' mappers read them as they read subscription rows", () => {
    for (const s of decoded("shift").map(toShift)) {
      expect(s.id).toMatch(UUID_TEXT);
      expect(s.memberId).toMatch(UUID_TEXT);
      expect(s.staffRoles).toEqual(["Barista"]);
    }
    for (const i of decoded("inventory_item").map(toInventoryItem)) expect(i.id).toMatch(UUID_TEXT);
    for (const t of decoded("inventory_transaction").map(toInventoryTransaction)) expect(t.itemId).toBe("");
    for (const t of decoded("role_task")) expect(canonicalUuid(t.roleId)).toMatch(UUID_TEXT);
    const roles = roleViews(decoded("staff_role"), decoded("role_task"));
    expect(roles.map((r) => r.id)).toEqual(decoded("staff_role").map(rowId));
  });

  test("a projection decodes only the columns asked for", () => {
    for (const s of decoded("settings")) expect(Object.keys(s)).toEqual(["organizationId", "paymentCurrency", "openingHours"]);
  });

  test("the fixture encoder reproduces every captured response exactly", () => {
    for (const [sql, text] of Object.entries(CAPTURED)) {
      const table = tableForSql(sql)!;
      const columns = (TOOL_TABLES[table] as { columns?: readonly string[] }).columns;
      const again = sqlResponseText(table, decodeSqlResponse(text), columns);
      expect(JSON.parse(quoteBigIntegers(again))[0].rows).toEqual(JSON.parse(quoteBigIntegers(text))[0].rows);
      expect(JSON.parse(again)[0].schema).toEqual(JSON.parse(text)[0].schema);
    }
  });
});

describe("every column type of every table the tools read", () => {
  /** A made-up SDK value of `type`; options come out set or unset per `some`. */
  function sample(type: SqlType, some: boolean, n: number): unknown {
    const kind = Object.keys(type)[0];
    const body = type[kind] as { elements?: SqlElement[]; variants?: SqlElement[] };
    if (kind === "Sum") return some ? sample(body.variants![0].algebraic_type, some, n) : undefined;
    if (kind === "Product") {
      const special = body.elements![0].name?.some;
      if (special === "__uuid__") return sdkUuid(n);
      if (special === "__identity__") return sdkIdentity(n);
      return sdkTimestamp(1_789_000_000_000 + n);
    }
    return { String: `text ${n}`, Bool: n % 2 === 0, I32: n, F64: n + 0.25, I64: BigInt(n) * 100n }[kind];
  }

  test.each(TOOL_TABLE_NAMES.map((t) => [t]))("%s round-trips set and unset options", (table: ToolTable) => {
    for (const some of [true, false]) {
      const row: Record<string, unknown> = {};
      SCHEMAS[table].forEach((el, i) => {
        row[toCamelCase(el.name!.some!)] = sample(el.algebraic_type, some, i + 1);
      });
      const [back] = decodeSqlResponse(sqlResponseText(table, [row]));
      expect(back).toEqual(row);
    }
  });

  test("a plain sum is { tag, value } and a result { ok } / { err }, as in the SDK", () => {
    const variants = (...names: string[]) => ({ Sum: { variants: names.map((n) => ({ name: { some: n }, algebraic_type: { String: [] } })) } });
    expect(decodeSqlValue(variants("draft", "live"), [1, "x"])).toEqual({ tag: "live", value: "x" });
    expect(decodeSqlValue(variants("ok", "err"), [1, "bad"])).toEqual({ err: "bad" });
    expect(decodeSqlValue(variants("some", "none"), { some: "named" })).toBe("named");
  });

  test("anything but a statement result is refused", () => {
    expect(() => decodeSqlResponse("not json")).toThrow("not JSON");
    expect(() => decodeSqlResponse('{"error":"x"}')).toThrow("unexpected SQL response shape");
    expect(() => decodeSqlResponse("[]")).toThrow("unexpected SQL response shape");
  });
});

describe("column names", () => {
  test("the camelCase of each published column is the generated binding's accessor", () => {
    for (const table of TOOL_TABLE_NAMES) {
      const file = join(import.meta.dir, `../../../lib/spacetimedb/generated/${TOOL_TABLES[table].sql}_table.ts`);
      const accessors = new Set([...readFileSync(file, "utf8").matchAll(/^ {2}(\w+): __t\./gm)].map((m) => m[1]));
      for (const el of SCHEMAS[table]) expect(accessors, `${table}.${el.name?.some}`).toContain(toCamelCase(el.name!.some!));
    }
  });
});

describe("toolTableQuery", () => {
  test("names one store, on the plain-string org column", () => {
    expect(toolTableQuery("orgMember", ORG, "2026-09-27")).toBe(`SELECT * FROM org_member WHERE organization_id = '${ORG}'`);
    expect(toolTableQuery("roleTask", ORG, "2026-09-27")).toBe(`SELECT * FROM role_task WHERE org_id = '${ORG}'`);
    expect(toolTableQuery("settings", ORG, "2026-09-27")).toBe(
      `SELECT organization_id, payment_currency, opening_hours FROM settings WHERE organization_id = '${ORG}'`,
    );
  });

  test("history tables keep the app's windows, counted back from the store's day", () => {
    expect(toolTableQuery("salesRecord", ORG, "2026-09-27")).toBe(
      `SELECT * FROM sales_record WHERE organization_id = '${ORG}' AND date >= '2025-08-23'`,
    );
    expect(toolTableQuery("inventoryTransaction", ORG, "2026-09-27")).toBe(
      `SELECT * FROM inventory_transaction WHERE organization_id = '${ORG}' AND date >= '2026-05-30'`,
    );
    expect(() => toolTableQuery("salesRecord", ORG, "2026-09-27' OR '1'='1")).toThrow("not a YYYY-MM-DD day");
  });

  test("refuses any organization id that is not a uuid, before it reaches the SQL", () => {
    for (const bad of [
      "",
      "org-1",
      `${ORG}' OR '1'='1`,
      `${ORG}'; DROP TABLE shift; --`,
      "0199a001000070008000000000000001",
      `${ORG} `,
    ]) {
      expect(isUuid(bad)).toBe(false);
      expect(() => toolTableQuery("shift", bad, "2026-09-27")).toThrow("not a uuid");
    }
    expect(isUuid(ORG.toUpperCase())).toBe(true);
  });

  test("the sales window matches the client's sales_record subscription", () => {
    const provider = readFileSync(join(import.meta.dir, "../../../lib/spacetimedb/provider.tsx"), "utf8");
    expect(Number(/const SALES_WINDOW_DAYS = (\d+);/.exec(provider)?.[1])).toBe(SALES_HISTORY_DAYS);
    expect(provider).toContain("SELECT * FROM sales_record WHERE ${org} AND date >= '${salesSince}'");
  });
});
