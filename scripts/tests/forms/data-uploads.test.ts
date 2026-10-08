// lib/forms/uploads.ts — file and photo answers through the Drive upload pipeline into the respondent's My files.
import { describe, expect, test } from "bun:test";
import type { DriveUploadPlan, DriveUploadTransport } from "@/lib/drive/upload";
import {
  assertFormUploads, fileFitsQuestion, fileMatchesAccept, formFilesAllowed, questionMaxFiles, uploadFormFile,
  uploadFormFiles, type FormUploadContext,
} from "@/lib/forms/uploads";
import type { FileQuestion } from "@/lib/forms/types";
import { formsErrorKey } from "@/lib/spacetimedb/actions/forms";

const ORG = "4f1c2d3e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const PHOTO: FileQuestion = { id: "q_aaaaaaaaaaaa", type: "photo", title: "Shelf", required: true, maxFiles: 2 };
const PDF: FileQuestion = { id: "q_bbbbbbbbbbbb", type: "file", title: "Invoice", required: false, accept: ".pdf" };
const png = (name = "a.png") => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
const pdf = () => new File([new Uint8Array([4, 5])], "inv.PDF", { type: "application/pdf" });

function fakeTransport(): { transport: DriveUploadTransport; begun: DriveUploadPlan[] } {
  const begun: DriveUploadPlan[] = [];
  const transport: DriveUploadTransport = {
    begin: async (plan) => void begun.push(plan),
    put: async () => undefined,
    commit: async () => ({ outcome: "committed", sizeBytes: 3 }),
    abort: async () => undefined,
    thumbnail: async () => null,
  };
  return { transport, begun };
}

describe("where file answers are allowed", () => {
  test("everywhere but a staff-account store tablet", () => {
    expect(formFilesAllowed({ surface: "manager" })).toBe(true);
    expect(formFilesAllowed({ surface: "personal", deviceAccountRole: "staff" })).toBe(true);
    expect(formFilesAllowed({ surface: "store", deviceAccountRole: "manager" })).toBe(true);
    expect(formFilesAllowed({ surface: "store", deviceAccountRole: "staff" })).toBe(false);
    expect(formFilesAllowed({ surface: "store", deviceAccountRole: null })).toBe(false);
  });

  test("a staff identity holding a store session is a tablet on every surface, like the reducer", () => {
    for (const surface of ["manager", "personal", "store"] as const) {
      expect(formFilesAllowed({ surface, deviceAccountRole: "staff", holdsStoreSession: true })).toBe(false);
      expect(formFilesAllowed({ surface, deviceAccountRole: "manager", holdsStoreSession: true })).toBe(true);
      expect(formFilesAllowed({ surface, deviceAccountRole: "owner", holdsStoreSession: true })).toBe(true);
    }
    expect(formFilesAllowed({ surface: "personal", deviceAccountRole: "staff", holdsStoreSession: false })).toBe(true);
  });

  test("a staff tablet is refused before any request", async () => {
    const { transport, begun } = fakeTransport();
    const ctx: FormUploadContext = { organizationId: ORG, surface: "store", deviceAccountRole: "staff", actingMemberId: "m3" };
    const err = await uploadFormFile(png(), PHOTO, ctx, { transport }).catch((e: unknown) => e);
    expect(formsErrorKey(err)).toBe("forms.errors.files_not_allowed");
    expect(begun).toEqual([]);
  });
});

describe("type and count checks", () => {
  test("accept patterns: extensions, type/* and exact types", () => {
    expect(fileMatchesAccept("a.PDF", "application/pdf", ".pdf")).toBe(true);
    expect(fileMatchesAccept("a.png", "image/png", ".pdf, image/*")).toBe(true);
    expect(fileMatchesAccept("a.txt", "text/plain", "application/pdf")).toBe(false);
    expect(fileMatchesAccept("a.txt", "text/plain", "")).toBe(true);
  });

  test("a photo takes images only; a file question its accept list", () => {
    expect(fileFitsQuestion(png(), PHOTO)).toBe(true);
    expect(fileFitsQuestion(pdf(), PHOTO)).toBe(false);
    expect(fileFitsQuestion(pdf(), PDF)).toBe(true);
    expect(fileFitsQuestion(png(), PDF)).toBe(false);
  });

  test("per-question file cap counts files already attached", () => {
    expect(questionMaxFiles({})).toBe(1);
    expect(questionMaxFiles({ maxFiles: 50 })).toBe(10);
    const ctx: FormUploadContext = { organizationId: ORG, surface: "manager" };
    expect(() => assertFormUploads([png(), png()], PHOTO, ctx)).not.toThrow();
    expect(() => assertFormUploads([png()], PHOTO, ctx, 2)).toThrow("[forms.too_many_files]");
    expect(() => assertFormUploads([pdf()], PHOTO, ctx)).toThrow("[forms.invalid_answer]");
  });
});

describe("uploads", () => {
  test("into the actor's own My files; the operator acts on /store only", async () => {
    const { transport, begun } = fakeTransport();
    const answer = await uploadFormFiles([png("a.png"), png("b.png")], PHOTO, {
      organizationId: ORG, surface: "store", deviceAccountRole: "manager", actingMemberId: "m3",
    }, { transport });
    expect(answer.driveItemIds).toHaveLength(2);
    expect(answer.driveItemIds).toEqual(begun.map((p) => p.itemId));
    for (const plan of begun) {
      expect(plan.target).toMatchObject({ organizationId: ORG, space: "my", parentId: "", actingMemberId: "m3" });
      expect(plan.target.ownerMemberId ?? "").toBe("");
    }
    const personal = fakeTransport();
    await uploadFormFile(pdf(), PDF, { organizationId: ORG, surface: "personal", actingMemberId: "m3" }, { transport: personal.transport });
    expect(personal.begun[0].target.actingMemberId).toBe("");
  });
});
