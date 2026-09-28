// parseDriveStorageConfig: Drive storage is configured only when every piece is
// present AND the Blob store is paired with this database (DRIVE_BLOB_DATABASE
// === NEXT_PUBLIC_SPACETIMEDB_MODULE). Everything else answers not_configured.

import { describe, expect, test } from "bun:test";
import {
  DRIVE_GET_TTL_MS, DRIVE_PUT_TTL_MULTIPART_MS, DRIVE_PUT_TTL_SINGLE_MS, DRIVE_READ_DELEGATION_REFRESH_MS,
  DRIVE_READ_DELEGATION_TTL_MS, parseDriveStorageConfig,
} from "@/lib/drive/server/handlers/config";
import { createStatusRouteHandler } from "@/lib/drive/server/handlers/status";
import { DRIVE_MAX_FILE_BYTES, DRIVE_MULTIPART_THRESHOLD_BYTES, DRIVE_THUMB_MAX_BYTES, DRIVE_UPLOAD_TTL_MS } from "@/lib/drive/rules";
import { makeDeps, readBody, testConfig } from "./fake-deps";

const FULL: Record<string, string> = {
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_store_secret",
  BLOB_WEBHOOK_PUBLIC_KEY: "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----",
  SPACETIMEDB_SERVICE_TOKEN: "service",
  NEXT_PUBLIC_SPACETIMEDB_URI: "wss://maincloud.spacetimedb.com",
  NEXT_PUBLIC_SPACETIMEDB_MODULE: "merchiva-db",
  DRIVE_BLOB_DATABASE: "merchiva-db",
};

function without(name: string): Record<string, string> {
  const env = { ...FULL };
  delete env[name];
  return env;
}

describe("parseDriveStorageConfig", () => {
  test("a complete, paired environment", () => {
    expect(parseDriveStorageConfig(FULL)).toEqual({
      blobAuth: { token: "vercel_blob_rw_store_secret" },
      webhookPublicKey: FULL.BLOB_WEBHOOK_PUBLIC_KEY,
      serviceToken: "service",
      database: "merchiva-db",
      callbacksEnabled: false,
      uploadsPaused: false,
      reconcileLive: false,
      platformAlertBytes: null,
      cronSecret: null,
    });
  });

  test("the empty environment (no Blob store yet) is not configured", () => {
    expect(parseDriveStorageConfig({})).toBeNull();
  });

  for (const name of ["BLOB_WEBHOOK_PUBLIC_KEY", "SPACETIMEDB_SERVICE_TOKEN", "NEXT_PUBLIC_SPACETIMEDB_URI", "NEXT_PUBLIC_SPACETIMEDB_MODULE", "DRIVE_BLOB_DATABASE"]) {
    test(`missing ${name} → null`, () => {
      expect(parseDriveStorageConfig(without(name))).toBeNull();
      expect(parseDriveStorageConfig({ ...FULL, [name]: "   " })).toBeNull();
    });
  }

  test("Blob credentials: read-write token, else store id (OIDC), else null", () => {
    expect(parseDriveStorageConfig(without("BLOB_READ_WRITE_TOKEN"))).toBeNull();
    expect(parseDriveStorageConfig({ ...without("BLOB_READ_WRITE_TOKEN"), BLOB_STORE_ID: "store_abc" })?.blobAuth)
      .toEqual({ storeId: "store_abc" });
    expect(parseDriveStorageConfig({ ...FULL, BLOB_STORE_ID: "store_abc" })?.blobAuth).toEqual({ token: "vercel_blob_rw_store_secret" });
  });

  test("a store paired with another database is refused (one store per database)", () => {
    expect(parseDriveStorageConfig({ ...FULL, DRIVE_BLOB_DATABASE: "drive-staging" })).toBeNull();
    expect(parseDriveStorageConfig({ ...FULL, DRIVE_BLOB_DATABASE: "MERCHIVA-DB" })).toBeNull();
  });

  test("reconcile runs live only on Vercel production", () => {
    expect(parseDriveStorageConfig({ ...FULL, VERCEL_ENV: "production" })?.reconcileLive).toBe(true);
    expect(parseDriveStorageConfig({ ...FULL, VERCEL_ENV: "preview" })?.reconcileLive).toBe(false);
    expect(parseDriveStorageConfig({ ...FULL, VERCEL_ENV: "development" })?.reconcileLive).toBe(false);
  });

  test("callbacks: an explicit callback URL, or a Vercel production / preview deployment", () => {
    expect(parseDriveStorageConfig({ ...FULL, VERCEL_BLOB_CALLBACK_URL: "https://x.ngrok.app" })?.callbacksEnabled).toBe(true);
    expect(parseDriveStorageConfig({ ...FULL, VERCEL: "1", VERCEL_ENV: "production" })?.callbacksEnabled).toBe(true);
    expect(parseDriveStorageConfig({ ...FULL, VERCEL: "1", VERCEL_ENV: "preview" })?.callbacksEnabled).toBe(true);
    expect(parseDriveStorageConfig({ ...FULL, VERCEL: "1", VERCEL_ENV: "development" })?.callbacksEnabled).toBe(false);
    expect(parseDriveStorageConfig({ ...FULL, VERCEL_ENV: "production" })?.callbacksEnabled).toBe(false);
  });

  test("the uploads kill switch is exactly \"1\"", () => {
    expect(parseDriveStorageConfig({ ...FULL, DRIVE_UPLOADS_PAUSED: "1" })?.uploadsPaused).toBe(true);
    expect(parseDriveStorageConfig({ ...FULL, DRIVE_UPLOADS_PAUSED: "true" })?.uploadsPaused).toBe(false);
    expect(parseDriveStorageConfig({ ...FULL, DRIVE_UPLOADS_PAUSED: "0" })?.uploadsPaused).toBe(false);
  });

  test("platform alert bytes: a positive integer or null", () => {
    expect(parseDriveStorageConfig({ ...FULL, DRIVE_PLATFORM_ALERT_BYTES: "1099511627776" })?.platformAlertBytes).toBe(1099511627776);
    for (const bad of ["0", "-5", "1.5", "lots", ""]) {
      expect(parseDriveStorageConfig({ ...FULL, DRIVE_PLATFORM_ALERT_BYTES: bad })?.platformAlertBytes).toBeNull();
    }
  });

  test("cron secret", () => {
    expect(parseDriveStorageConfig({ ...FULL, CRON_SECRET: "s3cret" })?.cronSecret).toBe("s3cret");
    expect(parseDriveStorageConfig({ ...FULL, CRON_SECRET: "" })?.cronSecret).toBeNull();
  });
});

