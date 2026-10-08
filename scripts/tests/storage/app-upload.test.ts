// The client wrapper (lib/storage/app-upload.ts): error copy, the auth header and
// input every store upload carries, and the signed-out short circuit.

import { afterEach, describe, expect, test } from "bun:test";
import { UploadThingError } from "uploadthing/server";
import { registerAuthTokenGetter } from "@/lib/auth/token-bridge";
import { appUploadErrorKey, appUploadHeaders, appUploadInput, uploadAppFiles } from "@/lib/storage/app-upload";

let unregister: (() => void) | null = null;
afterEach(() => {
  unregister?.();
  unregister = null;
});

describe("appUploadErrorKey", () => {
  test("out of room, from the route's refusal as the UploadThing client rebuilds it", () => {
    const err = new UploadThingError({ code: "FORBIDDEN", message: "[drive.quota_exceeded] Storage is full" });
    expect(appUploadErrorKey(err)).toBe("appUpload.quotaExceeded");
  });

  test("the tag is found in a cause too", () => {
    const err = new UploadThingError({ code: "FORBIDDEN", message: "Upload failed", cause: new Error("[drive.quota_exceeded] x") });
    expect(appUploadErrorKey(err)).toBe("appUpload.quotaExceeded");
  });

  test("signed out: the route's refusal and the wrapper's own", () => {
    expect(appUploadErrorKey(new UploadThingError({ code: "FORBIDDEN", message: "[drive.unauthenticated] Sign in to upload" })))
      .toBe("appUpload.signInRequired");
    expect(appUploadErrorKey(new Error("[drive.unauthenticated] Sign in to upload"))).toBe("appUpload.signInRequired");
  });

  test("anything else is the generic failure", () => {
    for (const err of [
      new UploadThingError({ code: "FORBIDDEN", message: "[drive.forbidden] Not an active member of this store" }),
      new UploadThingError({ code: "BAD_REQUEST", message: "Invalid input" }),
      new UploadThingError({ code: "TOO_LARGE", message: "File too large" }),
      new Error("network"), "boom", null, undefined, 42, {},
    ]) {
      expect(appUploadErrorKey(err)).toBe("appUpload.failed");
    }
  });
});

describe("headers and input", () => {
  test("the bearer token is read fresh on every upload", async () => {
    let n = 0;
    unregister = registerAuthTokenGetter(async () => `tok${++n}`);
    expect(await appUploadHeaders()).toEqual({ Authorization: "Bearer tok1" });
    expect(await appUploadHeaders()).toEqual({ Authorization: "Bearer tok2" });
  });

  test("signed out: no header (the route refuses)", async () => {
    unregister = registerAuthTokenGetter(async () => null);
    expect(await appUploadHeaders()).toEqual({});
  });

  test("input names the store and the source", () => {
    expect(appUploadInput("org-1", "bugs")).toEqual({ organizationId: "org-1", source: "bugs" });
  });
});

describe("uploadAppFiles", () => {
  const file = new File(["x"], "a.png", { type: "image/png" });

  test("signed out: rejects with the sign-in copy before any request", async () => {
    unregister = registerAuthTokenGetter(async () => null);
    const err = await uploadAppFiles("generalFile", { files: [file], organizationId: "org-1", source: "chat" }).catch((e: unknown) => e);
    expect(appUploadErrorKey(err)).toBe("appUpload.signInRequired");
  });

  test("no store: rejects with the generic copy", async () => {
    unregister = registerAuthTokenGetter(async () => "tok");
    const err = await uploadAppFiles("generalFile", { files: [file], organizationId: "", source: "chat" }).catch((e: unknown) => e);
    expect(appUploadErrorKey(err)).toBe("appUpload.failed");
  });
});
