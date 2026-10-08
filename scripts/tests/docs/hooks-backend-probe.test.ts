// "Is Docs published?" probe behind useDocsBackendStatus (lib/docs/backend-probe.ts):
// only a missing-table/column error means not_published, everything else is retried,
// a dropped connection abandons its probe, and not_published is re-checked.

import { afterEach, describe, expect, jest, test } from "bun:test";
import { DocsBackendMonitor, isMissingDocsSchemaError, type DocsProbeTuning } from "@/lib/docs/backend-probe";
import { docsProbeQueries } from "@/lib/docs/queries";
import { driveProbeQueries } from "@/lib/drive/queries";
import { FakeDocServer, waitFor } from "./fake-server";

const TUNING: DocsProbeTuning = { retryBaseMs: 100, retryMaxMs: 400, recheckBaseMs: 1_000, recheckMaxMs: 4_000 };
/** Longer than any jittered delay (×1.25) for `ms`. */
const past = (ms: number) => Math.ceil(ms * 1.25) + 1;

interface ProbeCall {
  queries: string[];
  applied?: (ctx: unknown) => void;
  error?: (ctx: unknown, error?: unknown) => void;
  active: boolean;
  unsubscribed: boolean;
}

/** The raw SpacetimeDB connection surface the probe touches. */
class FakeProbeConnection {
  isActive = true;
  throwOnSubscribe: Error | null = null;
  readonly calls: ProbeCall[] = [];
  private readonly disconnectHandlers: Array<() => void> = [];

  onDisconnect(cb: () => void): void {
    this.disconnectHandlers.push(cb);
  }

  onConnectError(): void {}

  subscriptionBuilder() {
    const call: ProbeCall = { queries: [], active: false, unsubscribed: false };
    const builder = {
      onApplied: (cb: (ctx: unknown) => void) => {
        call.applied = cb;
        return builder;
      },
      onError: (cb: (ctx: unknown, error?: unknown) => void) => {
        call.error = cb;
        return builder;
      },
      subscribe: (queries: string[]) => {
        if (this.throwOnSubscribe) throw this.throwOnSubscribe;
        call.queries = queries;
        this.calls.push(call);
        return {
          unsubscribe: () => {
            call.unsubscribed = true;
            call.active = false;
          },
          isActive: () => call.active,
        };
      },
    };
    return builder;
  }

  apply(index = this.calls.length - 1): void {
    const call = this.calls[index];
    call.active = true;
    call.applied?.({ event: { tag: "SubscribeApplied" } });
  }

  fail(message: string, index = this.calls.length - 1): void {
    const error = new Error(message);
    this.calls[index].error?.({ event: error }, error);
  }

  /** SDK order: "disconnect" is emitted before isActive is cleared. */
  close(): void {
    for (const cb of this.disconnectHandlers) cb();
    this.isActive = false;
  }
}

afterEach(() => {
  jest.useRealTimers();
});

describe("isMissingDocsSchemaError", () => {
  test("recognises the server's missing table / column messages", () => {
    for (const message of [
      "no such table: `document_star`. If the table exists, it may be marked private.",
      "Unknown table: `document`",
      "Table not found: document_access",
      "table with provided name or id doesn't exist",
      "`document` does not have a field `organization_id`",
      "`document_update` is not in scope",
    ]) {
      expect(isMissingDocsSchemaError(new Error(message))).toBe(true);
      expect(isMissingDocsSchemaError({ event: new Error(message) })).toBe(true); // SDK ErrorContext
      expect(isMissingDocsSchemaError(undefined, message)).toBe(true);
    }
  });

  test("anything else is transient", () => {
    for (const cause of [new Error("Connection closed"), new Error("Database is being updated"), "timeout", undefined, null, {}]) {
      expect(isMissingDocsSchemaError(cause)).toBe(false);
    }
  });
});