describe("signed-URL lifetimes", () => {
  test("values (CONTRACTS §2.8)", () => {
    expect(DRIVE_PUT_TTL_SINGLE_MS).toBe(30 * 60_000);
    expect(DRIVE_PUT_TTL_MULTIPART_MS).toBe(3 * 60 * 60_000);
    expect(DRIVE_GET_TTL_MS).toEqual({ view: 15 * 60_000, stream: 2 * 60 * 60_000, download: 10 * 60_000, thumb: 60 * 60_000 });
    expect(DRIVE_READ_DELEGATION_TTL_MS).toBe(12 * 60 * 60_000);
  });

  test("a multipart PUT never outlives the pending window authorize extends", () => {
    expect(DRIVE_PUT_TTL_MULTIPART_MS).toBeLessThanOrEqual(DRIVE_UPLOAD_TTL_MS);
    expect(DRIVE_PUT_TTL_SINGLE_MS).toBeLessThanOrEqual(DRIVE_UPLOAD_TTL_MS);
  });

  test("the cached read delegation always outlives the longest GET it signs", () => {
    expect(DRIVE_READ_DELEGATION_REFRESH_MS).toBeGreaterThan(Math.max(...Object.values(DRIVE_GET_TTL_MS)));
    expect(DRIVE_READ_DELEGATION_TTL_MS).toBeGreaterThan(DRIVE_READ_DELEGATION_REFRESH_MS);
  });
});

describe("GET /api/drive/status", () => {
  const get = (token: string | null) => new Request("http://localhost/api/drive/status", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const limits = {
    maxFileBytes: DRIVE_MAX_FILE_BYTES, multipartThresholdBytes: DRIVE_MULTIPART_THRESHOLD_BYTES, thumbMaxBytes: DRIVE_THUMB_MAX_BYTES,
  };

  test("401 without a verified token", async () => {
    const res = await createStatusRouteHandler(makeDeps().deps)(get(null));
    expect(res.status).toBe(401);
    expect((await readBody(res)).code).toBe("unauthenticated");
  });

  test("unconfigured storage is reported, not an error (the rest of Drive keeps working)", async () => {
    const res = await createStatusRouteHandler(makeDeps({ config: null }).deps)(get("user-jwt"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await readBody(res)).toEqual({ configured: false, paused: false, ...limits });
  });

  test("configured, and the kill switch", async () => {
    expect(await readBody(await createStatusRouteHandler(makeDeps().deps)(get("user-jwt"))))
      .toEqual({ configured: true, paused: false, ...limits });
    const paused = makeDeps({ config: testConfig({ uploadsPaused: true }) }).deps;
    expect(await readBody(await createStatusRouteHandler(paused)(get("user-jwt"))))
      .toEqual({ configured: true, paused: true, ...limits });
  });
});
