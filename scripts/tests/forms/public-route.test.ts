import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fmt } from "@/lib/i18n/fmt";
import {
  PUBLIC_MAX_BODY_BYTES,
  PUBLIC_STAMP_MAX_AGE_MS,
  PUBLIC_STAMP_MIN_AGE_MS,
  isPublicFormToken,
  mapPublicReducerError,
  parsePublicFormsConfig,
  parsePublicSubmission,
  publicStatusFor,
  readCappedText,
  signPublicStamp,
  verifyPublicStamp,
} from "@/lib/forms/server/public";
import { FORM_MAX_ANSWERS_BYTES } from "@/lib/forms/limits";
import { createPublicFormHandlers, type PublicFormDeps, type PublicSubmitArgs } from "@/lib/forms/server/public-handlers";
import type { SqlRow } from "@/lib/drive/server/sql-rows";

const TOKEN = "a".repeat(32) + "0123456789abcdef".repeat(2);
const SECRET = "s".repeat(40);
const RESPONSE_ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

function body(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ responseId: RESPONSE_ID, answers: { q_abcdefghijkl: "hi" }, date: "2026-10-06", stamp: "x", ...extra });
}

describe("public page copy", () => {
  test("a store name with replacement patterns renders literally", () => {
    const view = readFileSync(join(import.meta.dir, "../../../app/f/[token]/public-form-view.tsx"), "utf8");
    expect(view).not.toMatch(/\.replace\("\{store\}"/);
    for (const name of ["Joe$'s Deli", "A$&B", "$$ Shop", "x$`y"]) {
      expect(fmt("Answers go to {store}.", { store: name })).toBe(`Answers go to ${name}.`);
    }
  });
});

describe("token format", () => {
  test("accepts 64 lowercase hex only", () => {
    expect(isPublicFormToken(TOKEN)).toBe(true);
    expect(isPublicFormToken(TOKEN.toUpperCase())).toBe(false);
    expect(isPublicFormToken(TOKEN.slice(1))).toBe(false);
    expect(isPublicFormToken(`${TOKEN}0`)).toBe(false);
    expect(isPublicFormToken(`${TOKEN.slice(1)}'`)).toBe(false);
    expect(isPublicFormToken("' OR 1=1 --".padEnd(64, "a"))).toBe(false);
    expect(isPublicFormToken(undefined)).toBe(false);
  });
});

describe("config", () => {
  test("needs the secret (≥ 32 chars) and the service token", () => {
    expect(parsePublicFormsConfig({})).toBeNull();
    expect(parsePublicFormsConfig({ FORMS_PUBLIC_SECRET: SECRET })).toBeNull();
    expect(parsePublicFormsConfig({ SPACETIMEDB_SERVICE_TOKEN: "t" })).toBeNull();
    expect(parsePublicFormsConfig({ FORMS_PUBLIC_SECRET: "short", SPACETIMEDB_SERVICE_TOKEN: "t" })).toBeNull();
    expect(parsePublicFormsConfig({ FORMS_PUBLIC_SECRET: SECRET, SPACETIMEDB_SERVICE_TOKEN: "t" })).toEqual({
      secret: SECRET,
      serviceToken: "t",
    });
  });
});

describe("render stamp", () => {
  const issued = 1_790_000_000_000;
  const stamp = signPublicStamp(SECRET, TOKEN, issued);

  test("is refused before the minimum fill time and after the maximum age", () => {
    expect(verifyPublicStamp(SECRET, TOKEN, stamp, issued)).toBe("too_fast");
    expect(verifyPublicStamp(SECRET, TOKEN, stamp, issued + PUBLIC_STAMP_MIN_AGE_MS - 1)).toBe("too_fast");
    expect(verifyPublicStamp(SECRET, TOKEN, stamp, issued + PUBLIC_STAMP_MIN_AGE_MS)).toBe("ok");
    expect(verifyPublicStamp(SECRET, TOKEN, stamp, issued + PUBLIC_STAMP_MAX_AGE_MS)).toBe("ok");
    expect(verifyPublicStamp(SECRET, TOKEN, stamp, issued + PUBLIC_STAMP_MAX_AGE_MS + 1)).toBe("expired");
  });

  test("is bound to the secret, the token and the time", () => {
    const later = issued + 10_000;
    expect(verifyPublicStamp("t".repeat(40), TOKEN, stamp, later)).toBe("invalid");
    expect(verifyPublicStamp(SECRET, "b".repeat(64), stamp, later)).toBe("invalid");
    const [, mac] = stamp.split(".");
    expect(verifyPublicStamp(SECRET, TOKEN, `${issued - 60_000}.${mac}`, later)).toBe("invalid");
  });

  test("rejects malformed and future stamps", () => {
    const later = issued + 10_000;
    for (const bad of [undefined, 42, "", "abc", `${issued}`, `${issued}.zz`, `${issued}.${"0".repeat(64)}`]) {
      expect(verifyPublicStamp(SECRET, TOKEN, bad, later)).toBe("invalid");
    }
    const future = signPublicStamp(SECRET, TOKEN, later + 60_000);
    expect(verifyPublicStamp(SECRET, TOKEN, future, later)).toBe("invalid");
  });
});

describe("submission body", () => {
  test("honeypot must be absent or empty", () => {
    expect(parsePublicSubmission(body()).ok).toBe(true);
    expect(parsePublicSubmission(body({ website: "" })).ok).toBe(true);
    expect(parsePublicSubmission(body({ website: "http://spam" }))).toEqual({ ok: false, code: "honeypot" });
    expect(parsePublicSubmission(body({ website: 0 }))).toEqual({ ok: false, code: "honeypot" });
  });

  test("validates ids, date, stamp and answers shape", () => {
    expect(parsePublicSubmission("not json")).toEqual({ ok: false, code: "invalid" });
    expect(parsePublicSubmission("[]")).toEqual({ ok: false, code: "invalid" });
    expect(parsePublicSubmission(body({ responseId: "x" }))).toEqual({ ok: false, code: "invalid" });
    expect(parsePublicSubmission(body({ responseId: RESPONSE_ID.toUpperCase() }))).toEqual({ ok: false, code: "invalid" });
    expect(parsePublicSubmission(body({ date: "2026-02-30" }))).toEqual({ ok: false, code: "invalid" });
    expect(parsePublicSubmission(body({ stamp: 1 }))).toEqual({ ok: false, code: "invalid" });
    expect(parsePublicSubmission(body({ answers: ["a"] }))).toEqual({ ok: false, code: "invalid" });
  });

  test("refuses answers nested deeper than a file answer, without a stack overflow", () => {
    const file = { q_abcdefghijkl: { driveItemIds: [RESPONSE_ID] } };
    expect(parsePublicSubmission(body({ answers: file })).ok).toBe(true);
    expect(parsePublicSubmission(body({ answers: { q: [[["a"]]] } }))).toEqual({ ok: false, code: "invalid" });
    const deep = `{"q":${"[".repeat(20_000)}${"]".repeat(20_000)}}`;
    const text = JSON.stringify({ ...JSON.parse(body()), answers: "@" }).replace('"@"', deep);
    expect(parsePublicSubmission(text)).toEqual({ ok: false, code: "invalid" });
  });

  test("re-serializes the answers and caps their size", () => {
    const ok = parsePublicSubmission(body());
    expect(ok.ok && ok.value.answersJson).toBe('{"q_abcdefghijkl":"hi"}');
    const big = { q_abcdefghijkl: "x".repeat(FORM_MAX_ANSWERS_BYTES) };
    expect(parsePublicSubmission(body({ answers: big }))).toEqual({ ok: false, code: "answers_too_large" });
  });
});

describe("size cap", () => {
  test("refuses a declared length over the cap", async () => {
    const req = new Request("http://x/", { method: "POST", body: "{}", headers: { "content-length": String(PUBLIC_MAX_BODY_BYTES + 1) } });
    expect(await readCappedText(req, PUBLIC_MAX_BODY_BYTES)).toBeNull();
  });

  test("refuses a streamed body over the cap and reads one under it", async () => {
    expect(await readCappedText(new Request("http://x/", { method: "POST", body: "y".repeat(101) }), 100)).toBeNull();
    expect(await readCappedText(new Request("http://x/", { method: "POST", body: "ü".repeat(10) }), 100)).toBe("ü".repeat(10));
    expect(await readCappedText(new Request("http://x/", { method: "POST" }), 100)).toBe("");
  });
});

describe("reducer error mapping", () => {
  const wrap = (text: string) => new Error(`SpacetimeDB reducer service_submit_public_form_response failed (530): ${text}`);

  test("maps public form codes to statuses", () => {
    expect(mapPublicReducerError(wrap("[forms.rate_limited] Too many responses right now"))).toEqual({ error: "rate_limited" });
    expect(mapPublicReducerError(wrap("[forms.closed] This form is closed"))).toEqual({ error: "closed" });
    expect(mapPublicReducerError(wrap("[forms.required] q_abcdefghijkl"))).toEqual({ error: "required", questionId: "q_abcdefghijkl" });
    expect(publicStatusFor("rate_limited")).toBe(429);
    expect(publicStatusFor("not_found")).toBe(404);
    expect(publicStatusFor("closed")).toBe(409);
    expect(publicStatusFor("required")).toBe(422);
    expect(publicStatusFor("too_large")).toBe(413);
    expect(publicStatusFor("not_configured")).toBe(503);
  });

  test("never surfaces internal failures", () => {
    expect(mapPublicReducerError(wrap("[forms.forbidden] Service only"))).toBeNull();
    expect(mapPublicReducerError(wrap('No such procedure "service_submit_public_form_response"'))).toBeNull();
    expect(mapPublicReducerError(new TypeError("fetch failed"))).toBeNull();
    expect(mapPublicReducerError(undefined)).toBeNull();
  });
});

/* ─── Handlers (injected deps, no live server) ───────────────────────────── */

const NOW = 1_790_000_000_000;
const DEFINITION = {
  v: 1, title: "Feedback", description: "", settings: { confirmation: "" },
  questions: [{ id: "q_abcdefghijkl", type: "short_text", title: "Name", required: true }],
};

function publicRow(overrides: Partial<Record<string, unknown>> = {}): SqlRow {
  return {
    token: TOKEN, scope: "service", form_id: "f", organization_id: "o", store_name: "Corner Café", title: "Feedback",
    definition_json: JSON.stringify(DEFINITION), version: 1, status: "open", closes_at: 0, ...overrides,
  };
}

function harness(
  opts: { rows?: SqlRow[][]; configured?: boolean; submitError?: unknown; now?: number; ensureFailures?: number } = {},
) {
  const queries: string[] = [];
  const submits: PublicSubmitArgs[] = [];
  let ensured = 0;
  let ensureFailures = opts.ensureFailures ?? 0;
  const pages = [...(opts.rows ?? [[publicRow()]])];
  const deps: PublicFormDeps = {
    config: () => (opts.configured === false ? null : { secret: SECRET, serviceToken: "svc" }),
    now: () => opts.now ?? NOW,
    sql: async (query) => {
      queries.push(query);
      return pages.length > 1 ? pages.shift() ?? [] : pages[0] ?? [];
    },
    ensureReader: async () => {
      ensured += 1;
      if (ensureFailures > 0) {
        ensureFailures -= 1;
        throw new Error("module not published");
      }
    },
    submit: async (_token, args) => {
      if (opts.submitError) throw opts.submitError;
      submits.push(args);
    },
    log: () => {},
  };
  return { handlers: createPublicFormHandlers(deps), queries, submits, ensured: () => ensured };
}

function post(text: string): Request {
  return new Request("http://x/api/forms/public/t", { method: "POST", body: text });
}

describe("GET handler", () => {
  test("not_configured without the secret or the service token", async () => {
    const { handlers, queries } = harness({ configured: false });
    expect(await handlers.load(TOKEN)).toEqual({ status: 503, body: { error: "not_configured" } });
    expect(queries).toEqual([]);
  });

  test("a malformed token never reaches SQL", async () => {
    const { handlers, queries } = harness();
    expect((await handlers.load("abc' OR '1'='1")).status).toBe(404);
    expect(queries).toEqual([]);
  });

  test("an open form returns only public-safe fields and a fresh stamp", async () => {
    const { handlers, queries } = harness();
    const res = await handlers.load(TOKEN);
    expect(queries).toEqual([`SELECT * FROM form_public WHERE token = '${TOKEN}'`]);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["definition", "open", "stamp", "storeName", "title"]);
    const body = res.body as { stamp: string; storeName: string; open: boolean };
    expect(body.storeName).toBe("Corner Café");
    expect(body.open).toBe(true);
    expect(verifyPublicStamp(SECRET, TOKEN, body.stamp, NOW + PUBLIC_STAMP_MIN_AGE_MS)).toBe("ok");
  });

  test("a closed or past-deadline form has no definition and no stamp", async () => {
    for (const row of [publicRow({ status: "closed" }), publicRow({ closes_at: NOW * 1000 })]) {
      const res = await harness({ rows: [[row]] }).handlers.load(TOKEN);
      expect(res.body).toEqual({ storeName: "Corner Café", title: "Feedback", open: false, definition: null, stamp: null });
    }
  });

  test("a definition with a file question is never served", async () => {
    const unsafe = { ...DEFINITION, questions: [{ id: "q_abcdefghijkl", type: "photo", title: "Photo", required: false }] };
    const res = await harness({ rows: [[publicRow({ definition_json: JSON.stringify(unsafe) })]] }).handlers.load(TOKEN);
    expect(res).toEqual({ status: 404, body: { error: "not_found" } });
  });

  test("asks the module for the service reader once per process, then retries", async () => {
    const h = harness({ rows: [[], [publicRow()], []] });
    expect((await h.handlers.load(TOKEN)).status).toBe(200);
    expect(h.ensured()).toBe(1);
    expect((await h.handlers.load(TOKEN)).status).toBe(404);
    expect(h.ensured()).toBe(1);
  });

  test("a failed reader request is retried by the next request", async () => {
    const h = harness({ rows: [[], [], [publicRow()]], ensureFailures: 1 });
    expect(await h.handlers.load(TOKEN)).toEqual({ status: 503, body: { error: "unavailable" } });
    expect((await h.handlers.load(TOKEN)).status).toBe(200);
    expect(h.ensured()).toBe(2);
  });
});

