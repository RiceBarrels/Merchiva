import { describe, expect, test } from "bun:test";
import {
  DRIVE_ACTIVE_MIME_TYPES,
  DRIVE_BLOB_KEY_RE,
  DRIVE_BLOCKED_EXTENSIONS,
  DRIVE_BLOCKED_MIME_TYPES,
  DRIVE_DEFAULT_QUOTA_BYTES,
  DRIVE_MAX_FILE_BYTES,
  DRIVE_MAX_PENDING_PER_UPLOADER,
  DRIVE_MAX_RESERVED_PER_UPLOADER_BYTES,
  DRIVE_MIME_MAX,
  DRIVE_MULTIPART_THRESHOLD_BYTES,
  DRIVE_NAME_MAX,
  DRIVE_THUMB_LEAF,
  DRIVE_THUMB_MAX_BYTES,
  DRIVE_TRASH_RETENTION_MS,
  DRIVE_UPLOAD_TTL_MS,
  DRIVE_URL_BATCH_MAX,
  asciiFileName,
  cleanDriveName,
  driveBlobKey,
  driveExtension,
  driveThumbKeyFor,
  effectiveQuotaBytes,
  isActiveDriveMime,
  isBlockedDriveFile,
  isDriveSpace,
  mimeFromExtension,
  normalizeDriveMime,
  parseDriveBlobKey,
  resolveDriveMime,
} from "@/lib/drive/rules";

const ORG = "0b9d6a3e-1c2f-7a4b-8c5d-6e7f8a9b0c1d"; // org ids need not be v4
const ITEM = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const BLOB = "9b2e4c1a-7d3f-4e8b-a6c5-1f0e2d3c4b5a";
const GIB = 1024 ** 3;

/** Ordinary, Unicode, disguised and edge-case names for the property checks below. */
const NAME_CORPUS: readonly string[] = [
  "Q3 report.xlsx", "报告.pdf", "Café menu.JPG", ".env", "_thumb", "a.b.tar.gz", "x.", "README", "...", "photo.jp g",
  "setup.exe", "setup.exe.", "setup.exe . .", ".apk", "invoice.pdf.exe", "exe.pdf", "photo.img.jpg", "menu.pdf",
  "setup.exe~", "setup.exe-", "setup.exe​", "run.bat)", "invoice.pdf.apk#", "x.ps1·", "evil.lnk⁠",
  "invoice‮exe.pdf", "a\u007fb", "e‎́x.txt", "A\u0000̊.txt", "ᄀ‏ᅡ.txt",
  `${"a".repeat(76)}.exezzzz~`, `${"b".repeat(300)}.pdf`, "\u{1F468}‍\u{1F469}‍\u{1F467}.jpg",
];
/** Characters `asciiFileName` turns into '-' or drops, so they can hide an extension from `driveExtension`. */
const LEAF_JUNK = ["~", "-", "_", ")", "#", "!", " ~", "·", "​", "⁠", "。"];

