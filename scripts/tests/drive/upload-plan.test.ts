// lib/drive/upload.ts: planDriveUpload (limits, names, types, keys),
// mapBlobSdkError, the uploadDriveFile steps over a fake transport (fresh,
// resume, cancel, oversize, release on failure, late progress, which failures
// reserved nothing), the real transport's begin and commit checks and PUT token
// request (through a fake connection and a stubbed fetch; client-adapter.test.ts
// covers the storage status answers), and the tab's shared storage answer.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { newDocumentId } from "@/lib/docs/ids";
import { registerDriveTokenGetter, type DriveCommitInput, type DriveCommitResult } from "@/lib/drive/api";
import { DriveClientError, type DriveClientErrorCode } from "@/lib/drive/errors";
import {
  DRIVE_MAX_FILE_BYTES, DRIVE_MULTIPART_THRESHOLD_BYTES, driveBlobKey, driveThumbKeyFor, parseDriveBlobKey,
} from "@/lib/drive/rules";
import { createDriveThumbnail, type DriveThumbnail } from "@/lib/drive/thumbnail";
import {
  __resetDriveStorageStatusForTests, createDriveUploadTransport, driveStorageReady, driveUploadReservedNothing,
  getDriveStorageAvailability, mapBlobSdkError, planDriveUpload, subscribeDriveStorageAvailability, uploadDriveFile,
  type DriveUploadPlan, type DriveUploadProgress, type DriveUploadTarget, type DriveUploadTransport,
} from "@/lib/drive/upload";
import { clearConnection, setActiveOrgId, setConnection } from "@/lib/spacetimedb/client";

const ORG = "0b6a2c1e-7d4f-4a1b-9c2d-3e4f5a6b7c8d";
const TARGET: DriveUploadTarget = { organizationId: ORG, space: "store", parentId: "", actingMemberId: "" };

function fakeFile(size: number, name: string, type = ""): Blob {
  return { size, name, type } as unknown as Blob;
}

function codeOf(fn: () => unknown): DriveClientErrorCode | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof DriveClientError ? err.code : null;
  }
}

