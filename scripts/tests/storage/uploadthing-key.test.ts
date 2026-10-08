// lib/storage's UploadThing key rules against the module's copy
// (spacetimedb/src/drive/storage.ts): every case must agree, and the source list
// and file cap must be the module's.

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import * as moduleStorage from "../../../spacetimedb/src/drive/storage";
import { APP_UPLOAD_MAX_FILES as MODULE_MAX_FILES } from "../../../spacetimedb/src/drive/storage-reducers";
import { appFileKeyHash, uploadThingKeyOf, uploadThingKeysIn } from "@/lib/storage/uploadthing-key";
import { APP_FILE_SOURCES, APP_UPLOAD_MAX_FILES, isAppFileSource } from "@/lib/storage/sources";

const KEY = "8Ix3dU0a9cWqK1mZ2pLr7tYvB5nE4hJ6sGfD0oXwQe1Ru3Tz";
const hashOf = (key: string): string => createHash("sha256").update(key, "utf8").digest("hex");

const CASES: ReadonlyArray<[string, string | null]> = [
  [`https://utfs.io/f/${KEY}`, KEY],
  [`https://abc123.ufs.sh/f/${KEY}`, KEY],
  [`https://ABC123.UFS.SH/f/${KEY}`, KEY],
  [`HTTPS://utfs.io/f/${KEY}`, KEY],
  [`https://utfs.io:443/f/${KEY}`, KEY],
  [`https://a.b-c.ufs.sh/f/${KEY}`, KEY],
  [`https://utfs.io/a/app42/${KEY}`, KEY],
  [`https://x.ufs.sh/a/app42/${KEY}?w=10`, KEY],
  [`https://utfs.io/f/${KEY}#frag`, KEY],
  [`  https://utfs.io/f/${KEY}  `, KEY],
  ["https://utfs.io/f/a%20b", "a%20b"],
  [`https://utfs.io/f/${KEY}/extra`, null],
  [`http://utfs.io/f/${KEY}`, null],
  [`https://utfs.io:8443/f/${KEY}`, null],
  [`https://evil.com/f/${KEY}`, null],
  [`https://utfs.io.evil.com/f/${KEY}`, null],
  [`https://ufs.sh/f/${KEY}`, null],
  [`https://x.ufs.sh.evil.com/f/${KEY}`, null],
  ["https://utfs.io/f/", null],
  [`https://utfs.io/g/${KEY}`, null],
  [`https://utfs.io/a/${KEY}`, null],
  [KEY, null],
  ["", null],
];

describe("uploadThingKeyOf (parity with the module)", () => {
  for (const [url, expected] of CASES) {
    test(JSON.stringify(url), () => {
      expect(uploadThingKeyOf(url)).toBe(expected);
      expect(moduleStorage.uploadThingKeyOf(url)).toBe(expected);
    });
  }

  test("uploadThingKeysIn agrees on free text", () => {
    const text = `<p><img src="https://utfs.io/f/${KEY}"></p>{"u":"https://x.ufs.sh/f/k2?x=1"} https://evil.com/f/k3 https://utfs.io/f/${KEY}`;
    expect(uploadThingKeysIn(text)).toEqual([KEY, "k2"]);
    expect(moduleStorage.uploadThingKeysIn(text)).toEqual(uploadThingKeysIn(text));
  });

  test("sources and the per-upload file cap match the module", () => {
    expect([...APP_FILE_SOURCES]).toEqual([...moduleStorage.APP_FILE_SOURCES]);
    expect(APP_UPLOAD_MAX_FILES).toBe(MODULE_MAX_FILES);
    expect(isAppFileSource("chat")).toBe(true);
    expect(isAppFileSource("drive")).toBe(false);
    expect(isAppFileSource(1)).toBe(false);
  });
});

describe("appFileKeyHash", () => {
  test("a URL and its bare key hash the same: sha256 of the key", () => {
    expect(appFileKeyHash(`https://abc.ufs.sh/f/${KEY}`)).toBe(hashOf(KEY));
    expect(appFileKeyHash(KEY)).toBe(hashOf(KEY));
    expect(appFileKeyHash(`https://utfs.io/a/app/${KEY}`)).toBe(hashOf(KEY));
  });

  test("the key is hashed as written, not URL-decoded", () => {
    expect(appFileKeyHash("https://utfs.io/f/a%20b")).toBe(hashOf("a%20b"));
  });

  test("anything that is neither an UploadThing URL nor a bare key is null", () => {
    expect(appFileKeyHash("")).toBeNull();
    expect(appFileKeyHash("https://evil.com/f/k")).toBeNull();
    expect(appFileKeyHash("a/b")).toBeNull();
    expect(appFileKeyHash("a b")).toBeNull();
    expect(appFileKeyHash("k".repeat(257))).toBeNull();
    expect(appFileKeyHash("k".repeat(256))).toBe(hashOf("k".repeat(256)));
  });
});
