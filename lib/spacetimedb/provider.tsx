"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection } from "./generated";
import {
  SPACETIMEDB_URI,
  SPACETIMEDB_MODULE,
  storeToken,
  setConnection,
  clearConnection,
  getConnection,
} from "./client";
import { useAuth } from "@/lib/auth/context";
import { useT } from "@/lib/i18n/context";
import { mutationQueue } from "@/lib/offline";
import { isCapacitorNative } from "@/lib/capacitor";
import type { ReactNode } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION NOTES
// ═══════════════════════════════════════════════════════════════════════════════
//
// This file used to open ~44 subscriptions of the form `SELECT * FROM <table>`
// with no WHERE clause. Every signed-in browser therefore downloaded every row
// of every table for every tenant on the platform and filtered in JavaScript.
//
// Two separate problems, and they need two separate fixes:
//
//   * SECURITY — fixed in the module, not here. The queries below are chosen by
//     the client, so a client can always choose different ones; scoping them is
//     not a boundary. The actual boundary is the `clientVisibilityFilter` set in
//     spacetimedb/src/index.ts, which the database applies to the WebSocket and
//     the HTTP /sql endpoint alike.
//
//   * VOLUME — fixed here. RLS stops the browser from receiving other tenants'
//     rows, but without a WHERE the server still evaluates every subscription
//     against the whole table, and the client still receives its own tenant's
//     entire history on every connect. These queries ask for one store and, for
//     the append-only tables, a recent window.
//
// Two dialect limits shaped the windows below:
//   * a `timestamp` column cannot be compared to a literal
//     ("cannot be parsed as type (__timestamp_micros_since_unix_epoch__: I64)"),
//     so tables whose only date is a timestamp (punch_event, chat_message,
//     notification) cannot be windowed from a subscription at all. They are
//     bounded by the `pruneOrgHistory` reducer instead.
//   * `option` columns cannot be compared at all, so no window may use one.

/** Days of append-only history to keep in the live client cache. */
const HISTORY_WINDOW_DAYS = 120;
/** Sales history is small per row and drives year-over-year comparisons. */
const SALES_WINDOW_DAYS = 400;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** The org the user last selected. `switchOrg` hard-reloads, so this is stable
 *  for the lifetime of a connection. */
function activeOrgId(): string | null {
  try {
    return localStorage.getItem("active_org_id");
  } catch {
    return null;
  }
}

/** SpacetimeDB SQL has no parameter binding — ids are uuids, so reject anything
 *  that is not one rather than interpolating it into a query. */
function isUuid(v: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
}

/**
 * Identity-scoped tables. These carry no WHERE because their RLS rules already
 * reduce them to "rows belonging to :sender" — the user's own profile, their
 * memberships, their colleagues, their notifications. All are small and all are
 * needed before an organization has even been chosen.
 */
const BOOTSTRAP_SUBSCRIPTIONS = [
  "SELECT * FROM user",
  "SELECT * FROM organization",
  "SELECT * FROM org_member",
  "SELECT * FROM member_punch_code",
  // The answer `resolveDeviceOperator` writes for THIS device. RLS scopes it to
  // `identity = :sender`; without this subscription the row never streams back
  // and every PIN unlock hangs on "verifying".
  "SELECT * FROM device_operator_session",
  "SELECT * FROM notification",
  "SELECT * FROM push_subscription",
  "SELECT * FROM todo",
];

/**
 * Everything else, scoped to one store.
 *
 * `settings` stays out: its option(timestamp) columns still trip the client
 * deserializer, and the settings page reads it over HTTP instead.
 */
