// lib/spacetimedb/hooks/{useForms,formsLive}.ts and the provider's formSubscriptions — the parts that decide what
// is subscribed and when it is released: scoped queries, the shared on-demand handle, the client-cache reader.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cachedTable, sharedSubscription } from "@/lib/spacetimedb/hooks/formsLive";
import {
  FORMS_BINDINGS_GENERATED, canManageForms, formResponseQueries, formsProbeQueries, myFormResponseQueries,
} from "@/lib/spacetimedb/hooks/useForms";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FORM = "0b6f8c5e-1d2a-4c3b-9e8f-7a6b5c4d3e2f";
const MEMBER = "4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

/** A fake connection whose subscription handles the test applies, fails and inspects. */
function fakeConnection() {
  const handles: { queries: string[]; active: boolean; unsubscribed: boolean; applied: () => void; failed: () => void }[] = [];
  const conn = {
    subscriptionBuilder() {
      let onApplied = () => {};
      let onError = () => {};
      const builder = {
        onApplied(cb: () => void) { onApplied = cb; return builder; },
        onError(cb: () => void) { onError = cb; return builder; },
        subscribe(queries: string[]) {
          const h = {
            queries, active: false, unsubscribed: false,
            applied: () => { h.active = true; onApplied(); },
            failed: () => onError(),
          };
          handles.push(h);
          return {
            isActive: () => h.active,
            isEnded: () => h.unsubscribed,
            unsubscribe: () => { h.unsubscribed = true; h.active = false; },
          };
        },
      };
      return builder;
    },
  };
  return { conn, handles };
}

describe("queries", () => {
  test("the bindings carry every Forms table", () => {
    expect(FORMS_BINDINGS_GENERATED).toBe(true);
    expect(formsProbeQueries()).toHaveLength(6);
    expect(formsProbeQueries().every((q) => q.endsWith("= ''"))).toBe(true);
  });

  test("responses are scoped to one form or one member, and only uuids are interpolated", () => {
    expect(formResponseQueries(FORM.toUpperCase())).toEqual([
      `SELECT * FROM "form_response" WHERE "form_response"."form_id" = '${FORM}'`,
      `SELECT * FROM "form_response_review" WHERE "form_response_review"."form_id" = '${FORM}'`,
    ]);
    expect(formResponseQueries("x' OR '1'='1")).toEqual([]);
    expect(myFormResponseQueries(MEMBER, "2026-07-08")).toEqual([
      `SELECT * FROM "form_response" WHERE "form_response"."respondent_member_id" = '${MEMBER}' AND "form_response"."date" >= '2026-07-08'`,
    ]);
    expect(myFormResponseQueries("me", "2026-07-08")).toEqual([]);
    expect(myFormResponseQueries(MEMBER, "'; --")).toEqual([]);
  });

  test("the provider's Forms batch is isolated, org-scoped and never streams responses", () => {
    const source = readFileSync(join(ROOT, "lib/spacetimedb/provider.tsx"), "utf8");
    const fn = /function formSubscriptions\(orgId: string\): string\[\] \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? "";
    expect(fn).toContain("if (!isUuid(orgId)) return [];");
    expect(fn).not.toContain("form_response");
    for (const table of ["form", "form_meta", "form_assignment", "form_completion"]) {
      expect(fn).toContain(`SELECT * FROM ${table} WHERE \${org}`);
    }
    expect(source).toContain(".subscribe(formSubscriptions(bootOrgId))");
  });

  test("builders are owners and managers", () => {
    expect(canManageForms("owner")).toBe(true);
    expect(canManageForms("manager")).toBe(true);
    expect(canManageForms("staff")).toBe(false);
    expect(canManageForms(null)).toBe(false);
  });
});

describe("shared on-demand subscription", () => {
  test("one handle for every reader, released a tick after the last one leaves", async () => {
    const { conn, handles } = fakeConnection();
    const a = sharedSubscription(conn, ["Q"]);
    const seen: string[] = [];
    const releaseA = a.acquire(() => seen.push(`a:${a.state}`));
    const b = sharedSubscription(conn, ["Q"]);
    const releaseB = b.acquire(() => seen.push(`b:${b.state}`));
    expect(b).toBe(a);
    expect(handles).toHaveLength(1);
    handles[0].applied();
    expect(a.state).toBe("applied");
    expect(seen).toEqual(["a:applied", "b:applied"]);
    releaseA();
    await tick();
    expect(handles[0].unsubscribed).toBe(false);
    releaseB();
    await tick();
    expect(handles[0].unsubscribed).toBe(true);
    expect(sharedSubscription(conn, ["Q"])).not.toBe(a);
  });

  test("a remount within the tick keeps the handle; a release before apply unsubscribes on apply", async () => {
    const { conn, handles } = fakeConnection();
    const sub = sharedSubscription(conn, ["R"]);
    sub.acquire(() => {})();
    const again = sharedSubscription(conn, ["R"]).acquire(() => {});
    await tick();
    expect(handles).toHaveLength(1);
    again();
    await tick();
    expect(handles[0].unsubscribed).toBe(false);
    handles[0].applied();
    expect(handles[0].unsubscribed).toBe(true);
  });

  test("a refused query set reports failed", () => {
    const { conn, handles } = fakeConnection();
    const sub = sharedSubscription(conn, ["S"]);
    sub.acquire(() => {});
    handles[0].failed();
    expect(sub.state).toBe("failed");
  });
});

describe("client-cache reader", () => {
  test("snapshots are stable until a row event, and listeners detach with the last reader", () => {
    const rows = [{ id: 1 }];
    const listeners: Record<string, ((...a: unknown[]) => void) | null> = { insert: null, delete: null, update: null };
    const table = {
      iter: () => rows.values(),
      onInsert: (cb: () => void) => { listeners.insert = cb; },
      removeOnInsert: () => { listeners.insert = null; },
      onDelete: (cb: () => void) => { listeners.delete = cb; },
      removeOnDelete: () => { listeners.delete = null; },
      onUpdate: (cb: () => void) => { listeners.update = cb; },
      removeOnUpdate: () => { listeners.update = null; },
    };
    const conn = { ...fakeConnection().conn, db: { formAssignment: table } };
    const cached = cachedTable(conn, "formAssignment");
    expect(cachedTable(conn, "nope")).toBeNull();
    expect(cachedTable(null, "formAssignment")).toBeNull();
    let changes = 0;
    const off = cached!.subscribe(() => changes++);
    const first = cached!.rows();
    expect(cached!.rows()).toBe(first);
    rows.push({ id: 2 });
    listeners.insert?.();
    expect(changes).toBe(1);
    expect(cached!.rows()).toHaveLength(2);
    off();
    expect(listeners).toEqual({ insert: null, delete: null, update: null });
  });
});
