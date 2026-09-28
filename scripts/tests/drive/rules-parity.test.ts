// lib/drive/rules.ts (client) ⇄ spacetimedb/src/drive/logic.ts (module): the
// same constants and the same answers over one corpus. The client computes a
// blob key and the module recomputes it and requires equality, so any drift
// here rejects real uploads. logic.ts has no imports: it is imported statically,
// so this file fails loudly (never skips) when it is missing.
//
// Equality alone cannot catch an order bug both sides share, so the module's
// cleanDriveName is also checked on its own for idempotence and NFC output.

import { describe, expect, test } from "bun:test";
import * as client from "@/lib/drive/rules";
import * as server from "../../../spacetimedb/src/drive/logic";

const ORG = "0b9d6a3e-1c2f-7a4b-8c5d-6e7f8a9b0c1d";
const ITEM = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const BLOB = "9b2e4c1a-7d3f-4e8b-a6c5-1f0e2d3c4b5a";

/** Ordinary, Unicode, disguised and edge-case names (incl. every name W0.5a's review added). */
const NAMES: readonly string[] = [
  "Q3 report.xlsx", "报告.pdf", "Café menu.JPG", ".env", "_thumb", "a.b.tar.gz", "x.", "README", "...", ".", "..", "",
  "  padded  .txt ", "a/b.txt", "a\\b.txt", "photo.jp g", "menu.pdf", "exe.pdf", "photo.img.jpg", "invoice.pdf.exe",
  "setup.exe", "SETUP.EXE", "setup.exe~", "setup.exe-", "setup.exe​", "run.bat)", "invoice.pdf.apk#", "x.ps1·",
  "evil.lnk⁠", `${"a".repeat(76)}.exezzzz~`, "setup.exe.", "setup.exe . .", ".apk", "a\u007fb",
  "e‎́x.txt", "A\u0000̊.txt", "ᄀ‏ᅡ.txt", "invoice‮exe.pdf", "‪tricky‬.png",
  "tab\tname.txt", "new\nline.txt", "C1\u0085ctl.txt", "arabic؜mark.txt", "⁦iso⁩.doc",
  `${"b".repeat(300)}.pdf`, `${"c".repeat(255)}`, `${"c".repeat(256)}`, "\u{1F468}‍\u{1F469}‍\u{1F467}.jpg",
  "Ünïcödé Nämé.docx", "café.txt", "ﬁle.txt", "Ｆｕｌｌ.pdf", "file.tar.gz.", "file.TXT", "data.JSON  ",
];
const MIMES: readonly string[] = [
  "application/pdf", "APPLICATION/PDF", "text/plain; charset=utf-8", "image/svg+xml", "text/html", "", "garbage",
  "application/x-msdownload", "application/vnd.android.package-archive", "application/octet-stream",
  "application/rss+xml", "application/atom+xml", "application/vnd.wap.xhtml+xml", "application/x+xml",
  "application/xml-dtd", "application/ld+json", "image/webp", "video/mp4", "Text/JavaScript", "ä/b", `a/${"b".repeat(200)}`,
];

/** Names that exercise stripping between a base letter and a combining mark (the case that needs the second NFC). */
function generatedNames(): string[] {
  const out: string[] = [];
  const stripped = ["\u0000", "\u001f", "\u007f", "\u0085", "\u009f", "؜", "‎", "‏", "‪", "‮", "⁦", "⁩"];
  const marks = ["́", "̈", "̊", "̧", "̣", "ᅡ"];
  for (const base of ["e", "A", "o", "ᄀ", "c"]) {
    for (const cut of stripped) for (const mark of marks) out.push(`${base}${cut}${mark}x.txt`);
  }
  return out;
}