describe("limits (user decisions U1/U10)", () => {
  test("flat quota values", () => {
    expect(DRIVE_MAX_FILE_BYTES).toBe(1_073_741_824);
    expect(DRIVE_DEFAULT_QUOTA_BYTES).toBe(10_737_418_240);
    expect(DRIVE_MAX_RESERVED_PER_UPLOADER_BYTES).toBe(2 * GIB);
    expect(DRIVE_UPLOAD_TTL_MS).toBe(3 * 60 * 60 * 1000);
    expect(DRIVE_TRASH_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(DRIVE_MAX_PENDING_PER_UPLOADER).toBe(20);
    expect(DRIVE_THUMB_MAX_BYTES).toBe(262_144);
    expect(DRIVE_MULTIPART_THRESHOLD_BYTES).toBe(32 * 1024 ** 2);
    expect(DRIVE_URL_BATCH_MAX).toBe(50);
    expect(Number.isSafeInteger(DRIVE_DEFAULT_QUOTA_BYTES)).toBe(true);
  });

  test("effectiveQuotaBytes: support override, else the flat default", () => {
    expect(effectiveQuotaBytes(null)).toBe(DRIVE_DEFAULT_QUOTA_BYTES);
    expect(effectiveQuotaBytes({ quotaBytesOverride: 0 })).toBe(DRIVE_DEFAULT_QUOTA_BYTES);
    expect(effectiveQuotaBytes({ quotaBytesOverride: 50 * GIB })).toBe(50 * GIB);
    expect(effectiveQuotaBytes({ quotaBytesOverride: 1 })).toBe(1);
    expect(effectiveQuotaBytes({ quotaBytesOverride: -5 })).toBe(DRIVE_DEFAULT_QUOTA_BYTES);
    expect(effectiveQuotaBytes({ quotaBytesOverride: Number.NaN })).toBe(DRIVE_DEFAULT_QUOTA_BYTES);
    // A whole usage row is accepted; unrelated fields never raise the quota.
    const row = { quotaBytesOverride: 0, planQuotaBytes: 100 * GIB, bytesUsed: 12 };
    expect(effectiveQuotaBytes(row)).toBe(DRIVE_DEFAULT_QUOTA_BYTES);
  });
});

describe("cleanDriveName", () => {
  test("trims, keeps Unicode, NFC-normalizes", () => {
    expect(cleanDriveName("  Q3 report.xlsx  ")).toBe("Q3 report.xlsx");
    expect(cleanDriveName("报告.pdf")).toBe("报告.pdf");
    expect(cleanDriveName("مرحبا.txt")).toBe("مرحبا.txt");
    expect(cleanDriveName("नमस्ते.docx")).toBe("नमस्ते.docx");
    const decomposed = "Café.txt";
    expect(cleanDriveName(decomposed)).toBe("Café.txt");
    expect(cleanDriveName(decomposed)?.length).toBe(8);
  });

  test("strips C0/C1 and bidi controls", () => {
    expect(cleanDriveName("a\u0000b\u001fc\u007fd\u0085e\u009f.txt")).toBe("abcde.txt");
    expect(cleanDriveName("tab\there\nnew")).toBe("tabherenew");
    // The classic right-to-left override disguise: shows as "invoicefdp.exe" in an RTL-aware UI.
    expect(cleanDriveName("invoice‮exe.pdf")).toBe("invoiceexe.pdf");
    for (const cp of [0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
      expect(cleanDriveName(`a${String.fromCodePoint(cp)}b`)).toBe("ab");
    }
    // Zero-width joiners and other format characters are text, not controls.
    expect(cleanDriveName("👨‍👩‍👧.jpg")).toBe("👨‍👩‍👧.jpg");
    expect(cleanDriveName("‮‎ ")).toBeNull();
  });

  test("rejects empty, dot names, separators, and overlong names without truncating", () => {
    for (const bad of ["", "   ", "\u0000\u0001", ".", "..", " .. ", "a/b", "a\\b", "/", "\\"]) {
      expect(cleanDriveName(bad)).toBeNull();
    }
    expect(cleanDriveName("...")).toBe("...");
    expect(cleanDriveName(".env")).toBe(".env");
    const max = "a".repeat(DRIVE_NAME_MAX);
    expect(cleanDriveName(max)).toBe(max);
    expect(cleanDriveName(`${max}b`)).toBeNull();
    // Surrounding whitespace does not count toward the limit.
    expect(cleanDriveName(`  ${max}  `)).toBe(max);
  });

  test("is idempotent and always returns NFC, so both sides compute the same leaf", () => {
    // A stripped control between a base and its combining mark must not leave the pair uncomposed.
    expect(cleanDriveName("e‎́x.txt")).toBe("éx.txt");
    expect(cleanDriveName("A\u0000̊.txt")).toBe("Å.txt");
    expect(cleanDriveName("ᄀ‏ᅡ.txt")).toBe("가.txt");
    const corpus = [...NAME_CORPUS];
    const stripped = [0x00, 0x1f, 0x7f, 0x85, 0x9f, 0x061c, 0x200e, 0x200f, 0x202a, 0x202e, 0x2066, 0x2069];
    for (const base of ["e", "A", "o", "ᄀ", "가"]) {
      for (const cp of stripped) {
        for (const mark of ["́", "̊", "̈", "̣", "ᅡ", "ᆨ"]) {
          corpus.push(`${base}${String.fromCodePoint(cp)}${mark}.txt`);
        }
      }
    }
    for (const raw of corpus) {
      const once = cleanDriveName(raw);
      if (once === null) continue;
      expect(once).toBe(once.normalize("NFC"));
      expect(cleanDriveName(once)).toBe(once);
    }
  });
});

describe("normalizeDriveMime", () => {
  test("lowercases and drops parameters", () => {
    expect(normalizeDriveMime("text/plain")).toBe("text/plain");
    expect(normalizeDriveMime("Text/HTML; charset=UTF-8")).toBe("text/html");
    expect(normalizeDriveMime("  image/svg+xml  ")).toBe("image/svg+xml");
    expect(normalizeDriveMime(`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  test("'' when missing or malformed", () => {
    for (const bad of ["", " ", "text", "text/", "/plain", "text/plain/x", "image/*", "text /plain", "tëxt/plain", ";charset=x"]) {
      expect(normalizeDriveMime(bad)).toBe("");
    }
    // U+212A KELVIN SIGN lowercases to ASCII "k"; it must not fold into a valid type.
    expect(normalizeDriveMime("application/Kml")).toBe("");
    const long = `application/${"x".repeat(DRIVE_MIME_MAX - "application/".length)}`;
    expect(normalizeDriveMime(long)).toBe(long);
    expect(normalizeDriveMime(`${long}x`)).toBe("");
  });
});

describe("extensions and blocked types", () => {
  test("driveExtension", () => {
    expect(driveExtension("report.PDF")).toBe("pdf");
    expect(driveExtension("a.b.tar.gz")).toBe("gz");
    expect(driveExtension("README")).toBe("");
    expect(driveExtension("x.")).toBe("");
    expect(driveExtension("setup.exe.")).toBe("exe");
    expect(driveExtension("setup.exe . .")).toBe("exe");
    expect(driveExtension(".apk")).toBe("apk");
    expect(driveExtension("")).toBe("");
  });

  test("isBlockedDriveFile", () => {
    expect(isBlockedDriveFile("invoice.pdf.exe", "application/pdf")).toBe(true);
    expect(isBlockedDriveFile("SETUP.EXE", "")).toBe(true);
    expect(isBlockedDriveFile("app.apk", "application/octet-stream")).toBe(true);
    expect(isBlockedDriveFile("setup.exe.", "")).toBe(true);
    // MIME alone is enough.
    expect(isBlockedDriveFile("menu.pdf", "application/x-msdownload")).toBe(true);
    expect(isBlockedDriveFile("menu", "Application/Vnd.Android.Package-Archive; x=1")).toBe(true);
    // Allowed.
    expect(isBlockedDriveFile("menu.pdf", "application/pdf")).toBe(false);
    expect(isBlockedDriveFile("exe.pdf", "application/pdf")).toBe(false);
    expect(isBlockedDriveFile("photo.img.jpg", "image/jpeg")).toBe(false);
    for (const ext of DRIVE_BLOCKED_EXTENSIONS) expect(isBlockedDriveFile(`x.${ext.toUpperCase()}`, "")).toBe(true);
    for (const mime of DRIVE_BLOCKED_MIME_TYPES) expect(isBlockedDriveFile("x.bin", mime)).toBe(true);
  });

  test("isBlockedDriveFile also checks the blob-key leaf a direct download saves under", () => {
    // `asciiFileName` drops trailing junk or cuts the stem at 80 chars, exposing the extension in the leaf.
    const hidden = ["setup.exe~", "setup.exe-", "setup.exe​", "run.bat)", "invoice.pdf.apk#", "x.ps1·",
      "evil.lnk⁠", "setup.exe~~ ", `${"a".repeat(76)}.exezzzz~`];
    for (const name of hidden) expect(isBlockedDriveFile(name, "")).toBe(true);
    for (const ext of DRIVE_BLOCKED_EXTENSIONS) {
      for (const junk of LEAF_JUNK) expect(isBlockedDriveFile(`x.${ext}${junk}`, "")).toBe(true);
    }
    // A different extension is not a disguise.
    expect(isBlockedDriveFile("x.exe1", "")).toBe(false);
    expect(isBlockedDriveFile("x.exe~.txt", "")).toBe(false);
  });

  test("a name that passes never stores a leaf with a blocked extension", () => {
    const corpus = [...NAME_CORPUS];
    for (const ext of DRIVE_BLOCKED_EXTENSIONS) {
      for (const junk of LEAF_JUNK) {
        for (const stem of ["x", "invoice.pdf", "a".repeat(70), "a".repeat(76), "a".repeat(79), "a".repeat(80)]) {
          corpus.push(`${stem}.${ext}${junk}`, `${stem}.${ext}${junk}zz~`, `${stem}.${ext}${junk}.`);
        }
      }
    }
    let checked = 0;
    for (const raw of corpus) {
      const name = cleanDriveName(raw);
      if (name === null || isBlockedDriveFile(name, "")) continue;
      checked += 1;
      expect(DRIVE_BLOCKED_EXTENSIONS).not.toContain(driveExtension(asciiFileName(name)));
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("blocklists are lowercase and normalized", () => {
    for (const ext of DRIVE_BLOCKED_EXTENSIONS) expect(ext).toMatch(/^[a-z0-9]+$/);
    for (const mime of [...DRIVE_BLOCKED_MIME_TYPES, ...DRIVE_ACTIVE_MIME_TYPES]) expect(normalizeDriveMime(mime)).toBe(mime);
  });

  test("isActiveDriveMime", () => {
    expect(isActiveDriveMime("text/html; charset=utf-8")).toBe(true);
    expect(isActiveDriveMime("IMAGE/SVG+XML")).toBe(true);
    expect(isActiveDriveMime("application/xhtml+xml")).toBe(true);
    // Any +xml type renders as an XML document, where XHTML-namespace script runs.
    for (const mime of ["application/rss+xml", "application/atom+xml", "application/vnd.wap.xhtml+xml",
      "application/x+xml", "application/xslt+xml", "Text/Foo+XML; charset=utf-8"]) {
      expect(isActiveDriveMime(mime)).toBe(true);
    }
    for (const mime of ["application/xml-dtd", "application/ld+json", "text/csv", "application/octet-stream"]) {
      expect(isActiveDriveMime(mime)).toBe(false);
    }
    expect(isActiveDriveMime("text/plain")).toBe(false);
    expect(isActiveDriveMime("application/pdf")).toBe(false);
    expect(isActiveDriveMime("")).toBe(false);
  });

  test("isDriveSpace", () => {
    expect(isDriveSpace("my")).toBe(true);
    expect(isDriveSpace("store")).toBe(true);
    for (const v of ["", "My", "shared", "trash"]) expect(isDriveSpace(v)).toBe(false);
  });
});

describe("asciiFileName", () => {
  const cases: Array<[string, string]> = [
    ["Q3 report.xlsx", "Q3-report.xlsx"],
    ["报告.pdf", "file.pdf"],
    ["Café menu.JPG", "Caf-menu.jpg"],
    [".env", "env"],
    ["_thumb", "thumb"],
    ["a.b.tar.gz", "a.b.tar.gz"],
    ["x.", "x"],
    ["مرحبا بالعالم.docx", "file.docx"],
    ["नमस्ते दुनिया.txt", "file.txt"],
    ["🎉 party 🎉.png", "party.png"],
    ["Ünïcödé naïve résumé.md", "n-c-d-na-ve-r-sum.md"],
    ["--__..name..__--.txt", "name.txt"],
    ["a   b c.txt", "a-b-c.txt"],
    ["README", "README"],
    ["archive.backup-2024", "archive.backup-2024"],
    ["photo.verylongextension", "photo.verylongextension"],
    ["photo.jp g", "photo.jp-g"],
    ["...", "file"],
    ["", "file"],
  ];
  for (const [name, leaf] of cases) {
    test(`${JSON.stringify(name)} → ${leaf}`, () => expect(asciiFileName(name)).toBe(leaf));
  }

  test("caps the stem at 80 characters and never ends it with punctuation", () => {
    expect(asciiFileName(`${"a".repeat(300)}.pdf`)).toBe(`${"a".repeat(80)}.pdf`);
    expect(asciiFileName(`${"b".repeat(79)}-c${"d".repeat(10)}`)).toBe("b".repeat(79));
    const long = asciiFileName(`${"z".repeat(300)}.abcdefghij`);
    expect(long.length).toBe(91);
  });

  test("every leaf fits the key grammar and is never the thumb leaf", () => {
    const names = [...cases.map(([n]) => n), "x".repeat(DRIVE_NAME_MAX), "_thumb.webp", "-_thumb", "Thumbs.db"];
    for (const name of names) {
      const leaf = asciiFileName(name);
      expect(leaf).not.toBe(DRIVE_THUMB_LEAF);
      expect(leaf).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/);
      expect(leaf.length).toBeLessThanOrEqual(91);
    }
  });
});

describe("blob keys", () => {
  test("driveBlobKey ↔ parseDriveBlobKey round trip", () => {
    const key = driveBlobKey(ORG, ITEM, BLOB, "Q3 report.xlsx");
    expect(key).toBe(`org/${ORG}/${ITEM}/${BLOB}/Q3-report.xlsx`);
    expect(parseDriveBlobKey(key)).toEqual({
      organizationId: ORG, itemId: ITEM, blobId: BLOB, leaf: "Q3-report.xlsx", isThumb: false,
    });
    expect(key.length).toBeLessThan(250);
    expect(driveBlobKey(ORG, ITEM, BLOB, `${"報".repeat(DRIVE_NAME_MAX - 4)}.pdf`)).toBe(`org/${ORG}/${ITEM}/${BLOB}/file.pdf`);
  });

  test("thumb keys", () => {
    const key = driveBlobKey(ORG, ITEM, BLOB, "photo.jpg");
    const thumb = driveThumbKeyFor(key);
    expect(thumb).toBe(`org/${ORG}/${ITEM}/${BLOB}/${DRIVE_THUMB_LEAF}`);
    expect(parseDriveBlobKey(thumb)).toEqual({
      organizationId: ORG, itemId: ITEM, blobId: BLOB, leaf: DRIVE_THUMB_LEAF, isThumb: true,
    });
    expect(driveThumbKeyFor(thumb)).toBe(thumb);
    expect(driveThumbKeyFor("")).toBe("");
    expect(driveThumbKeyFor("not/a/key")).toBe("");
  });

  test("rejects malformed keys", () => {
    const ok = `org/${ORG}/${ITEM}/${BLOB}/a.txt`;
    expect(parseDriveBlobKey(ok)).not.toBeNull();
    const bad = [
      "",
      `org/${ORG.toUpperCase()}/${ITEM}/${BLOB}/a.txt`,
      `org/${ORG}/${ITEM.toUpperCase()}/${BLOB}/a.txt`,
      `org/${ORG}/${ITEM}/${BLOB}//a.txt`,
      `org//${ORG}/${ITEM}/${BLOB}/a.txt`,
      `org/${ORG}/${ITEM}/${BLOB}/报告.pdf`,
      `org/${ORG}/${ITEM}/${BLOB}/Café.jpg`,
      `org/${ORG}/${ITEM}/${BLOB}/_x.txt`,
      `org/${ORG}/${ITEM}/${BLOB}/.env`,
      `org/${ORG}/${ITEM}/${BLOB}/-a.txt`,
      `org/${ORG}/${ITEM}/${BLOB}/a b.txt`,
      `org/${ORG}/${ITEM}/${BLOB}/_thumb.webp`,
      `org/${ORG}/${ITEM}/${BLOB}/${"a".repeat(101)}`,
      `org/${ORG}/${ITEM}/${BLOB}`,
      `org/${ORG}/${ITEM}/${BLOB}/`,
      `org/${ORG}/${ITEM}/${BLOB}/a.txt\n`,
      `/org/${ORG}/${ITEM}/${BLOB}/a.txt`,
      `store/${ORG}/${ITEM}/${BLOB}/a.txt`,
      // Item and blob ids must be v4 (version nibble 4, variant 8-b).
      `org/${ORG}/${ORG}/${BLOB}/a.txt`,
      `org/${ORG}/${ITEM}/9b2e4c1a-7d3f-4e8b-06c5-1f0e2d3c4b5a/a.txt`,
      `org/${ORG}/${ITEM}/${BLOB}/../a.txt`,
    ];
    for (const key of bad) expect(parseDriveBlobKey(key)).toBeNull();
    expect(DRIVE_BLOB_KEY_RE.test(ok)).toBe(true);
    expect(parseDriveBlobKey(`org/${ORG}/${ITEM}/${BLOB}/${"a".repeat(100)}`)?.leaf).toBe("a".repeat(100));
  });
});

describe("MIME resolution", () => {
  test("mimeFromExtension", () => {
    expect(mimeFromExtension("photo.JPG")).toBe("image/jpeg");
    expect(mimeFromExtension("IMG_0001.HEIC")).toBe("image/heic");
    expect(mimeFromExtension("clip.mov")).toBe("video/quicktime");
    expect(mimeFromExtension("voice.m4a")).toBe("audio/mp4");
    expect(mimeFromExtension("prices.csv")).toBe("text/csv");
    expect(mimeFromExtension("notes.md")).toBe("text/markdown");
    expect(mimeFromExtension("data.json")).toBe("application/json");
    expect(mimeFromExtension("menu.pdf")).toBe("application/pdf");
    expect(mimeFromExtension("book.xlsx")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(mimeFromExtension("deck.pptx")).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(mimeFromExtension("letter.docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(mimeFromExtension("backup.zip")).toBe("application/zip");
    for (const name of ["README", "x.unknownext", "x.", "setup.exe", "x.constructor", "x.__proto__"]) {
      expect(mimeFromExtension(name)).toBe("application/octet-stream");
    }
  });

  test("every mapped type is already normalized", () => {
    const exts = ["png", "jpg", "heic", "psd", "mp4", "m4v", "mp3", "flac", "pdf", "txt", "md", "json", "xml", "html",
      "csv", "tsv", "rtf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "key", "zip", "gz", "7z", "rar", "svg"];
    for (const ext of exts) {
      const mime = mimeFromExtension(`x.${ext}`);
      expect(mime).not.toBe("application/octet-stream");
      expect(normalizeDriveMime(mime)).toBe(mime);
    }
  });

  test("resolveDriveMime: a specific browser type wins, else the extension", () => {
    expect(resolveDriveMime({ type: "image/png" }, "x.jpg")).toBe("image/png");
    expect(resolveDriveMime({ type: "Text/Plain; charset=utf-8" }, "a.md")).toBe("text/plain");
    expect(resolveDriveMime({ type: "" }, "a.md")).toBe("text/markdown");
    expect(resolveDriveMime({}, "IMG_1.HEIC")).toBe("image/heic");
    expect(resolveDriveMime({ type: "application/octet-stream" }, "book.xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(resolveDriveMime({ type: "garbage" }, "a.pdf")).toBe("application/pdf");
    expect(resolveDriveMime({ type: "" }, "blob")).toBe("application/octet-stream");
  });
});
