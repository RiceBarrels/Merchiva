// Client ⇄ server parity for Sheets (sheets.md §5.2, §8): lib/sheets/lease.ts (ms) against
// spacetimedb/src/drive/sheet-logic.ts (µs) over a generated grid of lease rows, callers and clocks, and
// lib/sheets/constants.ts + lib/sheets/errors.ts against the module's limits and error codes. The server
// file has no imports, so it is imported directly: this suite never skips.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { driveErrorKey } from "@/lib/drive/errors";
import { isGzip } from "@/lib/sheets/codec";
import {
  SHEET_ORG_MAX_BYTES, SHEET_TEXT_MAX_CHARS, SHEET_TUNING, SHEET_VERSION_AUTO_KEEP, SHEET_VERSION_MAX_BYTES,
} from "@/lib/sheets/constants";
import { SHEET_ERROR_I18N_KEYS, sheetErrorCode } from "@/lib/sheets/errors";
import * as client from "@/lib/sheets/lease";
import { SHEET_LOSSY_ITEMS } from "@/lib/sheets/types";
import * as server from "../../../spacetimedb/src/drive/sheet-logic";
import { loadModule } from "../drive/fake-db";
import { leavesOf, loadFragments } from "../../i18n/drive/fragment";

const SERVER_SOURCE = readFileSync(join(import.meta.dir, "..", "..", "..", "spacetimedb", "src", "drive", "sheet-logic.ts"), "utf8");

describe("lease constants", () => {
  test("every server duration equals its client mirror (µs = ms × 1000)", () => {
    const pairs: Array<[bigint, number]> = [
      [server.SHEET_LEASE_TTL_MICROS, client.SHEET_LEASE_TTL_MS],
      [server.SHEET_LEASE_DETACHED_GRACE_MICROS, client.SHEET_LEASE_DETACHED_GRACE_MS],
      [server.SHEET_LEASE_REQUEST_GRACE_MICROS, client.SHEET_LEASE_REQUEST_GRACE_MS],
      [server.SHEET_LEASE_RESERVE_MICROS, client.SHEET_LEASE_RESERVE_MS],
      [server.SHEET_LEASE_REQUEST_MAX_AGE_MICROS, client.SHEET_LEASE_REQUEST_MAX_AGE_MS],
    ];
    for (const [micros, ms] of pairs) expect(micros).toBe(BigInt(ms) * 1000n);
  });

  test("the client timers fit inside the server windows", () => {
    // Three heartbeats per TTL, and the request prompt's countdown is the server's grace.
    expect(client.SHEET_LEASE_HEARTBEAT_MS * 3).toBe(client.SHEET_LEASE_TTL_MS);
    expect(client.SHEET_LEASE_HIDDEN_RELEASE_MS).toBeLessThan(client.SHEET_LEASE_IDLE_RELEASE_MS);
  });
});