function orgSubscriptions(orgId: string): string[] {
  if (!isUuid(orgId)) return [];
  const org = `organization_id = '${orgId}'`;
  const since = isoDaysAgo(HISTORY_WINDOW_DAYS);
  const salesSince = isoDaysAgo(SALES_WINDOW_DAYS);

  return [
    // ── Reference data: small, read constantly ──────────────────────────────
    `SELECT * FROM org_invitation WHERE ${org}`,
    `SELECT * FROM inventory_item WHERE ${org}`,
    `SELECT * FROM staff_member WHERE ${org}`,
    `SELECT * FROM staff_role WHERE ${org}`,
    // NOT `${org}`: `role_task.organization_id` is `t.option(t.string())`, and
    // an option column cannot be compared in SQL at all. The server rejects the
    // query, and one rejected query fails the WHOLE batch — see the note on
    // `bugSubscriptions` below. Scope on the `org_id` mirror, which is what the
    // table's RLS rule joins on too (spacetimedb/src/index.ts, RLS_ORG_SCOPED).
    `SELECT * FROM role_task WHERE org_id = '${orgId}'`,
    `SELECT * FROM shift WHERE ${org}`,
    `SELECT * FROM shift_preset WHERE ${org}`,
    `SELECT * FROM shift_trade WHERE ${org}`,
    `SELECT * FROM staff_availability WHERE ${org}`,
    `SELECT * FROM time_off_request WHERE ${org}`,
    `SELECT * FROM location WHERE ${org}`,
    `SELECT * FROM supplier WHERE ${org}`,
    `SELECT * FROM coupon WHERE ${org}`,
    `SELECT * FROM store_device WHERE ${org}`,

    // ── Chat: RLS already narrows these to conversations the user is in ─────
    `SELECT * FROM chat_conversation WHERE ${org}`,
    "SELECT * FROM chat_member",
    "SELECT * FROM chat_message",

    // ── Append-only history: windowed ───────────────────────────────────────
    `SELECT * FROM inventory_transaction WHERE ${org} AND date >= '${since}'`,
    `SELECT * FROM sales_record WHERE ${org} AND date >= '${salesSince}'`,
    `SELECT * FROM waste_log WHERE ${org} AND date >= '${since}'`,

    // ── Unwindowable (timestamp-only); bounded by pruneOrgHistory ───────────
    `SELECT * FROM punch_event WHERE ${org}`,
    `SELECT * FROM payment WHERE ${org}`,
    `SELECT * FROM purchase_order WHERE ${org}`,
    `SELECT * FROM expense WHERE ${org}`,
    `SELECT * FROM supplier_message WHERE ${org}`,
    `SELECT * FROM ai_chat_session WHERE ${org}`,
    `SELECT * FROM ai_job WHERE ${org}`,
    `SELECT * FROM ai_usage WHERE ${org}`,
    `SELECT * FROM ai_usage_quota WHERE ${org}`,
    `SELECT * FROM daily_briefing WHERE ${org}`,
    `SELECT * FROM role_task_assignment WHERE ${org}`,

    // ── Training ────────────────────────────────────────────────────────────
    `SELECT * FROM training_day WHERE ${org}`,
    `SELECT * FROM training_objective WHERE ${org}`,
    `SELECT * FROM training_objective_grade WHERE ${org}`,
    `SELECT * FROM training_day_grade WHERE ${org}`,
    `SELECT * FROM training_review_request WHERE ${org}`,

    // ── Bookings (the only surviving site_* surface) ────────────────────────
    `SELECT * FROM site WHERE ${org}`,
    `SELECT * FROM site_booking WHERE ${org}`,
  ];
}

/**
 * Bug reports, subscribed on their own rather than inside `orgSubscriptions`.
 *
 * `bug_report` is the newest table, and one query against a table the deployed
 * module does not have yet fails the WHOLE batch it is in — which would cost
 * every other screen its data until the module is republished. On its own, a
 * module that predates the bug tracker loses only the bug tracker.
 */
function bugSubscriptions(orgId: string): string[] {
  if (!isUuid(orgId)) return [];
  return [`SELECT * FROM bug_report WHERE organization_id = '${orgId}'`];
}

/**
 * Page presence (live cursors), on its own for the same reason as bug reports:
 * a module without `page_presence` loses only the cursors, never the org batch.
 */
