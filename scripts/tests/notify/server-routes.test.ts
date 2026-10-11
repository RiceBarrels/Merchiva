// The server wiring around the notifications cron: the open push relay
// (/api/push/send) and the client fan-out that fed it are gone, the cron is the
// only push path, it runs every minute within 60 s, the /merchivaAdmin SQL
// console refuses notification_delivery (the service identity can read it),
// and its reducer calls refuse the cron's claim / finish reducers.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { notifyAdminCallRefusal, notifyAdminSqlRefusal } from "@/lib/notifications/server/admin-sql";

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(?:ts|tsx|js|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

describe("one push path", () => {
  test("/api/push/send is gone, and nothing in the app calls it", () => {
    expect(existsSync(join(ROOT, "app/api/push/send/route.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "app/api/push"))).toBe(false);
    const callers = ["app", "components", "lib"].flatMap(sourceFiles)
      .filter((path) => read(path).includes("/api/push/send"))
      .map((path) => relative(ROOT, join(ROOT, path)));
    expect(callers).toEqual([]);
  });

  test("the client no longer fans out push; the AI reply route no longer pushes itself", () => {
    const actions = read("lib/spacetimedb/actions.ts");
    expect(actions).not.toContain("fanOutChatPush");
    expect(actions).not.toContain("fanOutPush");
    expect(read("app/api/store-ai/enqueue/route.ts")).not.toContain("@/lib/push/send");
    const senders = ["app", "components", "lib"].flatMap(sourceFiles).filter((path) => /\bsendWebPush\(/.test(read(path)));
    expect(senders.sort()).toEqual(["lib/notifications/server/deps.ts", "lib/push/send.ts"]);
  });
});

describe("the cron", () => {
  test("Vercel runs it every minute", () => {
    const crons = (JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> }).crons;
    expect(crons).toContainEqual({ path: "/api/cron/notifications", schedule: "* * * * *" });
  });

  test("the route is thin: node runtime, dynamic, 60 s, GET only", () => {
    const route = read("app/api/cron/notifications/route.ts");
    expect(route).toContain('export const runtime = "nodejs";');
    expect(route).toContain('export const dynamic = "force-dynamic";');
    expect(route).toContain("export const maxDuration = 60;");
    expect(route).toContain("export async function GET(");
    expect(route).not.toMatch(/export (?:async )?function (?:POST|PUT|DELETE)|export const (?:POST|OPTIONS)/);
  });

  test("the handler never reads the Drive storage config", () => {
    for (const file of sourceFiles("lib/notifications/server")) {
      expect(read(file)).not.toMatch(/readDriveStorageConfig|driveServerDeps|parseDriveStorageConfig/);
    }
  });
});

describe("/merchivaAdmin SQL console", () => {
  test("refuses notification_delivery however it is spelled", () => {
    for (const query of [
      "SELECT * FROM notification_delivery",
      "select * from NOTIFICATION_DELIVERY where run_id = 'x'",
      'SELECT * FROM "notification_delivery"',
      "SELECT * FROM `notification_delivery`",
      "SELECT d.* FROM org_member m JOIN notification_delivery d ON d.organization_id = m.organization_id",
      "SELECT * FROM notificationDelivery",
    ]) {
      expect(notifyAdminSqlRefusal(query)).toContain("notification_delivery");
    }
  });

  test("lets every other table through, the notification table included", () => {
    for (const query of [
      "SELECT * FROM notification",
      "SELECT * FROM notification_pref",
      "SELECT * FROM organization WHERE id = 'x'",
      "SELECT * FROM push_subscription",
    ]) {
      expect(notifyAdminSqlRefusal(query)).toBeNull();
    }
  });

  test("adminSql checks before any query reaches SpacetimeDB", () => {
    const stdb = read("lib/merchiva-admin/stdb.ts");
    const body = stdb.slice(stdb.indexOf("export async function adminSql("));
    const guard = body.indexOf("notifyAdminSqlRefusal(query)");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(body.indexOf("await fetch("));
    expect(read("app/api/merchiva-admin/sql/route.ts")).toContain("adminSql(query)");
  });
});

describe("/merchivaAdmin reducer calls", () => {
  test("refuse the cron's claim and finish reducers however they are spelled", () => {
    for (const [reducer, name] of [
      ["serviceClaimNotificationDeliveries", "service_claim_notification_deliveries"],
      ["service_claim_notification_deliveries", "service_claim_notification_deliveries"],
      ["SERVICE_CLAIM_NOTIFICATION_DELIVERIES", "service_claim_notification_deliveries"],
      ["ServiceClaimNotificationDeliveries", "service_claim_notification_deliveries"],
      [" service-claim-notification-deliveries ", "service_claim_notification_deliveries"],
      ["serviceFinishNotificationDeliveries", "service_finish_notification_deliveries"],
      ["service_finish_notification_deliveries", "service_finish_notification_deliveries"],
      ["Service_Finish_NotificationDeliveries", "service_finish_notification_deliveries"],
    ]) {
      expect(notifyAdminCallRefusal(reducer)).toContain(name);
    }
  });

  test("let every other reducer through, the notification ones included", () => {
    for (const reducer of [
      "updateMemberPermissions",
      "serviceCreateNotification",
      "markNotificationRead",
      "markNotificationsDelivered",
      "service_create_notification",
    ]) {
      expect(notifyAdminCallRefusal(reducer)).toBeNull();
    }
  });

  test("adminCall checks before the schema lookup and before any connection is opened", () => {
    const stdb = read("lib/merchiva-admin/stdb.ts");
    const body = stdb.slice(stdb.indexOf("export async function adminCall("));
    const guard = body.indexOf("notifyAdminCallRefusal(reducer)");
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(body.indexOf("reducerSchemas"));
    expect(guard).toBeLessThan(body.indexOf("await getServiceConn()"));
    expect(read("app/api/merchiva-admin/rpc/route.ts")).toContain("adminCall(reducer,");
  });
});
