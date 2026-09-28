// components/drive/model/upload-plan.ts (drive-ui §5.6). Named folder-upload-plan so it doesn't
// clash with storage's upload-plan.test.ts (lib/drive/upload.ts planDriveUpload).
import { describe, expect, test } from "bun:test";
import {
  DRIVE_UPLOAD_MAX_DIR_DEPTH,
  photoFileName,
  planFolderUpload,
  preflightUploads,
  type DroppedFile,
} from "@/components/drive/model/upload-plan";

function file(name: string, size = 10): File {
  return new File([new Uint8Array(size)], name);
}

function dropped(path: string, size = 10): DroppedFile {
  return { file: file(path.slice(path.lastIndexOf("/") + 1) || "x", size), path };
}

describe("planFolderUpload", () => {
  test("folders come parents first, once each; files keep their directory", () => {
    const plan = planFolderUpload([
      dropped("Shop/Photos/April/a.jpg"),
      dropped("Shop/menu.pdf"),
      dropped("Shop/Photos/b.jpg"),
      dropped("Shop/Invoices/c.pdf"),
      dropped("loose.txt"),
    ]);
    expect(plan.folders).toEqual([["Shop"], ["Shop", "Photos"], ["Shop", "Photos", "April"], ["Shop", "Invoices"]]);
    expect(plan.uploads.map((u) => [u.file.name, u.dir])).toEqual([
      ["a.jpg", ["Shop", "Photos", "April"]],
      ["menu.pdf", ["Shop"]],
      ["b.jpg", ["Shop", "Photos"]],
      ["c.pdf", ["Shop", "Invoices"]],
      ["loose.txt", []],
    ]);
    expect(plan.skipped).toEqual([]);
    for (const [i, folder] of plan.folders.entries()) {
      if (folder.length > 1) {
        const parent = JSON.stringify(folder.slice(0, -1));
        expect(plan.folders.slice(0, i).some((f) => JSON.stringify(f) === parent)).toBe(true);
      }
    }
  });

  test("leading slashes, empty and '.' segments are ignored", () => {
    const plan = planFolderUpload([dropped("/Shop//./a.jpg"), dropped("./b.jpg")]);
    expect(plan.folders).toEqual([["Shop"]]);
    expect(plan.uploads.map((u) => u.dir)).toEqual([["Shop"], []]);
  });

  test("a '..' segment skips the file", () => {
    const plan = planFolderUpload([dropped("Shop/../../etc/passwd"), dropped("Shop/ok.txt")]);
    expect(plan.uploads.map((u) => u.file.name)).toEqual(["ok.txt"]);
    expect(plan.skipped.map((s) => [s.path, s.reason])).toEqual([["Shop/../../etc/passwd", "unsafePath"]]);
    expect(plan.folders).toEqual([["Shop"]]);
  });

  test("OS junk files are dropped silently", () => {
    const plan = planFolderUpload([dropped("Shop/.DS_Store"), dropped("Shop/Thumbs.db"), dropped("thumbs.DB"), dropped("Shop/a.jpg")]);
    expect(plan.uploads.map((u) => u.file.name)).toEqual(["a.jpg"]);
    expect(plan.skipped).toEqual([]);
  });

  test("files deeper than the cap are skipped", () => {
    const deep = `${Array.from({ length: DRIVE_UPLOAD_MAX_DIR_DEPTH + 1 }, (_, i) => `d${i}`).join("/")}/deep.txt`;
    const atCap = `${Array.from({ length: DRIVE_UPLOAD_MAX_DIR_DEPTH }, (_, i) => `d${i}`).join("/")}/ok.txt`;
    const plan = planFolderUpload([dropped(deep), dropped(atCap)]);
    expect(DRIVE_UPLOAD_MAX_DIR_DEPTH).toBe(16);
    expect(plan.uploads.map((u) => u.file.name)).toEqual(["ok.txt"]);
    expect(plan.skipped.map((s) => s.reason)).toEqual(["tooDeep"]);
    expect(plan.folders).toHaveLength(DRIVE_UPLOAD_MAX_DIR_DEPTH);
  });

  test("directory names are cleaned, so decomposed and composed names merge", () => {
    const plan = planFolderUpload([dropped("Cafe\u0301/a.jpg"), dropped("Café/b.jpg"), dropped(" Menu\u202E /c.jpg")]);
    expect(plan.folders).toEqual([["Café"], ["Menu"]]);
    expect(plan.uploads.map((u) => u.dir)).toEqual([["Café"], ["Café"], ["Menu"]]);
  });

  test("a directory name the server would refuse skips the file", () => {
    const plan = planFolderUpload([dropped("a\\b/c.txt"), dropped(`${"x".repeat(256)}/d.txt`), dropped("ok/e.txt")]);
    expect(plan.skipped.map((s) => s.reason)).toEqual(["invalidName", "invalidName"]);
    expect(plan.folders).toEqual([["ok"]]);
  });

  test("an empty path uploads the file at the drop target", () => {
    const plan = planFolderUpload([{ file: file("a.pdf"), path: "" }]);
    expect(plan.uploads.map((u) => [u.file.name, u.dir])).toEqual([["a.pdf", []]]);
    expect(plan.folders).toEqual([]);
  });
});