describe("POST handler", () => {
  const stamp = signPublicStamp(SECRET, TOKEN, NOW - 10_000);

  test("submits a valid response as the service identity", async () => {
    const h = harness();
    const res = await h.handlers.submit(TOKEN, post(body({ stamp })));
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(h.submits).toEqual([{ token: TOKEN, responseId: RESPONSE_ID, answersJson: '{"q_abcdefghijkl":"hi"}', date: "2026-10-06" }]);
  });

  test("a filled honeypot gets a fake success and never reaches the reducer", async () => {
    const h = harness();
    expect(await h.handlers.submit(TOKEN, post(body({ stamp, website: "spam" })))).toEqual({ status: 200, body: { ok: true } });
    expect(h.submits).toEqual([]);
  });

  test("not_configured, timing and size are refused before the reducer; timing never names itself", async () => {
    const cases: Array<[ReturnType<typeof harness>, Request, number, string]> = [
      [harness({ configured: false }), post(body({ stamp })), 503, "not_configured"],
      [harness(), post(body({ stamp: signPublicStamp(SECRET, TOKEN, NOW - 1_000) })), 400, "invalid"],
      [harness(), post(body({ stamp: signPublicStamp(SECRET, TOKEN, NOW - PUBLIC_STAMP_MAX_AGE_MS - 1) })), 409, "expired"],
      [harness(), post(body({ stamp: signPublicStamp("x".repeat(40), TOKEN, NOW - 10_000) })), 400, "invalid"],
      [harness(), post("x".repeat(PUBLIC_MAX_BODY_BYTES + 1)), 413, "too_large"],
    ];
    for (const [h, req, status, error] of cases) {
      expect(await h.handlers.submit(TOKEN, req)).toEqual({ status, body: { error } } as never);
      expect(h.submits).toEqual([]);
    }
  });

  test("maps module errors and hides internal ones", async () => {
    const limited = harness({ submitError: new Error("SpacetimeDB reducer x failed (530): [forms.rate_limited] Too many") });
    expect(await limited.handlers.submit(TOKEN, post(body({ stamp })))).toEqual({ status: 429, body: { error: "rate_limited" } });
    const required = harness({ submitError: new Error("failed (530): [forms.required] q_abcdefghijkl") });
    expect(await required.handlers.submit(TOKEN, post(body({ stamp })))).toEqual({
      status: 422, body: { error: "required", questionId: "q_abcdefghijkl" },
    });
    const internal = harness({ submitError: new Error("failed (530): [forms.forbidden] Service only") });
    expect(await internal.handlers.submit(TOKEN, post(body({ stamp })))).toEqual({ status: 503, body: { error: "unavailable" } });
  });
});