describe("constants", () => {
  const MICROS_PER_MS = 1000n;
  test("names, limits and sizes", () => {
    expect([...client.DRIVE_SPACES]).toEqual([...server.DRIVE_SPACES]);
    expect([...client.DRIVE_KINDS]).toEqual([...server.DRIVE_KINDS]);
    expect([...client.DRIVE_SURFACES]).toEqual([...server.DRIVE_SURFACES]);
    expect(client.DRIVE_NAME_MAX).toBe(server.DRIVE_NAME_MAX);
    expect(client.DRIVE_MIME_MAX).toBe(server.DRIVE_MIME_MAX);
    expect(client.DRIVE_MAX_FILE_BYTES).toBe(Number(server.DRIVE_MAX_FILE_BYTES));
    expect(client.DRIVE_THUMB_MAX_BYTES).toBe(Number(server.DRIVE_THUMB_MAX_BYTES));
    expect([...client.DRIVE_THUMB_TYPES]).toEqual([...server.DRIVE_THUMB_TYPES]);
    expect(client.DRIVE_THUMB_LEAF).toBe(server.DRIVE_THUMB_LEAF);
    expect(client.DRIVE_DEFAULT_QUOTA_BYTES).toBe(Number(server.DRIVE_DEFAULT_QUOTA_BYTES));
    expect(client.DRIVE_UPLOAD_MAX_ATTEMPTS).toBe(server.DRIVE_UPLOAD_MAX_ATTEMPTS);
    expect(client.DRIVE_MAX_PENDING_PER_UPLOADER).toBe(server.DRIVE_MAX_PENDING_PER_UPLOADER);
    expect(client.DRIVE_MAX_RESERVED_PER_UPLOADER_BYTES).toBe(Number(server.DRIVE_MAX_RESERVED_PER_UPLOADER_BYTES));
    expect(client.DRIVE_MAX_ITEMS_PER_ORG).toBe(server.DRIVE_MAX_ITEMS_PER_ORG);
    expect(client.DRIVE_MAX_BATCH).toBe(server.DRIVE_MAX_BATCH);
    expect(client.DRIVE_MAX_SUBTREE).toBe(server.DRIVE_MAX_SUBTREE);
    expect(client.DRIVE_MAX_DEPTH).toBe(server.DRIVE_MAX_DEPTH);
    expect(client.DRIVE_SERVICE_SCOPE).toBe(server.DRIVE_SERVICE_SCOPE);
  });

  test("durations (µs on the module, ms on the client)", () => {
    expect(BigInt(client.DRIVE_UPLOAD_TTL_MS) * MICROS_PER_MS).toBe(server.DRIVE_UPLOAD_TTL_MICROS);
    expect(BigInt(client.DRIVE_TRASH_RETENTION_MS) * MICROS_PER_MS).toBe(server.DRIVE_TRASH_RETENTION_MICROS);
  });

  test("user decisions U1/U10 on both sides", () => {
    expect(server.DRIVE_MAX_FILE_BYTES).toBe(1_073_741_824n);
    expect(server.DRIVE_DEFAULT_QUOTA_BYTES).toBe(10_737_418_240n);
    expect(server.DRIVE_MAX_RESERVED_PER_UPLOADER_BYTES).toBe(2n * server.DRIVE_MAX_FILE_BYTES);
  });

  test("block lists, active types and the key grammar", () => {
    expect([...client.DRIVE_BLOCKED_EXTENSIONS]).toEqual([...server.DRIVE_BLOCKED_EXTENSIONS]);
    expect([...client.DRIVE_BLOCKED_MIME_TYPES]).toEqual([...server.DRIVE_BLOCKED_MIME_TYPES]);
    expect([...client.DRIVE_ACTIVE_MIME_TYPES]).toEqual([...server.DRIVE_ACTIVE_MIME_TYPES]);
    expect(client.DRIVE_BLOB_KEY_RE.source).toBe(server.DRIVE_BLOB_KEY_RE.source);
    expect(client.DRIVE_BLOB_KEY_RE.flags).toBe(server.DRIVE_BLOB_KEY_RE.flags);
  });
});