function presenceSubscriptions(orgId: string): string[] {
  if (!isUuid(orgId)) return [];
  return [`SELECT * FROM page_presence WHERE organization_id = '${orgId}'`];
}

/**
 * Forms (spacetimedb/src/forms/tables.ts), on their own for the same reason as
 * bug reports: a module without them loses only Forms, never the org batch. RLS
 * narrows `form` to member-visible forms (plus every form for Drive admins) and
 * `form_meta` to Drive admins. Responses are not here: they are subscribed on
 * demand by lib/spacetimedb/hooks/useForms.ts, scoped to a form or to the member.
 */
function formSubscriptions(orgId: string): string[] {
  if (!isUuid(orgId)) return [];
  const org = `organization_id = '${orgId}'`;
  return [
    `SELECT * FROM form WHERE ${org}`,
    `SELECT * FROM form_meta WHERE ${org}`,
    `SELECT * FROM form_assignment WHERE ${org}`,
    `SELECT * FROM form_completion WHERE ${org} AND date >= '${isoDaysAgo(7)}'`,
  ];
}

/**
 * Channel side tables (spacetimedb/src/chat/tables.ts), on their own for the
 * same reason as bug reports: a module without them loses only reactions,
 * threads, pins, topics and read state, never the org batch. RLS narrows each
 * to conversations the user is in (chat_member_state: the user's own rows).
 */
function chatSideSubscriptions(): string[] {
  return [
    "SELECT * FROM chat_reaction",
    "SELECT * FROM chat_message_ext",
    "SELECT * FROM chat_channel_info",
    "SELECT * FROM chat_member_state",
  ];
}

interface SpacetimeProviderProps {
  children: ReactNode;
}

/** Connection progress + last failure, for loading screens that want to say
 *  what they are waiting on instead of a bare "Connecting…". */
export interface SpacetimeStatus {
  connected: boolean;
  retryCount: number;
  tokenMissing: boolean;
  timedOut: boolean;
  /** Message of the most recent connect error (cleared on a successful connect). */
  lastError: string | null;
}

const SpacetimeStatusContext = createContext<SpacetimeStatus>({
  connected: false, retryCount: 0, tokenMissing: false, timedOut: false, lastError: null,
});

export function useSpacetimeStatus(): SpacetimeStatus {
  return useContext(SpacetimeStatusContext);
}