describe("photoFileName", () => {
  const now = new Date(2026, 8, 26, 14, 32, 8);

  test("uses the local date and time", () => {
    expect(photoFileName("Photo {date}", now, "jpg")).toBe("Photo 2026-09-26 14.32.08.jpg");
    expect(photoFileName("照片 {date}", new Date(2026, 0, 5, 3, 4, 5), ".JPEG")).toBe("照片 2026-01-05 03.04.05.jpeg");
  });

  test("the extension is optional and sanitized", () => {
    expect(photoFileName("Photo {date}", now, "")).toBe("Photo 2026-09-26 14.32.08");
    expect(photoFileName("Photo {date}", now, "..png")).toBe("Photo 2026-09-26 14.32.08.png");
    expect(photoFileName("Photo {date}", now, "j/p\\g")).toBe("Photo 2026-09-26 14.32.08.jpg");
  });

  test("a template can't produce a path or an empty name", () => {
    expect(photoFileName("Shop/Photo {date}", now, "jpg")).toBe("Shop-Photo 2026-09-26 14.32.08.jpg");
    expect(photoFileName("  \u202E ", now, "jpg")).toBe("2026-09-26 14.32.08.jpg");
    expect(photoFileName("..", now, "jpg")).toBe("2026-09-26 14.32.08.jpg");
  });
});

describe("preflightUploads", () => {
  const MAX = 1000;

  test("empty and too large files are refused one by one", () => {
    const a = file("a.txt", 0);
    const b = file("b.txt", 1001);
    const c = file("c.txt", 1000);
    const result = preflightUploads([a, b, c], null, 0, MAX);
    expect(result.accepted).toEqual([c]);
    expect(result.rejected).toEqual([
      { file: a, reason: "empty" },
      { file: b, reason: "tooLarge" },
    ]);
  });

  test("a batch that doesn't fit the quota is refused whole; earlier reasons stay", () => {
    const a = file("a.txt", 400);
    const b = file("b.txt", 400);
    const empty = file("e.txt", 0);
    const usage = { usedBytes: 1000, reservedBytes: 250 };
    expect(preflightUploads([a, b], usage, 2050, MAX)).toEqual({ accepted: [a, b], rejected: [] });
    const over = preflightUploads([a, empty, b], usage, 2049, MAX);
    expect(over.accepted).toEqual([]);
    expect(over.rejected).toEqual([
      { file: a, reason: "quota" },
      { file: empty, reason: "empty" },
      { file: b, reason: "quota" },
    ]);
  });

  test("reserved bytes count, and exactly full still fits", () => {
    const a = file("a.txt", 100);
    expect(preflightUploads([a], { usedBytes: 800, reservedBytes: 100 }, 1000, MAX).accepted).toEqual([a]);
    expect(preflightUploads([a], { usedBytes: 800, reservedBytes: 101 }, 1000, MAX).rejected).toEqual([{ file: a, reason: "quota" }]);
  });

  test("quota 0 means no limit, and no usage row counts as nothing used", () => {
    const a = file("a.txt", 900);
    expect(preflightUploads([a], { usedBytes: 10 ** 12, reservedBytes: 0 }, 0, MAX).accepted).toEqual([a]);
    expect(preflightUploads([a], null, 1000, MAX).accepted).toEqual([a]);
  });

  test("an all-refused batch is not also over quota", () => {
    const a = file("a.txt", 0);
    expect(preflightUploads([a], { usedBytes: 5000, reservedBytes: 0 }, 1000, MAX).rejected).toEqual([{ file: a, reason: "empty" }]);
    expect(preflightUploads([], null, 1000, MAX)).toEqual({ accepted: [], rejected: [] });
  });
});