describe("lease rules over a generated grid", () => {
  const NOW_MS = 1_700_000_000_000;
  const offsets = (base: number[]) => [...new Set(base.flatMap((o) => [o - 1, o, o + 1]))];
  const heartbeatAges = offsets([0, client.SHEET_LEASE_DETACHED_GRACE_MS, client.SHEET_LEASE_TTL_MS, client.SHEET_LEASE_RESERVE_MS]);
  const requestAges = offsets([0, client.SHEET_LEASE_REQUEST_GRACE_MS, client.SHEET_LEASE_REQUEST_MAX_AGE_MS]);
  const editAges = [0, 20_000, client.SHEET_LEASE_REQUEST_GRACE_MS + 5_000, 700_000];
  const holders = [
    { holderMemberId: "", holderActorMemberId: "", holderSessionId: "" },
    { holderMemberId: "m-a", holderActorMemberId: "a", holderSessionId: "sa" },
    { holderMemberId: "m-t", holderActorMemberId: "op-1", holderSessionId: "st" },
  ];
  const requests = [
    { requestedBySessionId: "", requestedByConnectionId: "" },
    { requestedBySessionId: "sb", requestedByConnectionId: "c-sb" },
    { requestedBySessionId: "sb", requestedByConnectionId: "" },
    { requestedBySessionId: "sc", requestedByConnectionId: "c-sc" },
  ];
  const callers = [
    { memberId: "m-a", actorMemberId: "a", sessionId: "sa" },
    { memberId: "m-a", actorMemberId: "a", sessionId: "s-phone" },
    { memberId: "m-b", actorMemberId: "b", sessionId: "sb" },
    { memberId: "m-c", actorMemberId: "c", sessionId: "sc" },
    { memberId: "m-t", actorMemberId: "op-2", sessionId: "st" },
    { memberId: "m-t", actorMemberId: "op-2", sessionId: "s-other" },
  ];

  test("state, request liveness and decision agree for every combination", () => {
    let compared = 0;
    const mismatches: string[] = [];
    for (const holder of holders) {
      for (const connection of ["", "ca"]) {
        for (const heartbeatAge of heartbeatAges) {
          for (const editAge of editAges) {
            for (const req of requests) {
              for (const requestAge of requestAges) {
                const heartbeatMs = NOW_MS - heartbeatAge;
                const editMs = NOW_MS - editAge;
                const requestMs = NOW_MS - requestAge;
                const row: client.SheetLeaseRow = {
                  documentId: "d", organizationId: "o", epoch: 1n, ...holder, holderConnectionId: connection, holderName: "H",
                  acquiredAt: new Date(0), heartbeatAt: new Date(heartbeatMs), lastEditAt: new Date(editMs), lastSeq: 0n,
                  requestedByMemberId: "", requestedByActorMemberId: "", ...req, requestedByName: "R", requestedAt: new Date(requestMs),
                };
                const times: server.SheetLeaseTimes = {
                  ...holder, holderConnectionId: connection, heartbeatMicros: BigInt(heartbeatMs) * 1000n,
                  lastEditMicros: BigInt(editMs) * 1000n, ...req, requestedMicros: BigInt(requestMs) * 1000n,
                };
                const nowMicros = BigInt(NOW_MS) * 1000n;
                const where = JSON.stringify({ holder, connection, heartbeatAge, editAge, req, requestAge });
                if (client.sheetLeaseState(row, NOW_MS) !== server.sheetLeaseState(times, nowMicros)) mismatches.push(`state ${where}`);
                if (client.sheetRequestLive(row, NOW_MS) !== server.sheetRequestLive(times, nowMicros)) mismatches.push(`live ${where}`);
                for (const who of callers) {
                  compared++;
                  if (client.sheetLeaseDecision(row, NOW_MS, who) !== server.sheetLeaseDecision(times, nowMicros, who)) {
                    mismatches.push(`decision ${JSON.stringify(who)} ${where}`);
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
    expect(compared).toBeGreaterThan(20_000);
    expect(client.sheetLeaseDecision(null, NOW_MS, callers[0])).toBe(server.sheetLeaseDecision(null, 0n, callers[0]));
  });

  test("the view never offers what the server would refuse", () => {
    // A free row reserved for someone else is exactly the server's "queued" for this caller.
    const reserved: client.SheetLeaseRow = {
      documentId: "d", organizationId: "o", epoch: 2n, holderMemberId: "", holderActorMemberId: "", holderSessionId: "",
      holderConnectionId: "", holderName: "", acquiredAt: new Date(0), heartbeatAt: new Date(NOW_MS - 30_000),
      lastEditAt: new Date(0), lastSeq: 0n, requestedByMemberId: "m-b", requestedByActorMemberId: "b",
      requestedBySessionId: "sb", requestedByConnectionId: "c-sb", requestedByName: "Bo", requestedAt: new Date(NOW_MS - 40_000),
    };
    const view = client.sheetLeaseView(reserved, NOW_MS, { ...callers[3], canEdit: true });
    expect(view).toEqual({ kind: "free", reservedForName: "Bo", reservedForMe: false });
    expect(client.sheetLeaseDecision(reserved, NOW_MS, callers[3])).toBe("queued");
  });
});

describe("limits mirrored in lib/sheets/constants.ts", () => {
  const decls = loadModule(["DOC_UPDATE_MAX_BYTES", "DOC_STATE_MAX_BYTES", "DOC_AUTO_VERSION_GAP_MICROS", "DOC_TEXT_MAX_CHARS"]);

  test("the sheet-logic limits", () => {
    expect(SHEET_TUNING.logMaxBytes).toBe(server.SHEET_LOG_MAX_BYTES);
    expect(BigInt(SHEET_ORG_MAX_BYTES)).toBe(server.SHEET_ORG_MAX_BYTES);
    expect(SHEET_VERSION_AUTO_KEEP).toBe(server.SHEET_VERSION_AUTO_KEEP);
    expect(SHEET_VERSION_MAX_BYTES).toBe(server.SHEET_VERSION_MAX_BYTES);
  });

  test("the Docs limits the sheet reducers reuse (sheetDeps.sheetLimits / docLimits)", () => {
    expect(SHEET_TUNING.updateMaxBytes).toBe(decls.DOC_UPDATE_MAX_BYTES as number);
    expect(SHEET_TUNING.stateMaxBytes).toBe(decls.DOC_STATE_MAX_BYTES as number);
    expect(BigInt(SHEET_TUNING.autoVersionIntervalMs) * 1000n).toBe(decls.DOC_AUTO_VERSION_GAP_MICROS as bigint);
    expect(SHEET_TEXT_MAX_CHARS).toBe(decls.DOC_TEXT_MAX_CHARS as number);
    expect(SHEET_TUNING.stateWarnBytes).toBeLessThan(SHEET_TUNING.stateMaxBytes);
    expect(SHEET_TUNING.compactMaxBytes).toBeLessThan(SHEET_TUNING.logMaxBytes);
  });

  test("isGzip is the server's isGzipBytes", () => {
    const samples = [
      new Uint8Array(0), new Uint8Array([0x1f, 0x8b, 0x08]), new Uint8Array([0x1f, 0x8b, 0x08, ...new Array(15).fill(0)]),
      new Uint8Array([0x1f, 0x8b, 0x09, ...new Array(15).fill(0)]), new Uint8Array([0x1f, 0x8c, 0x08, ...new Array(15).fill(0)]),
      new Uint8Array(new Array(40).fill(0x1f)),
    ];
    for (const bytes of samples) expect(isGzip(bytes)).toBe(server.isGzipBytes(bytes));
  });
});

describe("error codes", () => {
  const serverCodes = (() => {
    const union = /export type SheetErrorCode =([^;]+);/.exec(SERVER_SOURCE)?.[1] ?? "";
    return [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  })();

  test("the client knows every server code, plus its own offline", () => {
    expect(serverCodes.length).toBeGreaterThan(0);
    expect(Object.keys(SHEET_ERROR_I18N_KEYS).sort()).toEqual([...serverCodes, "offline"].sort());
  });

  test("[sheet.<code>] reads back as the code, and Drive screens show the same copy", () => {
    for (const code of serverCodes) {
      const err = new Error(`[sheet.${code}] Human text`);
      expect(sheetErrorCode(err)).toBe(code as keyof typeof SHEET_ERROR_I18N_KEYS);
      expect(driveErrorKey(err)).toBe(SHEET_ERROR_I18N_KEYS[code as keyof typeof SHEET_ERROR_I18N_KEYS]);
    }
  });

  test("every key lib/sheets names exists in the sheets fragment (en)", () => {
    const sheets = loadFragments().find((f) => f.name === "sheets");
    expect(sheets).toBeDefined();
    const en = sheets ? leavesOf(sheets, "en") : new Map<string, string>();
    const keys = [...Object.values(SHEET_ERROR_I18N_KEYS), ...SHEET_LOSSY_ITEMS.map((item) => `sheets.lossy.items.${item}`)];
    for (const key of keys) expect([key, en.has(key)]).toEqual([key, true]);
  });
});
