// components/drive/model/{names,plural,errors}.ts: entry names, count keys and toast keys.
import { describe, expect, test } from "bun:test";
import {
  BIDI_CONTROLS_RE,
  DOC_TITLE_MAX,
  cleanDriveName,
  cleanEntryName,
  driveNameProblem,
  sameName,
  stripBidiControls,
  uniqueSiblingName,
} from "@/components/drive/model/names";
import { countKey } from "@/components/drive/model/plural";
import { driveErrorToastKey } from "@/components/drive/model/errors";
import { DriveClientError } from "@/lib/drive/errors";
import { DRIVE_NAME_MAX, cleanDriveName as rulesCleanDriveName } from "@/lib/drive/rules";

const BIDI = ["\u061C", "\u200E", "\u200F", "\u202A", "\u202B", "\u202C", "\u202D", "\u202E", "\u2066", "\u2067", "\u2068", "\u2069"];

describe("stripBidiControls", () => {
  test("removes every bidi control", () => {
    expect(stripBidiControls("invoice\u202Efdp.exe")).toBe("invoicefdp.exe");
    expect(stripBidiControls(`a${BIDI.join("")}b`)).toBe("ab");
    expect(stripBidiControls("plain")).toBe("plain");
  });

  test("the exported pattern is safe to test repeatedly", () => {
    for (let i = 0; i < 3; i++) expect(BIDI_CONTROLS_RE.test("x\u202Ey")).toBe(true);
    expect(BIDI_CONTROLS_RE.test("xy")).toBe(false);
  });
});

describe("cleanEntryName", () => {
  test("NFC, controls and bidi stripped, trimmed", () => {
    expect(cleanEntryName("  Cafe\u0301 menu.pdf ")).toBe("Café menu.pdf");
    expect(cleanEntryName("a\u0000b\u001fc\u007fd\u0085e\u009f.txt")).toBe("abcde.txt");
    expect(cleanEntryName("e\u200E\u0301x.txt")).toBe("éx.txt");
    expect(cleanEntryName("\u202E")).toBe("");
    expect(cleanEntryName(undefined as unknown as string)).toBe("");
  });

  test("does not refuse what cleanDriveName refuses", () => {
    expect(cleanEntryName(" a/b ")).toBe("a/b");
    expect(cleanEntryName("..")).toBe("..");
    expect(cleanDriveName("a/b")).toBeNull();
  });

  test("equals cleanDriveName wherever cleanDriveName accepts the name", () => {
    const corpus = [
      "Report.pdf", " spaced ", "Cafe\u0301", "A\u0000\u030A.txt", "\u1100\u200F\u1161.txt", "invoice\u202Efdp.exe",
      "tab\there", "new\nline", "\u2066isolate\u2069.png", "报告.xlsx", "x".repeat(255), "e\u200E\u0301x.txt",
      ...BIDI.map((b) => `a${b}b.txt`),
    ];
    for (const raw of corpus) {
      const strict = rulesCleanDriveName(raw);
      if (strict !== null) expect(cleanEntryName(raw)).toBe(strict);
    }
    expect(cleanDriveName).toBe(rulesCleanDriveName);
  });
});

describe("driveNameProblem", () => {
  test("folders and files", () => {
    for (const kind of ["folder", "file"] as const) {
      expect(driveNameProblem("", kind)).toBe("empty");
      expect(driveNameProblem("   ", kind)).toBe("empty");
      expect(driveNameProblem("\u202E\u200E", kind)).toBe("empty");
      expect(driveNameProblem("a/b", kind)).toBe("invalid");
      expect(driveNameProblem("a\\b", kind)).toBe("invalid");
      expect(driveNameProblem(".", kind)).toBe("invalid");
      expect(driveNameProblem(" .. ", kind)).toBe("invalid");
      expect(driveNameProblem("x".repeat(DRIVE_NAME_MAX + 1), kind)).toBe("tooLong");
      expect(driveNameProblem("x".repeat(DRIVE_NAME_MAX), kind)).toBeNull();
      expect(driveNameProblem(" April stock.xlsx ", kind)).toBeNull();
      expect(driveNameProblem(".env", kind)).toBeNull();
    }
  });

  test("documents keep the document-title rules", () => {
    for (const kind of ["doc", "sheet", "slides"] as const) {
      expect(driveNameProblem("", kind)).toBeNull();
      expect(driveNameProblem("Q3 / Q4 plan", kind)).toBeNull();
      expect(driveNameProblem("x".repeat(DOC_TITLE_MAX), kind)).toBeNull();
      expect(driveNameProblem("x".repeat(DOC_TITLE_MAX + 1), kind)).toBe("tooLong");
      // The server collapses whitespace runs before it measures.
      expect(driveNameProblem(`${"x".repeat(DOC_TITLE_MAX - 2)}     yy`, kind)).toBe("tooLong");
      expect(driveNameProblem(`${"x".repeat(DOC_TITLE_MAX - 3)}     yy`, kind)).toBeNull();
    }
    expect(DOC_TITLE_MAX).toBe(200);
  });
});

