// The .docx package reader (lib/docs/import/docx/zip.ts) under its inflation limits.
//
// Drive's "Open as Doc" feeds it files other people uploaded, so a zip bomb must be refused before it is inflated
// (declared sizes) or while it is (an entry may not inflate past what it declared), never allowed to exhaust memory.
// Packages are built with fflate and, for the lying cases, their central directory is patched afterwards.
import { describe, expect, test } from "bun:test";
import { zipSync, type Zippable } from "fflate";

import { docxToHtml } from "@/lib/docs/import/docx/index";
import { DOCX_ZIP_LIMITS, DocxZipError, openDocxZip, type DocxZipLimits } from "@/lib/docs/import/docx/zip";
import { importFile } from "@/lib/docs/import";

const encoder = new TextEncoder();
const MIB = 1024 * 1024;

function zip(files: Zippable, level: 0 | 9 = 9): Uint8Array<ArrayBuffer> {
  return new Uint8Array(zipSync(files, { level }));
}

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Offsets of every central directory header. */
function centralHeaders(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: number[] = [];
  for (let i = 0; i + 4 <= bytes.length; i++) if (view.getUint32(i, true) === 0x02014b50) out.push(i);
  return out;
}

/** Rewrites the uncompressed size the central directory declares for every entry. */
function declareSize(bytes: Uint8Array, size: number): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes);
  const view = new DataView(copy.buffer);
  for (const at of centralHeaders(copy)) view.setUint32(at + 24, size, true);
  return copy;
}

async function refusal(bytes: Uint8Array, limits?: DocxZipLimits): Promise<string> {
  try {
    await openDocxZip(bufferOf(bytes), limits);
  } catch (err) {
    if (err instanceof DocxZipError) return err.code;
    throw err;
  }
  return "opened";
}

const SMALL: DocxZipLimits = { maxEntries: 10, maxInflatedBytes: MIB, maxRatio: 100, ratioMinBytes: 256 * 1024 };

describe("openDocxZip", () => {
  test("reads an honest package: stored and deflated parts, case-insensitive paths", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const bytes = zip({
      "[Content_Types].xml": encoder.encode("<Types/>"),
      "word/document.xml": encoder.encode("<w:document>héllo</w:document>"),
      "Word/Media/image1.png": [png, { level: 0 }],
      "docProps/": new Uint8Array(0),
    });
    const pkg = await openDocxZip(bufferOf(bytes));
    expect([...pkg.paths].sort()).toEqual(["Word/Media/image1.png", "[Content_Types].xml", "word/document.xml"]);
    expect(pkg.text("/WORD/document.xml")).toBe("<w:document>héllo</w:document>");
    expect(pkg.has("word/media/image1.png")).toBe(true);
    expect([...(pkg.bytes("word\\media\\image1.png") ?? [])]).toEqual([...png]);
    expect(pkg.text("word/styles.xml")).toBeNull();
  });

  test("the default limits bound the inflated total at 200 MiB", () => {
    expect(DOCX_ZIP_LIMITS.maxInflatedBytes).toBe(200 * MIB);
  });

  test("a package declaring more than the cap is refused before anything is inflated", async () => {
    // Six 200 KiB zero parts, each under the ratio rule: 1.2 MiB declared against a 1 MiB cap (the shape of the
    // 4 × 64 MiB bomb, scaled down).
    const zeros = new Uint8Array(200 * 1024);
    const bomb = zip({ "a.xml": zeros, "b.xml": zeros, "c.xml": zeros, "d.xml": zeros, "e.xml": zeros, "f.xml": zeros });
    expect(await refusal(bomb, SMALL)).toBe("tooLarge");
    // At the default limits: 40 parts declaring 8 MiB each (each within the ratio rule) are 320 MiB, refused as fast
    // as the directory reads, since nothing is allocated.
    const parts: Zippable = {};
    for (let i = 0; i < 40; i++) parts[`word/media/image${i}.png`] = encoder.encode(`part ${i}`);
    const started = performance.now();
    expect(await refusal(declareSize(zip(parts), 8 * MIB))).toBe("tooLarge");
    expect(performance.now() - started).toBeLessThan(1000);
  });

  test("the reported bomb (four parts declaring 64 MiB each) is refused before inflating", async () => {
    const zeros = encoder.encode("0");
    const bomb = declareSize(zip({ "a.xml": zeros, "b.xml": zeros, "c.xml": zeros, "d.xml": zeros }), 64 * MIB);
    expect(await refusal(bomb)).toBe("suspiciousRatio");
  });

  test("one part with an absurd declared ratio is refused", async () => {
    const zeros = new Uint8Array(300 * 1024); // deflates about 1000:1
    expect(await refusal(zip({ "word/document.xml": zeros }), SMALL)).toBe("suspiciousRatio");
  });

  test("a part that inflates past its declared size is refused, not truncated or grown", async () => {
    // Declares 64 bytes, holds 256 KiB: the streamed output passes the declared size and inflation stops.
    const liar = declareSize(zip({ "word/document.xml": new Uint8Array(256 * 1024) }), 64);
    expect(await refusal(liar)).toBe("suspiciousRatio");
  });

  test("too many entries, a non-zip, an encrypted entry and a broken stream are refused", async () => {
    const many: Zippable = {};
    for (let i = 0; i < 12; i++) many[`word/part${i}.xml`] = encoder.encode(`<p>${i}</p>`);
    expect(await refusal(zip(many), SMALL)).toBe("tooManyEntries");

    expect(await refusal(encoder.encode("not a zip at all"))).toBe("notZip");

    const encrypted = zip({ "word/document.xml": encoder.encode("<w:document/>") });
    const view = new DataView(encrypted.buffer);
    for (const at of centralHeaders(encrypted)) view.setUint16(at + 8, view.getUint16(at + 8, true) | 1, true);
    expect(await refusal(encrypted)).toBe("notZip");

    // The first entry's data follows its local header (30 bytes, then the name and the extra field).
    const broken = zip({ "word/document.xml": encoder.encode("<w:document>".repeat(200)) });
    const local = new DataView(broken.buffer);
    const data = 30 + local.getUint16(26, true) + local.getUint16(28, true);
    broken.fill(0xff, data, data + 16);
    expect(await refusal(broken)).toBe("corrupt");
  });
});

describe("the importer reports a refused package as a failed import", () => {
  const bomb = declareSize(zip({ "word/document.xml": encoder.encode("<w:document/>") }), 300 * MIB);

  test("docxToHtml rejects with the zip refusal", async () => {
    await expect(docxToHtml(bufferOf(bomb), async () => "https://x")).rejects.toBeInstanceOf(DocxZipError);
  });

  test("importFile turns it into DocImportError('failed')", async () => {
    const file = new File([bomb], "Schedule.docx");
    const deps = { t: (key: string) => key, locale: "en", uploadImage: async () => "https://x" };
    let caught: unknown = null;
    try {
      await importFile(file, deps);
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ name: "DocImportError", code: "failed" });
    expect((caught as { cause?: unknown }).cause).toBeInstanceOf(DocxZipError);
  });
});