export function SpacetimeProvider({ children }: SpacetimeProviderProps) {
  const { getToken, isSignedIn, signOut } = useAuth();
  const t = useT();

  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      const msg = String(e.reason);
      if (msg.includes("deserialize")) {
        // Log full stack — these usually mean the deployed schema doesn't match
        // the generated SDK bindings (publish without `spacetime generate`,
        // or stale browser cache after a breaking change). Clearing the
        // stdb_token in localStorage + hard-refreshing usually fixes it.
        console.error("[STDB DESER]", msg);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((e.reason as any)?.stack) console.error("[STDB DESER stack]", (e.reason as any).stack);
        e.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [connected, setConnected] = useState(false);
  const [tokenMissing, setTokenMissing] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) {
      setTokenMissing(true);
      return;
    }
    setTokenMissing(false);
    let cancelled = false;
    getToken()
      .then((token) => {
        if (cancelled) return;
        if (token) {
          setAuthToken(token);
          localStorage.setItem("stdb_token", token);
        } else {
          setTokenMissing(true);
        }
      })
      .catch(() => {
        if (!cancelled) setTokenMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, getToken]);

  // Surface a "connection timed out" UI if we never get past the loading state.
  // Mirrors the pattern used in (app)/layout.tsx AuthLoader.
  useEffect(() => {
    if (connected) {
      setTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(timer);
  }, [connected, retryCount]);

  // Auto-recovery: if the connection times out and we haven't already tried
  // clearing caches in this tab, drop the cached SpacetimeDB token + any SDK
  // cache and reload once. This unblocks the most common post-schema-change
  // failure mode where the SDK silently waits forever on a stale handshake.
  useEffect(() => {
    if (!timedOut) return;
    const ATTEMPTED_KEY = "stdb_recovery_tried_at";
    const RECOVERY_COOLDOWN_MS = 5 * 60 * 1000;
    if (typeof window === "undefined") return;
    try {
      const lastAttempt = Number(localStorage.getItem(ATTEMPTED_KEY) ?? "0");
      if (Number.isFinite(lastAttempt) && Date.now() - lastAttempt < RECOVERY_COOLDOWN_MS) {
        return;
      }
      localStorage.setItem(ATTEMPTED_KEY, String(Date.now()));
    } catch {
      return;
    }
    console.warn("[SpacetimeDB] Connection timed out — clearing stdb_token + SDK caches");
    try { localStorage.removeItem("stdb_token"); } catch {}
    if (isCapacitorNative()) {
      console.warn("[SpacetimeDB] Native WebView detected — skipping automatic hard reload");
      return;
    }

    const clearIndexedDbCaches = async () => {
      if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return;
      try {
        const dbs = await indexedDB.databases();
        for (const db of dbs) {
          if (db.name && /spacetime/i.test(db.name)) {
            try { indexedDB.deleteDatabase(db.name); } catch {}
          }
        }
      } catch (err) {
        console.warn("[SpacetimeDB] IndexedDB cache enumeration failed:", err);
      }
    };

    void clearIndexedDbCaches().finally(() => window.location.reload());
  }, [timedOut]);

  // Once connected successfully, clear the recovery flag so a future failure
  // gets one fresh attempt rather than being stuck in "already tried".
  useEffect(() => {
    if (connected && typeof window !== "undefined") {
      try { localStorage.removeItem("stdb_recovery_tried_at"); } catch {}
    }
  }, [connected]);

  const builder = useMemo(() => {
    if (!authToken) return null;

    console.log(`ℹ️ INFO Connecting to SpacetimeDB WS...${retryCount > 0 ? ` (retry ${retryCount})` : ""}`);
    // Brotli compression sometimes hangs the post-WS-handshake protocol on
    // maincloud after a breaking schema publish. Disabling compression is a
    // safe and effective workaround — the bandwidth cost is negligible at
    // editor scale, and we trade a few KB for a connection that actually
    // completes.

    return DbConnection.builder()
      .withUri(SPACETIMEDB_URI)
      .withDatabaseName(SPACETIMEDB_MODULE)
      .withToken(authToken)
      .withCompression("none")
      .onConnect((conn, _identity, newToken) => {
        setLastError(null);
        console.log("ℹ️ INFO Connected to SpacetimeDB WS");
        if (retryCount > 0) setRetryCount(0);
        setConnected(true);
        storeToken(newToken);
        setConnection(conn);
        // Flush offline mutation queue after subscriptions settle
        setTimeout(async () => {
          try {
            const pending = await mutationQueue.getAll();
            if (pending.length > 0) {
              console.log(`[SpacetimeDB] Flushing ${pending.length} offline mutations...`);
              const c = getConnection();
              if (c) await mutationQueue.flush(c);
            }
          } catch (err) {
            console.warn("[SpacetimeDB] Queue flush failed:", err);
          }
        }, 3000);
        // Subscribe only to what this identity may see, and only for the
        // active store. See SUBSCRIPTION NOTES at the bottom of this file.
        conn.subscriptionBuilder().subscribe(BOOTSTRAP_SUBSCRIPTIONS);
        // The answer to this identity's latest PIN attempt (RLS: identity =
        // :sender). On its own, like bug_report below: a module without the
        // table loses only the answers, never the bootstrap batch.
        try {
          conn
            .subscriptionBuilder()
            .onError(() => console.warn("[SpacetimeDB] pin_attempt_result subscription failed — is the module published?"))
            .subscribe(["SELECT * FROM pin_attempt_result"]);
        } catch (err) {
          console.warn("[SpacetimeDB] PIN attempt subscription failed:", err);
        }
        const bootOrgId = activeOrgId();
        if (bootOrgId) {
          try {
            conn
              .subscriptionBuilder()
              // A malformed query is rejected asynchronously by the server, so
              // the try/catch below never sees it. Without this handler the
              // whole batch can fail and every screen sits empty in silence —
              // which is exactly what an option column in a WHERE used to do.
              .onError(() =>
                console.error(
                  "[SpacetimeDB] org subscription batch was rejected — every org-scoped table is empty",
                ),
              )
              .subscribe(orgSubscriptions(bootOrgId));
          } catch (err) {
            console.warn("[SpacetimeDB] Org subscription failed:", err);
          }
        }
        if (bootOrgId) {
          try {
            conn
              .subscriptionBuilder()
              .onError(() =>
                console.warn("[SpacetimeDB] bug_report subscription failed — is the module published?"),
              )
              .subscribe(bugSubscriptions(bootOrgId));
          } catch (err) {
            console.warn("[SpacetimeDB] Bug report subscription failed:", err);
          }
          try {
            conn
              .subscriptionBuilder()
              .onError(() =>
                console.warn("[SpacetimeDB] page_presence subscription failed — is the module published?"),
              )
              .subscribe(presenceSubscriptions(bootOrgId));
          } catch (err) {
            console.warn("[SpacetimeDB] Page presence subscription failed:", err);
          }
          try {
            conn
              .subscriptionBuilder()
              .onError(() =>
                console.warn("[SpacetimeDB] forms subscription failed — is the module published?"),
              )
              .subscribe(formSubscriptions(bootOrgId));
          } catch (err) {
            console.warn("[SpacetimeDB] Forms subscription failed:", err);
          }
          try {
            conn
              .subscriptionBuilder()
              .onError(() =>
                console.warn("[SpacetimeDB] chat side-table subscription failed — is the module published?"),
              )
              .subscribe(chatSideSubscriptions());
          } catch (err) {
            console.warn("[SpacetimeDB] Chat side-table subscription failed:", err);
          }
        }
      })
      .onDisconnect(() => {
        setConnected(false);
        clearConnection();
      })
      .onConnectError((_ctx, error) => {
        console.error("[SpacetimeDB] Connection error:", error);
        setLastError(error instanceof Error ? error.message : String(error));
        const MAX_RETRIES = 5;
        const delay = Math.min(2000 * 2 ** retryCount, 30000);
        if (retryCount < MAX_RETRIES) {
          console.log(`ℹ️ INFO Retrying in ${delay / 1000}s... (${retryCount + 1}/${MAX_RETRIES})`);
          setTimeout(() => setRetryCount((c) => c + 1), delay);
        } else {
          import("sonner").then(({ toast }) => {
            toast.error(tRef.current("toast.dbConnectionFailed"), {
              description: String(error),
              duration: 10000,
            });
          });
        }
      });
  }, [authToken, retryCount]);

  if (!builder) {
    const showError = tokenMissing || timedOut;
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-stone-50">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
        <p className="text-xs text-muted-foreground">{t("layout.connecting")}</p>
        {showError && (
          <div className="flex flex-col items-center gap-2 mt-2">
            <p className="text-xs text-red-500">
              {tokenMissing ? t("layout.notConnected") : t("layout.connectionTimedOut")}
            </p>
            <button
              onClick={signOut}
              className="rounded border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              {t("layout.signOutAndRetry")}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <SpacetimeDBProvider connectionBuilder={builder}>
      <SpacetimeStatusContext.Provider value={{ connected, retryCount, tokenMissing, timedOut, lastError }}>
        {children}
      </SpacetimeStatusContext.Provider>
    </SpacetimeDBProvider>
  );
}

export { setConnection, clearConnection };