describe("sameName", () => {
  test("case-insensitive, accents count, NFC and trim", () => {
    expect(sameName("Report.pdf", "report.PDF")).toBe(true);
    expect(sameName("Résumé", "Resume")).toBe(false);
    expect(sameName("Cafe\u0301", "Café")).toBe(true);
    expect(sameName(" a ", "a")).toBe(true);
    expect(sameName("a\u202Eb", "ab")).toBe(true);
    expect(sameName("a", "b")).toBe(false);
    expect(sameName("x", "X", "not a locale!")).toBe(true);
  });
});

describe("uniqueSiblingName", () => {
  test("a free name stays (cleaned)", () => {
    expect(uniqueSiblingName("a.pdf", [])).toBe("a.pdf");
    expect(uniqueSiblingName(" a.pdf ", ["b.pdf"])).toBe("a.pdf");
  });

  test("a taken name gets the first free counter before the extension", () => {
    expect(uniqueSiblingName("a.pdf", ["a.pdf"])).toBe("a (2).pdf");
    expect(uniqueSiblingName("a.pdf", ["a.pdf", "a (2).pdf"])).toBe("a (3).pdf");
    expect(uniqueSiblingName("a.pdf", ["A.PDF"])).toBe("a (2).pdf");
    expect(uniqueSiblingName("a.pdf", ["a.pdf", "a (3).pdf"])).toBe("a (2).pdf");
  });

  test("a name that already has a counter continues from it", () => {
    expect(uniqueSiblingName("a (2).pdf", ["a (2).pdf"])).toBe("a (3).pdf");
    expect(uniqueSiblingName("a (9)", ["a (9)", "a (10)"])).toBe("a (11)");
    expect(uniqueSiblingName(" (2)", [" (2)"])).toBe("(2) (2)");
  });

  test("names without an extension, dotfiles and version numbers", () => {
    expect(uniqueSiblingName("Folder", ["folder"])).toBe("Folder (2)");
    expect(uniqueSiblingName(".env", [".env"])).toBe(".env (2)");
    expect(uniqueSiblingName("v1.0", ["v1.0"])).toBe("v1.0 (2)");
    expect(uniqueSiblingName("Q3.2026", ["Q3.2026"])).toBe("Q3.2026 (2)");
    expect(uniqueSiblingName("backup.tar.gz", ["backup.tar.gz"])).toBe("backup.tar (2).gz");
    expect(uniqueSiblingName("song.mp3", ["song.mp3"])).toBe("song (2).mp3");
  });

  test("never exceeds the name limit and never splits a surrogate pair", () => {
    const long = `${"x".repeat(DRIVE_NAME_MAX - 4)}.pdf`;
    const next = uniqueSiblingName(long, [long]);
    expect(next.length).toBeLessThanOrEqual(DRIVE_NAME_MAX);
    expect(next.endsWith(" (2).pdf")).toBe(true);
    expect(cleanDriveName(next)).toBe(next);

    const emoji = `${"😀".repeat(127)}.pdf`; // 254 + 4 UTF-16 units
    const withEmoji = uniqueSiblingName(emoji, [emoji]);
    expect(withEmoji.length).toBeLessThanOrEqual(DRIVE_NAME_MAX);
    expect(withEmoji).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(withEmoji.endsWith(" (2).pdf")).toBe(true);
  });
});

describe("countKey", () => {
  test("One for exactly one, the base otherwise", () => {
    expect(countKey("drive.members.files", 1)).toBe("drive.members.filesOne");
    expect(countKey("drive.members.files", 0)).toBe("drive.members.files");
    expect(countKey("drive.members.files", 2)).toBe("drive.members.files");
    expect(countKey("drive.apps.count", 1.5)).toBe("drive.apps.count");
  });
});

describe("driveErrorToastKey", () => {
  test("an error with its own key keeps it", () => {
    expect(driveErrorToastKey(new DriveClientError("quota_exceeded"), "drive.home.errors.createFailed")).toBe("drive.errors.quotaExceeded");
    expect(driveErrorToastKey(new Error("[drive.cycle] Can't move a folder into itself"), "x")).toBe("drive.errors.cycle");
    expect(driveErrorToastKey(new Error("[doc.forbidden] nope"), "x")).toBe("docs.errors.forbidden");
    expect(driveErrorToastKey(new DriveClientError("not_connected"), "x")).toBe("toast.notConnected");
  });

  test("an error with no key of its own says what the action was", () => {
    expect(driveErrorToastKey(new Error("boom"), "drive.home.errors.createFailed")).toBe("drive.home.errors.createFailed");
    expect(driveErrorToastKey("[drive.brand_new_code] from a newer module", "drive.home.errors.importFailed")).toBe(
      "drive.home.errors.importFailed",
    );
    expect(driveErrorToastKey(new DriveClientError("unknown"), "drive.home.errors.downloadFailed")).toBe("drive.home.errors.downloadFailed");
    expect(driveErrorToastKey(null)).toBe("drive.errors.generic");
    expect(driveErrorToastKey(new Error("boom"))).toBe("drive.errors.generic");
  });
});