describe("planDriveUpload", () => {
  test("a valid file gets ids, the module's keys, a resolved type and no multipart below the threshold", () => {
    const plan = planDriveUpload({ file: new File(["hello"], "Q3 report.xlsx") }, TARGET);
    expect(plan.name).toBe("Q3 report.xlsx");
    expect(plan.sizeBytes).toBe(5);
    expect(plan.mimeType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(plan.blobKey).toBe(driveBlobKey(ORG, plan.itemId, plan.blobId, "Q3 report.xlsx"));
    expect(plan.blobKey).toEndWith("/Q3-report.xlsx");
    expect(plan.thumbKey).toBe(driveThumbKeyFor(plan.blobKey));
    expect(parseDriveBlobKey(plan.blobKey)?.itemId).toBe(plan.itemId);
    expect(plan.multipart).toBe(false);
    expect(plan.target).toEqual({ organizationId: ORG, space: "store", parentId: "", ownerMemberId: undefined, actingMemberId: "" });
  });

  test("empty files are refused with `invalid` (C13); anything over the cap with `too_large`", () => {
    expect(codeOf(() => planDriveUpload({ file: fakeFile(0, "a.txt") }, TARGET))).toBe("invalid");
    expect(codeOf(() => planDriveUpload({ file: fakeFile(DRIVE_MAX_FILE_BYTES + 1, "a.txt") }, TARGET))).toBe("too_large");
    expect(codeOf(() => planDriveUpload({ file: fakeFile(DRIVE_MAX_FILE_BYTES, "a.txt") }, TARGET))).toBeNull();
  });

  test("multipart starts at the threshold", () => {
    expect(planDriveUpload({ file: fakeFile(DRIVE_MULTIPART_THRESHOLD_BYTES - 1, "v.mp4") }, TARGET).multipart).toBe(false);
    expect(planDriveUpload({ file: fakeFile(DRIVE_MULTIPART_THRESHOLD_BYTES, "v.mp4") }, TARGET).multipart).toBe(true);
  });

  test("blocked types and hidden extensions are refused with `blocked_type`", () => {
    for (const name of ["setup.exe", "invoice.pdf.EXE", "setup.exe~", "run.bat)", "x.apk"]) {
      expect(codeOf(() => planDriveUpload({ file: fakeFile(10, name) }, TARGET))).toBe("blocked_type");
    }
    expect(codeOf(() => planDriveUpload({ file: fakeFile(10, "notes", "application/x-msdownload") }, TARGET))).toBe("blocked_type");
    expect(codeOf(() => planDriveUpload({ file: fakeFile(10, "menu.pdf") }, TARGET))).toBeNull();
  });

  test("bad names are refused with `invalid_name`; names are cleaned and composed (NFC)", () => {
    for (const name of ["", ".", "..", "a/b.txt", "a\\b.txt", "x".repeat(256)]) {
      expect(codeOf(() => planDriveUpload({ file: fakeFile(10, name) }, TARGET))).toBe("invalid_name");
    }
    const plan = planDriveUpload({ file: fakeFile(10, "  Cafe\u0301\u202e.txt  ") }, TARGET);
    expect(plan.name).toBe("Caf\u00e9.txt");
    expect(plan.name).toBe(plan.name.normalize("NFC"));
    expect(plan.blobKey).toEndWith("/Caf.txt");
  });

  test("source.name and source.mimeType win over the File's own", () => {
    const plan = planDriveUpload({ file: new File(["x"], "IMG_1.HEIC", { type: "image/heic" }), name: "报告.pdf", mimeType: "application/pdf" }, TARGET);
    expect(plan.name).toBe("报告.pdf");
    expect(plan.mimeType).toBe("application/pdf");
    expect(plan.blobKey).toEndWith("/file.pdf");
    const fromExtension = planDriveUpload({ file: fakeFile(3, "clip.mov", "application/octet-stream") }, TARGET);
    expect(fromExtension.mimeType).toBe("video/quicktime");
  });

  test("given ids are used lowercased; malformed ids or store ids are `invalid`", () => {
    const itemId = newDocumentId();
    const blobId = newDocumentId();
    const plan = planDriveUpload({ file: fakeFile(1, "a.txt") }, { ...TARGET, organizationId: ORG.toUpperCase() }, { itemId: itemId.toUpperCase(), blobId });
    expect(plan.itemId).toBe(itemId);
    expect(plan.blobId).toBe(blobId);
    expect(plan.target.organizationId).toBe(ORG);
    expect(codeOf(() => planDriveUpload({ file: fakeFile(1, "a.txt") }, TARGET, { itemId: "x", blobId }))).toBe("invalid");
    expect(codeOf(() => planDriveUpload({ file: fakeFile(1, "a.txt") }, { ...TARGET, organizationId: "org-1" }))).toBe("invalid");
  });
});

describe("mapBlobSdkError", () => {
  const cases: Array<[unknown, DriveClientErrorCode]> = [
    [new Error("Vercel Blob: The request was aborted."), "aborted"],
    [Object.assign(new Error("x"), { name: "AbortError" }), "aborted"],
    [new Error("Vercel Blob: Failed to retrieve the presigned URL"), "upload_start_failed"],
    [new Error("Vercel Blob: File is too large, max 5 bytes."), "too_large"],
    [new Error("Vercel Blob: Content type mismatch, image/png is not allowed."), "invalid"],
    [new Error("Vercel Blob: Client token has expired."), "expired"],
    [new TypeError("Failed to fetch"), "network"],
  ];
  for (const [err, code] of cases) {
    test(`${(err as Error).message || (err as Error).name} → ${code}`, () => {
      const mapped = mapBlobSdkError(err);
      expect(mapped).toBeInstanceOf(DriveClientError);
      expect((mapped as DriveClientError).code).toBe(code);
    });
  }

  test("an aborted signal wins; a DriveClientError passes through; anything else stays generic", () => {
    const controller = new AbortController();
    controller.abort();
    expect((mapBlobSdkError(new Error("Vercel Blob: Unknown error"), controller.signal) as DriveClientError).code).toBe("aborted");
    const own = new DriveClientError("quota_exceeded");
    expect(mapBlobSdkError(own)).toBe(own);
    const other = new Error("Vercel Blob: The blob service is currently not available. Please try again.");
    expect(mapBlobSdkError(other)).toBe(other);
    expect(mapBlobSdkError("weird")).toBeInstanceOf(Error);
  });
});

interface Step { op: string; which?: string; thumbKey?: string }

function fakeTransport(opts: {
  thumb?: DriveThumbnail | null;
  commits?: Array<DriveCommitResult | DriveClientError>;
  putError?: (which: string) => Error | null;
  onPut?: (which: string, signal?: AbortSignal) => void;
} = {}) {
  const steps: Step[] = [];
  const commits = [...(opts.commits ?? [])];
  const transport: DriveUploadTransport = {
    async begin() {
      steps.push({ op: "begin" });
    },
    async put(_plan, which, body, _type, putOpts) {
      steps.push({ op: "put", which });
      opts.onPut?.(which, putOpts.signal);
      const err = opts.putError?.(which);
      if (err) throw err;
      putOpts.onProgress?.(body.size / 2, body.size);
      putOpts.onProgress?.(body.size, body.size);
    },
    async commit(input: DriveCommitInput) {
      steps.push({ op: "commit", thumbKey: input.thumbKey });
      const next = commits.shift() ?? { outcome: "committed", sizeBytes: 5 };
      if (next instanceof DriveClientError) throw next;
      return next;
    },
    async abort() {
      steps.push({ op: "abort" });
    },
    async thumbnail() {
      steps.push({ op: "thumbnail" });
      return opts.thumb ?? null;
    },
  };
  return { steps, transport };
}

const THUMB: DriveThumbnail = { blob: new Blob(["t"], { type: "image/webp" }), mimeType: "image/webp" };

describe("uploadDriveFile", () => {
  test("fresh: thumbnail → begin → PUT thumb → PUT original → commit with the thumb key; phases in order", async () => {
    const { steps, transport } = fakeTransport({ thumb: THUMB });
    const phases: DriveUploadProgress[] = [];
    const file = new File(["hello"], "photo.jpg", { type: "image/jpeg" });
    const result = await uploadDriveFile({ file }, TARGET, { transport, onProgress: (p) => phases.push(p) });
    expect(steps.map((s) => s.which ? `${s.op}:${s.which}` : s.op)).toEqual(["thumbnail", "begin", "put:thumb", "put:original", "commit"]);
    const plan = planDriveUpload({ file }, TARGET);
    expect(steps[4].thumbKey).toEndWith("/_thumb");
    expect(result).toEqual({ itemId: result.itemId, sizeBytes: 5, mimeType: plan.mimeType });
    expect(phases.map((p) => p.phase)).toEqual(["preparing", "uploading", "uploading", "uploading", "finalizing"]);
    expect(phases.at(-1)).toEqual({ phase: "finalizing", loaded: 5, total: 5 });
  });

  test("a failed thumbnail PUT is ignored and not attached", async () => {
    const { steps, transport } = fakeTransport({ thumb: THUMB, putError: (which) => (which === "thumb" ? new Error("nope") : null) });
    await uploadDriveFile({ file: new File(["hello"], "p.jpg") }, TARGET, { transport });
    expect(steps.at(-1)).toEqual({ op: "commit", thumbKey: undefined });
  });

  test("rejected_oversize from the commit → too_large", async () => {
    const { transport } = fakeTransport({ commits: [{ outcome: "rejected_oversize", sizeBytes: 9 }] });
    const err = await uploadDriveFile({ file: new File(["hello"], "a.txt") }, TARGET, { transport }).catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("too_large");
  });

  test("resume commits first and stops there when the bytes had landed", async () => {
    const { steps, transport } = fakeTransport();
    const plan = planDriveUpload({ file: new File(["hello"], "a.txt") }, TARGET);
    await uploadDriveFile({ file: new File(["hello"], "a.txt") }, TARGET, { transport, plan, resume: true });
    expect(steps).toEqual([{ op: "commit", thumbKey: plan.thumbKey }]);
  });

  test("resume after not_uploaded PUTs the original again (no begin, no thumbnail) and commits", async () => {
    const { steps, transport } = fakeTransport({ commits: [new DriveClientError("not_uploaded")] });
    const file = new File(["hello"], "a.txt");
    const plan = planDriveUpload({ file }, TARGET);
    await uploadDriveFile({ file }, TARGET, { transport, plan, resume: true });
    expect(steps.map((s) => s.which ? `${s.op}:${s.which}` : s.op)).toEqual(["commit", "put:original", "commit"]);
  });

  test("resume passes any other failure through (the queue decides whether to start over)", async () => {
    const { steps, transport } = fakeTransport({ commits: [new DriveClientError("not_found")] });
    const file = new File(["hello"], "a.txt");
    const plan = planDriveUpload({ file }, TARGET);
    const err = await uploadDriveFile({ file }, TARGET, { transport, plan, resume: true, keepPendingOnFailure: true }).catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("not_found");
    expect(steps).toHaveLength(1);
  });

  test("a failure after begin releases the pending row, unless the caller keeps it for a retry", async () => {
    const oneShot = fakeTransport({ putError: (which) => (which === "original" ? new DriveClientError("network") : null) });
    const err = await uploadDriveFile({ file: new File(["hello"], "a.txt") }, TARGET, { transport: oneShot.transport }).catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("network");
    expect(oneShot.steps.map((s) => s.op)).toEqual(["thumbnail", "begin", "put", "abort"]);

    const queued = fakeTransport({ putError: (which) => (which === "original" ? new DriveClientError("network") : null) });
    await uploadDriveFile({ file: new File(["hello"], "a.txt") }, TARGET, { transport: queued.transport, keepPendingOnFailure: true }).catch(() => undefined);
    expect(queued.steps.map((s) => s.op)).toEqual(["thumbnail", "begin", "put"]);
  });

  test("storage gone at the thumbnail PUT stops the upload with not_configured; the original is never sent", async () => {
    const { steps, transport } = fakeTransport({ thumb: THUMB, putError: (which) => (which === "thumb" ? new DriveClientError("not_configured") : null) });
    const err = await uploadDriveFile({ file: new File(["hello"], "p.jpg") }, TARGET, { transport }).catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("not_configured");
    expect(steps.map((s) => s.which ? `${s.op}:${s.which}` : s.op)).toEqual(["thumbnail", "begin", "put:thumb", "abort"]);
  });

  test("progress the SDK delivers late (its throttle timer) never reaches the caller once the PUT settled", async () => {
    for (const fail of [false, true]) {
      const phases: DriveUploadProgress[] = [];
      let late = 0;
      const { transport } = fakeTransport({ putError: () => (fail ? new DriveClientError("network") : null) });
      transport.put = async (_plan, _which, body, _type, opts) => {
        opts.onProgress?.(1, body.size);
        setTimeout(() => {
          late++;
          opts.onProgress?.(body.size, body.size);
        }, 10);
        if (fail) throw new DriveClientError("network");
      };
      await uploadDriveFile({ file: new File(["hello"], "a.txt") }, TARGET, { transport, onProgress: (p) => phases.push(p) }).catch(() => undefined);
      const settled = phases.length;
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(late).toBe(1);
      expect(phases).toHaveLength(settled);
      expect(phases.map((p) => p.phase)).toEqual(fail ? ["preparing", "uploading", "uploading"] : ["preparing", "uploading", "uploading", "finalizing"]);
    }
  });

  test("cancelling during the PUT aborts the pending row and rejects with `aborted`", async () => {
    const controller = new AbortController();
    const { steps, transport } = fakeTransport({
      onPut: (which) => {
        if (which === "original") controller.abort();
      },
      putError: (which) => (which === "original" ? new Error("Vercel Blob: The request was aborted.") : null),
    });
    const err = await uploadDriveFile({ file: new File(["hello"], "a.txt") }, TARGET, { transport, signal: controller.signal }).catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("aborted");
    expect(steps.map((s) => s.op)).toEqual(["thumbnail", "begin", "put", "abort"]);
  });

  test("an already aborted signal does nothing at all; a failure before begin leaves nothing to abort", async () => {
    const controller = new AbortController();
    controller.abort();
    const first = fakeTransport();
    const err = await uploadDriveFile({ file: new File(["x"], "a.txt") }, TARGET, { transport: first.transport, signal: controller.signal }).catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("aborted");
    expect(first.steps).toEqual([]);

    const second = fakeTransport();
    second.transport.begin = async () => {
      throw new Error("[drive.quota_exceeded] Storage is full");
    };
    const quota = await uploadDriveFile({ file: new File(["x"], "a.txt") }, TARGET, { transport: second.transport }).catch((e: unknown) => e);
    expect((quota as Error).message).toContain("[drive.quota_exceeded]");
    expect(second.steps.map((s) => s.op)).toEqual(["thumbnail"]);
  });

  test("a failure reserved nothing when begin was refused with a Drive code; not when a row may exist", async () => {
    const failBegin = async (err: Error) => {
      const { transport } = fakeTransport();
      transport.begin = async () => {
        throw err;
      };
      return uploadDriveFile({ file: new File(["x"], "a.txt") }, TARGET, { transport, keepPendingOnFailure: true }).catch((e: unknown) => e);
    };
    for (const refusal of [
      new DriveClientError("not_configured"), new DriveClientError("not_connected"), new DriveClientError("not_published"),
      new Error("[drive.quota_exceeded] Storage is full"), new Error("SenderError: [drive.too_many_pending] Wait"), new Error("[drive.brand_new] x"),
    ]) {
      const err = await failBegin(refusal);
      expect(err).toBe(refusal);
      expect(driveUploadReservedNothing(err)).toBe(true);
    }
    // No Drive code: the module may have taken the row before the answer was lost.
    expect(driveUploadReservedNothing(await failBegin(new Error("WebSocket closed")))).toBe(false);

    const afterBegin = fakeTransport({ putError: (which) => (which === "original" ? new DriveClientError("not_configured") : null) });
    const put = await uploadDriveFile({ file: new File(["x"], "a.txt") }, TARGET, { transport: afterBegin.transport, keepPendingOnFailure: true }).catch((e: unknown) => e);
    expect((put as DriveClientError).code).toBe("not_configured");
    expect(driveUploadReservedNothing(put)).toBe(false);

    const file = new File(["x"], "a.txt");
    const resumed = fakeTransport({ commits: [new DriveClientError("not_configured")] });
    const commit = await uploadDriveFile({ file }, TARGET, { transport: resumed.transport, plan: planDriveUpload({ file }, TARGET), resume: true, keepPendingOnFailure: true })
      .catch((e: unknown) => e);
    expect((commit as DriveClientError).code).toBe("not_configured");
    expect(driveUploadReservedNothing(commit)).toBe(false);
    expect(driveUploadReservedNothing(new DriveClientError("not_configured"))).toBe(false);
    expect(driveUploadReservedNothing("[drive.not_configured]")).toBe(false);
  });
});

describe("createDriveThumbnail", () => {
  test("resolves null outside a browser and for types it does not handle", async () => {
    expect(await createDriveThumbnail(new Blob(["x"]), "image/png")).toBeNull();
    expect(await createDriveThumbnail(new Blob(["x"]), "application/pdf")).toBeNull();
  });
});

describe("createDriveUploadTransport", () => {
  const realFetch = globalThis.fetch;
  let unregister: (() => void) | null = null;
  afterEach(() => {
    clearConnection();
    globalThis.fetch = realFetch;
    unregister?.();
    unregister = null;
    __resetDriveStorageStatusForTests();
  });

  // Storage is up (client-adapter.test.ts covers the other status answers); every other request passes through.
  beforeEach(() => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => (String(input).endsWith("/api/drive/status")
      ? Response.json({ configured: true, paused: false, maxFileBytes: DRIVE_MAX_FILE_BYTES, multipartThresholdBytes: DRIVE_MULTIPART_THRESHOLD_BYTES, thumbMaxBytes: 1 })
      : realFetch(input, init))) as typeof fetch;
  });

  function connectWith(reducers: Record<string, (args: Record<string, unknown>) => Promise<void>>) {
    setConnection({ reducers } as never);
    setActiveOrgId(ORG);
  }

  test("begin sends the plan to beginDriveUpload and accepts the module's matching key", async () => {
    const calls: Array<Record<string, unknown>> = [];
    connectWith({ beginDriveUpload: async (args) => void calls.push(args) });
    const plan = planDriveUpload({ file: fakeFile(42, "Menu 2026.pdf") }, { ...TARGET, space: "my", actingMemberId: "op-1" });
    await createDriveUploadTransport().begin(plan);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      organizationId: ORG, itemId: plan.itemId, space: "my", parentId: "", name: "Menu 2026.pdf",
      mimeType: "application/pdf", sizeBytes: 42n, blobKey: plan.blobKey, actingMemberId: "op-1",
    });
  });

  test("begin refuses a plan whose key differs from the one the module computes, and drops the row the module took", async () => {
    const aborted: Array<Record<string, unknown>> = [];
    connectWith({ beginDriveUpload: async () => undefined, abortDriveUpload: async (args) => void aborted.push(args) });
    const plan: DriveUploadPlan = planDriveUpload({ file: fakeFile(42, "a.pdf") }, TARGET);
    const tampered = { ...plan, blobKey: plan.blobKey.replace("/a.pdf", "/b.pdf") };
    const err = await createDriveUploadTransport().begin(tampered).catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("invalid");
    expect(aborted).toEqual([{ itemId: plan.itemId }]);
  });

  test("with the store off, an upload fails with not_configured before the module is asked, and reserved nothing", async () => {
    unregister = registerDriveTokenGetter(async () => "tok");
    globalThis.fetch = (async () =>
      Response.json({ configured: false, paused: false, maxFileBytes: 1, multipartThresholdBytes: 1, thumbMaxBytes: 1 })) as unknown as typeof fetch;
    const calls: Array<Record<string, unknown>> = [];
    connectWith({ beginDriveUpload: async (args) => void calls.push(args), abortDriveUpload: async (args) => void calls.push(args) });
    const err = await uploadDriveFile({ file: fakeFile(42, "a.pdf") }, TARGET, { transport: createDriveUploadTransport(), keepPendingOnFailure: true })
      .catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("not_configured");
    expect(driveUploadReservedNothing(err)).toBe(true);
    expect(calls).toEqual([]);
    expect(getDriveStorageAvailability()).toBe("unavailable");
  });

  test("commit sends nothing while the store is not configured; paused or an unreadable status still commits", async () => {
    unregister = registerDriveTokenGetter(async () => "tok");
    let status: { configured: boolean; paused: boolean } | number = { configured: false, paused: false };
    const hits: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/drive/status")) {
        hits.push("status");
        if (typeof status === "number") return new Response("down", { status });
        return Response.json({ ...status, maxFileBytes: 1, multipartThresholdBytes: 1, thumbMaxBytes: 1 });
      }
      hits.push(url.endsWith("/api/drive/commit") ? "commit" : url);
      // The route refuses before it reads the row only when storage is not configured; paused still commits.
      return typeof status === "number" || !status.configured
        ? Response.json({ error: "File storage is not configured", code: "not_configured" }, { status: 503 })
        : Response.json({ outcome: "committed", sizeBytes: 5 });
    }) as unknown as typeof fetch;
    const plan = planDriveUpload({ file: fakeFile(5, "a.pdf") }, TARGET);
    const input = { itemId: plan.itemId, blobKey: plan.blobKey, thumbKey: plan.thumbKey };
    const transport = createDriveUploadTransport();

    // A Retry of a reserved upload while the store is off: the status says so, and no commit goes out.
    for (let i = 0; i < 3; i++) {
      const err = await transport.commit(input).catch((e: unknown) => e);
      expect((err as DriveClientError).code).toBe("not_configured");
    }
    expect(hits).toEqual(["status"]);

    __resetDriveStorageStatusForTests();
    status = { configured: true, paused: true };
    expect(await transport.commit(input)).toEqual({ outcome: "committed", sizeBytes: 5 });
    expect(hits).toEqual(["status", "status", "commit"]);

    // Unknown: the commit goes ahead and the route answers for itself.
    __resetDriveStorageStatusForTests();
    status = 500;
    const unknown = await transport.commit(input).catch((e: unknown) => e);
    expect((unknown as DriveClientError).code).toBe("not_configured");
    expect(hits).toEqual(["status", "status", "commit", "status", "commit"]);
  });

  test("the tab's storage answer: shared, cached a minute, followed by listeners; an unreadable status is unknown and not kept", async () => {
    unregister = registerDriveTokenGetter(async () => "tok");
    const answers: Array<{ configured: boolean; paused: boolean } | number> = [
      { configured: false, paused: false }, { configured: true, paused: false }, 500, { configured: true, paused: true },
    ];
    let asked = 0;
    globalThis.fetch = (async () => {
      const answer = answers[asked++];
      if (typeof answer === "number") return new Response("down", { status: answer });
      return Response.json({ ...answer, maxFileBytes: 1, multipartThresholdBytes: 1, thumbMaxBytes: 1 });
    }) as unknown as typeof fetch;
    const heard: string[] = [];
    const unsubscribe = subscribeDriveStorageAvailability(() => heard.push(getDriveStorageAvailability()));
    try {
      expect(getDriveStorageAvailability()).toBe("checking");
      expect(await driveStorageReady()).toBe(false);
      expect(getDriveStorageAvailability()).toBe("unavailable");
      // Cached: no second request.
      expect(await driveStorageReady()).toBe(false);
      expect(asked).toBe(1);
      expect(await driveStorageReady(true)).toBe(true);
      expect(await driveStorageReady(true)).toBeNull();
      expect(getDriveStorageAvailability()).toBe("unknown");
      // The unknown answer was not kept: the next read asks again (paused counts as unavailable).
      expect(await driveStorageReady()).toBe(false);
      expect(asked).toBe(4);
      expect(heard).toEqual(["unavailable", "ready", "unknown", "unavailable"]);
    } finally {
      unsubscribe();
    }
  });

  test("an answer overtaken by a newer read is not published", async () => {
    unregister = registerDriveTokenGetter(async () => "tok");
    let releaseSlow!: () => void;
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    let asked = 0;
    globalThis.fetch = (async () => {
      const first = asked++ === 0;
      if (first) await slow;
      return Response.json({ configured: !first, paused: false, maxFileBytes: 1, multipartThresholdBytes: 1, thumbMaxBytes: 1 });
    }) as unknown as typeof fetch;
    const older = driveStorageReady();
    expect(await driveStorageReady(true)).toBe(true);
    releaseSlow();
    expect(await older).toBe(false);
    await Promise.resolve();
    expect(getDriveStorageAvailability()).toBe("ready");
    expect(await driveStorageReady()).toBe(true);
  });

  test("put asks /api/drive/upload for a token with the Bearer header and the client payload; a refusal → upload_start_failed", async () => {
    unregister = registerDriveTokenGetter(async () => "tok-put");
    // The SDK fetches through undici (Bun's native fetch), so a stubbed globalThis.fetch never sees it: serve the route.
    const seen: Array<{ path: string; auth: string | null; body: string }> = [];
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      async fetch(req) {
        seen.push({ path: new URL(req.url).pathname, auth: req.headers.get("authorization"), body: await req.text() });
        return Response.json({ error: "Invalid upload payload", code: "invalid" }, { status: 422 });
      },
    });
    const g = globalThis as { window?: unknown };
    const hadWindow = "window" in g;
    const previousWindow = g.window;
    g.window = { location: { href: `http://127.0.0.1:${server.port}/manager/drive` } };
    try {
      const plan = planDriveUpload({ file: new File(["hello"], "a.txt") }, TARGET);
      const err = await createDriveUploadTransport()
        .put(plan, "original", new Blob(["hello"]), plan.mimeType, {})
        .catch((e: unknown) => e);
      expect((err as DriveClientError).code).toBe("upload_start_failed");
      expect(seen).toHaveLength(1);
      expect(seen[0].path).toBe("/api/drive/upload");
      expect(seen[0].auth).toBe("Bearer tok-put");
      const event = JSON.parse(seen[0].body) as { type: string; payload: { pathname: string; clientPayload: string; multipart: boolean } };
      expect(event.type).toBe("blob.generate-presigned-url");
      expect(event.payload.pathname).toBe(plan.blobKey);
      expect(event.payload.multipart).toBe(false);
      expect(JSON.parse(event.payload.clientPayload)).toEqual({ v: 1, itemId: plan.itemId, sizeBytes: 5, contentType: "text/plain" });
    } finally {
      if (hadWindow) g.window = previousWindow;
      else delete g.window;
      server.stop(true);
    }
  });

  test("put without a token fails with `unauthenticated` before any request", async () => {
    unregister = registerDriveTokenGetter(async () => null);
    let requests = 0;
    globalThis.fetch = (async () => {
      requests++;
      return new Response(null, { status: 500 });
    }) as unknown as typeof fetch;
    const plan = planDriveUpload({ file: new File(["hello"], "a.txt") }, TARGET);
    const err = await createDriveUploadTransport().put(plan, "thumb", new Blob(["t"]), "image/webp", {}).catch((e: unknown) => e);
    expect((err as DriveClientError).code).toBe("unauthenticated");
    expect(requests).toBe(0);
  });
});