describe("helpers agree over the corpus", () => {
  const names = [...NAMES, ...generatedNames()];

  test("cleanDriveName", () => {
    for (const name of names) expect({ name, out: client.cleanDriveName(name) }).toEqual({ name, out: server.cleanDriveName(name) });
  });

  test("the module's cleanDriveName is idempotent and returns NFC", () => {
    for (const name of names) {
      const once = server.cleanDriveName(name);
      if (once === null) continue;
      expect({ name, twice: server.cleanDriveName(once) }).toEqual({ name, twice: once });
      expect({ name, nfc: once.normalize("NFC") }).toEqual({ name, nfc: once });
    }
  });

  test("driveExtension, asciiFileName, driveBlobKey on cleaned and raw names", () => {
    for (const name of names) {
      expect({ name, ext: client.driveExtension(name) }).toEqual({ name, ext: server.driveExtension(name) });
      const cleaned = server.cleanDriveName(name);
      if (cleaned === null) continue;
      expect({ name, leaf: client.asciiFileName(cleaned) }).toEqual({ name, leaf: server.asciiFileName(cleaned) });
      const key = server.driveBlobKey(ORG, ITEM, BLOB, cleaned);
      expect(client.driveBlobKey(ORG, ITEM, BLOB, cleaned)).toBe(key);
      expect(client.parseDriveBlobKey(key)).toEqual(server.parseDriveBlobKey(key));
      expect(server.parseDriveBlobKey(key)).not.toBeNull();
      expect(client.driveThumbKeyFor(key)).toBe(server.driveThumbKeyFor(key));
    }
  });

  test("isBlockedDriveFile over names × types", () => {
    for (const name of names) {
      const cleaned = server.cleanDriveName(name) ?? name;
      for (const mime of MIMES) {
        expect({ name, mime, blocked: client.isBlockedDriveFile(cleaned, mime) })
          .toEqual({ name, mime, blocked: server.isBlockedDriveFile(cleaned, mime) });
      }
    }
  });

  test("every name that passes stores a leaf with no blocked extension (both sides)", () => {
    for (const name of names) {
      const cleaned = server.cleanDriveName(name);
      if (cleaned === null || server.isBlockedDriveFile(cleaned, "application/octet-stream")) continue;
      const leafExt = server.driveExtension(server.asciiFileName(cleaned));
      expect({ name, blocked: server.DRIVE_BLOCKED_EXTENSIONS.includes(leafExt) }).toEqual({ name, blocked: false });
    }
  });

  test("normalizeDriveMime and isActiveDriveMime", () => {
    for (const mime of MIMES) {
      expect({ mime, n: client.normalizeDriveMime(mime) }).toEqual({ mime, n: server.normalizeDriveMime(mime) });
      expect({ mime, a: client.isActiveDriveMime(mime) }).toEqual({ mime, a: server.isActiveDriveMime(mime) });
    }
    for (const active of ["application/rss+xml", "application/x+xml", "image/svg+xml", "text/html"]) {
      expect(server.isActiveDriveMime(active)).toBe(true);
    }
    for (const inert of ["application/xml-dtd", "application/ld+json", "application/pdf"]) {
      expect(server.isActiveDriveMime(inert)).toBe(false);
    }
  });

  test("parseDriveBlobKey and driveThumbKeyFor on valid and invalid keys", () => {
    const valid = client.driveBlobKey(ORG, ITEM, BLOB, "Q3 report.xlsx");
    const keys = [
      valid, client.driveThumbKeyFor(valid), "", "not/a/key", valid.toUpperCase(), valid.replace("org/", "org//"),
      `org/${ORG}/${ITEM}/${BLOB}/.hidden`, `org/${ORG}/${ITEM}/${BLOB}/_other`, `org/${ORG}/${ITEM}/${BLOB}/报告.pdf`,
      `org/${ORG}/${ITEM.replace("-41d3-", "-11d3-")}/${BLOB}/a.pdf`, `org/${ORG}/${ITEM}/${BLOB}/${"a".repeat(101)}`,
      `${valid}\n`, `org/${ORG}/${ITEM}/${BLOB}`,
    ];
    for (const key of keys) {
      expect({ key, parts: client.parseDriveBlobKey(key) }).toEqual({ key, parts: server.parseDriveBlobKey(key) });
      expect({ key, thumb: client.driveThumbKeyFor(key) }).toEqual({ key, thumb: server.driveThumbKeyFor(key) });
    }
    expect(server.driveThumbKeyFor("")).toBe("");
    expect(server.driveThumbKeyFor("not/a/key")).toBe("");
    expect(server.parseDriveBlobKey(client.driveThumbKeyFor(valid))?.isThumb).toBe(true);
  });

  test("isDriveSpace", () => {
    for (const value of ["my", "store", "", "My", "shared", "store "]) {
      expect(client.isDriveSpace(value)).toBe(server.isDriveSpace(value));
    }
  });
});