describe("DocsBackendMonitor", () => {
  test("applied → ready, the probe unsubscribes, and a later connection starts from the last answer", () => {
    const monitor = new DocsBackendMonitor({ bindingsGenerated: true, tuning: TUNING });
    const conn = new FakeProbeConnection();
    expect(monitor.status(conn)).toBe("checking");
    expect(monitor.status(null)).toBe("checking");
    let notified = 0;
    const off = monitor.subscribe(conn, () => notified++);
    expect(conn.calls).toHaveLength(1);
    expect(conn.calls[0].queries).toEqual(docsProbeQueries());

    conn.apply();
    expect(monitor.status(conn)).toBe("ready");
    expect(notified).toBe(1);
    expect(conn.calls[0].unsubscribed).toBe(true);
    monitor.subscribe(conn, () => {})();
    expect(conn.calls).toHaveLength(1); // ready is final for a connection
    off();

    const reconnected = new FakeProbeConnection();
    expect(monitor.status(reconnected)).toBe("ready"); // no "checking" flash over an open editor
    expect(monitor.status(null)).toBe("ready");
    const off2 = monitor.subscribe(reconnected, () => {});
    expect(reconnected.calls).toHaveLength(1); // …but the new connection is still probed
    off2();
  });

  test("a missing-table error means not_published, re-checked until the module is published", () => {
    jest.useFakeTimers();
    const monitor = new DocsBackendMonitor({ bindingsGenerated: true, tuning: TUNING });
    const conn = new FakeProbeConnection();
    const seen: string[] = [];
    const off = monitor.subscribe(conn, () => seen.push(monitor.status(conn)));
    conn.fail("no such table: `document`. If the table exists, it may be marked private.");
    expect(monitor.status(conn)).toBe("not_published");
    expect(conn.calls).toHaveLength(1);

    jest.advanceTimersByTime(past(TUNING.recheckBaseMs));
    expect(conn.calls).toHaveLength(2);
    conn.fail("Unknown table: `document`");
    expect(monitor.status(conn)).toBe("not_published");
    jest.advanceTimersByTime(past(TUNING.recheckBaseMs * 2));
    expect(conn.calls).toHaveLength(3);
    conn.apply(); // spacetime publish happened meanwhile
    expect(monitor.status(conn)).toBe("ready");
    expect(seen).toEqual(["not_published", "ready"]);
    off();
  });

  test("any other error keeps the answer and retries with backoff", () => {
    jest.useFakeTimers();
    const monitor = new DocsBackendMonitor({ bindingsGenerated: true, tuning: TUNING });
    const conn = new FakeProbeConnection();
    let notified = 0;
    const off = monitor.subscribe(conn, () => notified++);
    conn.fail("Database is being updated, try again later");
    expect(monitor.status(conn)).toBe("checking");
    expect(notified).toBe(0);

    jest.advanceTimersByTime(past(TUNING.retryBaseMs));
    expect(conn.calls).toHaveLength(2);
    conn.fail("internal error");
    jest.advanceTimersByTime(past(TUNING.retryBaseMs) - 1);
    expect(conn.calls).toHaveLength(2); // second delay is doubled
    jest.advanceTimersByTime(past(TUNING.retryBaseMs * 2));
    expect(conn.calls).toHaveLength(3);
    conn.apply();
    expect(monitor.status(conn)).toBe("ready");
    expect(notified).toBe(1);
    off();
  });

  test("a synchronous throw is classified the same way", () => {
    jest.useFakeTimers();
    const monitor = new DocsBackendMonitor({ bindingsGenerated: true, tuning: TUNING });
    const transient = new FakeProbeConnection();
    transient.throwOnSubscribe = new Error("socket not ready");
    const off1 = monitor.subscribe(transient, () => {});
    expect(monitor.status(transient)).toBe("checking");
    transient.throwOnSubscribe = null;
    jest.advanceTimersByTime(past(TUNING.retryBaseMs));
    expect(transient.calls).toHaveLength(1);
    off1();

    const missing = new FakeProbeConnection();
    missing.throwOnSubscribe = new Error("Table not found: document");
    const off2 = monitor.subscribe(missing, () => {});
    expect(monitor.status(missing)).toBe("not_published");
    off2();
  });

  test("a connection that drops before answering is abandoned; its late answer is ignored", () => {
    jest.useFakeTimers();
    const monitor = new DocsBackendMonitor({ bindingsGenerated: true, tuning: TUNING });
    const conn = new FakeProbeConnection();
    let notified = 0;
    const off = monitor.subscribe(conn, () => notified++);
    conn.close();
    expect(notified).toBe(1);
    expect(monitor.status(conn)).toBe("checking");
    conn.apply(); // a stale message processed after the close
    expect(monitor.status(conn)).toBe("checking");
    jest.advanceTimersByTime(60_000);
    expect(conn.calls).toHaveLength(1);
    off();

    const next = new FakeProbeConnection();
    const off2 = monitor.subscribe(next, () => {});
    next.apply();
    expect(monitor.status(next)).toBe("ready");
    off2();

    // An already-closed connection is never probed.
    const closed = new FakeProbeConnection();
    closed.isActive = false;
    monitor.subscribe(closed, () => {})();
    expect(closed.calls).toHaveLength(0);
  });

  test("stops retrying when nobody listens and resumes on the next subscribe", () => {
    jest.useFakeTimers();
    const monitor = new DocsBackendMonitor({ bindingsGenerated: true, tuning: TUNING });
    const conn = new FakeProbeConnection();
    const off = monitor.subscribe(conn, () => {});
    conn.fail("timeout");
    off();
    jest.advanceTimersByTime(60_000);
    expect(conn.calls).toHaveLength(1);
    const off2 = monitor.subscribe(conn, () => {});
    expect(conn.calls).toHaveLength(2);
    off2();
  });

  test("a custom query set (Drive) is probed on its own: Docs ready, Drive not published on the same connection", () => {
    jest.useFakeTimers();
    const docs = new DocsBackendMonitor({ bindingsGenerated: true, tuning: TUNING });
    const drive = new DocsBackendMonitor({ bindingsGenerated: true, tuning: TUNING, queries: driveProbeQueries });
    const conn = new FakeProbeConnection();
    const offDocs = docs.subscribe(conn, () => {});
    const offDrive = drive.subscribe(conn, () => {});
    expect(conn.calls.map((c) => c.queries)).toEqual([docsProbeQueries(), driveProbeQueries()]);

    conn.apply(0);
    conn.fail("no such table: `drive_item`. If the table exists, it may be marked private.", 1);
    expect(docs.status(conn)).toBe("ready");
    expect(drive.status(conn)).toBe("not_published");

    jest.advanceTimersByTime(past(TUNING.recheckBaseMs));
    expect(conn.calls).toHaveLength(3);
    expect(conn.calls[2].queries).toEqual(driveProbeQueries()); // the re-check uses the same set
    conn.apply(2);
    expect(drive.status(conn)).toBe("ready");
    offDocs();
    offDrive();
  });

  test("a query set that throws while building is retried like any transient failure", () => {
    jest.useFakeTimers();
    let broken = true;
    const monitor = new DocsBackendMonitor({
      bindingsGenerated: true,
      tuning: TUNING,
      queries: () => {
        if (broken) throw new Error("not ready");
        return docsProbeQueries();
      },
    });
    const conn = new FakeProbeConnection();
    const off = monitor.subscribe(conn, () => {});
    expect(conn.calls).toHaveLength(0);
    expect(monitor.status(conn)).toBe("checking");
    broken = false;
    jest.advanceTimersByTime(past(TUNING.retryBaseMs));
    expect(conn.calls).toHaveLength(1);
    conn.apply();
    expect(monitor.status(conn)).toBe("ready");
    off();
  });

  test("without generated bindings it is not_published and never subscribes", () => {
    const monitor = new DocsBackendMonitor({ bindingsGenerated: false, tuning: TUNING });
    const conn = new FakeProbeConnection();
    const off = monitor.subscribe(conn, () => {});
    expect(monitor.status(conn)).toBe("not_published");
    expect(monitor.status(null)).toBe("not_published");
    expect(conn.calls).toHaveLength(0);
    off();
  });

  test("against the fake server: a module without the tables, then published", async () => {
    const server = new FakeDocServer();
    const member = server.addMember({ organizationId: "org-probe" });
    const client = server.connect(member.identity);
    const monitor = new DocsBackendMonitor({ bindingsGenerated: true, tuning: { ...TUNING, recheckBaseMs: 5, recheckMaxMs: 5 } });
    server.failSubscriptions = true; // "Subscription failed: no such table"
    const off = monitor.subscribe(client.raw as never, () => {});
    await waitFor(server, () => monitor.status(client.raw as never) === "not_published");
    server.failSubscriptions = false;
    await waitFor(server, () => monitor.status(client.raw as never) === "ready");
    off();
  });
});
