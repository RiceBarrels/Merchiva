// ZIP-bomb preflight and the parse pipeline of the .pptx import (lib/slides/import/{zip-directory,zip-guard,
// slide-scan,pipeline,parse}.ts; slides.md §10.1 step 2, F28). Archives are built in-test with fflate's zipSync and,
// where a header has to lie, patched in place. The directory reader is checked against JSZip (what pptxtojson opens
// files with), so the guard bounds the bytes the parser would really inflate.
import { describe, expect, test } from "bun:test";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import JSZip from "jszip";
import pptxgen from "pptxgenjs";

import { SlidesImportError } from "@/lib/slides/import/errors";
import { parsePptx } from "@/lib/slides/import/parse";
import { runParsePipeline } from "@/lib/slides/import/pipeline";
import { partNumber, scanSlideXml, scanSlides, slidePartNames } from "@/lib/slides/import/slide-scan";
import { readZipDirectory } from "@/lib/slides/import/zip-directory";
import { ZIP_LIMITS, checkZipDirectory, checkZipInflation } from "@/lib/slides/import/zip-guard";

const MiB = 1024 * 1024;
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function zip(files: Zippable): Uint8Array {
  return zipSync(files);
}

/** Offset of the n-th central directory header (walked from the end-of-central-directory record). */
function centralHeader(bytes: Uint8Array, n = 0): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("no end of central directory");
  let at = view.getUint32(eocd + 16, true);
  for (let i = 0; i < n; i++) at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  if (view.getUint32(at, true) !== 0x02014b50) throw new Error("no such central header");
  return at;
}

function patchU32(bytes: Uint8Array, at: number, value: number): Uint8Array {
  const out = bytes.slice();
  new DataView(out.buffer).setUint32(at, value, true);
  return out;
}

/** The archive with entry n's declared uncompressed size in the central directory replaced. */
function declareOriginalSize(bytes: Uint8Array, value: number, n = 0): Uint8Array {
  return patchU32(bytes, centralHeader(bytes, n) + 24, value);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  parts.reduce((at, part) => (out.set(part, at), at + part.length), 0);
  return out;
}

/** A ZIP64 extra field (0x0001) carrying both sizes; `declaredLength` may lie about its 16-byte body. */
function zip64Field(originalSize: number, compressedSize: number, declaredLength = 16): Uint8Array {
  const out = new Uint8Array(20);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0x0001, true);
  view.setUint16(2, declaredLength, true);
  view.setBigUint64(4, BigInt(originalSize), true);
  view.setBigUint64(12, BigInt(compressedSize), true);
  return out;
}

/** A one-entry fflate archive whose central header says 0xFFFFFFFF for both sizes and carries `extra` instead. */
function withCentralExtra(honest: Uint8Array, extra: Uint8Array): Uint8Array {
  const view = new DataView(honest.buffer, honest.byteOffset, honest.byteLength);
  const at = centralHeader(honest);
  const eocd = honest.length - 22;
  const head = honest.slice(at, at + 46 + view.getUint16(at + 28, true));
  if (view.getUint32(eocd, true) !== 0x06054b50 || eocd - at !== head.length) throw new Error("expected one plain entry");
  const hv = new DataView(head.buffer);
  for (const at of [20, 24]) hv.setUint32(at, 0xffffffff, true);
  hv.setUint16(30, extra.length, true);
  const end = honest.slice(eocd);
  new DataView(end.buffer).setUint32(12, head.length + extra.length, true);
  return concat([honest.subarray(0, at), head, extra, end]);
}

/** The sizes of the only entry, as the central directory states them. */
function realSizes(honest: Uint8Array): { originalSize: number; compressedSize: number } {
  const at = centralHeader(honest);
  const view = new DataView(honest.buffer, honest.byteOffset + at, 28);
  return { originalSize: view.getUint32(24, true), compressedSize: view.getUint32(20, true) };
}

/**
 * The archive with ZIP64 end records (record + locator) before its end of central directory, which then points at
 * them. `locatorOffset` overrides where the locator says the record is; `extensible` is appended to the record.
 */
function withZip64End(honest: Uint8Array, options: { locatorOffset?: bigint; extensible?: Uint8Array } = {}): Uint8Array {
  const view = new DataView(honest.buffer, honest.byteOffset, honest.byteLength);
  const eocd = honest.length - 22;
  const ext = options.extensible ?? new Uint8Array(0);
  const record = new Uint8Array(56 + ext.length);
  const rv = new DataView(record.buffer);
  rv.setUint32(0, 0x06064b50, true);
  rv.setBigUint64(4, BigInt(44 + ext.length), true);
  rv.setBigUint64(24, BigInt(view.getUint16(eocd + 8, true)), true);
  rv.setBigUint64(32, BigInt(view.getUint16(eocd + 10, true)), true);
  rv.setBigUint64(40, BigInt(view.getUint32(eocd + 12, true)), true);
  rv.setBigUint64(48, BigInt(view.getUint32(eocd + 16, true)), true);
  record.set(ext, 56);
  const locator = new Uint8Array(20);
  const lv = new DataView(locator.buffer);
  lv.setUint32(0, 0x07064b50, true);
  lv.setBigUint64(8, options.locatorOffset ?? BigInt(eocd), true);
  lv.setUint32(16, 1, true);
  const end = honest.slice(eocd);
  new DataView(end.buffer).setUint32(16, 0xffffffff, true);
  return concat([honest.subarray(0, eocd), record, locator, end]);
}

async function deck(patch?: (files: Record<string, Uint8Array>) => void): Promise<ArrayBuffer> {
  const pres = new pptxgen();
  const s1 = pres.addSlide();
  s1.addText("Hello", { x: 1, y: 1, w: 4, h: 1 });
  s1.addImage({ data: `image/png;base64,${PNG}`, x: 5, y: 1, w: 1, h: 1 });
  const s2 = pres.addSlide();
  s2.addChart(pres.ChartType.bar, [{ name: "S", labels: ["a", "b"], values: [1, 2] }], { x: 1, y: 1, w: 4, h: 3 });
  s2.addImage({ data: `image/png;base64,${PNG}`, x: 5, y: 1, w: 1, h: 1 });
  const buf = (await pres.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  if (!patch) return buf;
  const files = unzipSync(new Uint8Array(buf));
  patch(files);
  const out = zipSync(files);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

describe("checkZipDirectory / checkZipInflation", () => {
  test("a normal deck passes both, embedded chart workbook (an inner archive) included", async () => {
    const bytes = new Uint8Array(await deck());
    expect(Object.keys(unzipSync(bytes)).some((name) => name.endsWith(".xlsx"))).toBe(true);
    expect(checkZipDirectory(bytes)).toBeNull();
    expect(await checkZipInflation(bytes)).toBeNull();
  });

  test("5,001 entries → tooManyEntries", () => {
    const files: Zippable = {};
    for (let i = 0; i <= ZIP_LIMITS.maxEntries; i++) files[`f${i}.txt`] = strToU8("x");
    expect(checkZipDirectory(zip(files))).toBe("tooManyEntries");
  });

  test("a declared total over the cap → tooLargeUncompressed (nothing inflated)", () => {
    const honest = zip({ "a.xml": strToU8("<a/>".repeat(250)) });
    expect(checkZipDirectory(declareOriginalSize(honest, 500 * MiB))).toBe("tooLargeUncompressed");
  });

  test("a 20 MiB zero-filled entry (ratio far above 100:1) → suspiciousRatio", () => {
    const bomb = zip({ "zeros.bin": new Uint8Array(20 * MiB) });
    expect(bomb.length).toBeLessThan(200 * 1024);
    expect(checkZipDirectory(bomb)).toBe("suspiciousRatio");
  });

  test("a central directory that under-declares originalSize passes the directory check, not the inflation check", async () => {
    const lying = declareOriginalSize(zip({ "zeros.bin": new Uint8Array(20 * MiB) }), 1000);
    expect(checkZipDirectory(lying)).toBeNull();
    expect(await checkZipInflation(lying)).toBe("suspiciousRatio");
  });

  test("an entry that inflates past its declared size is refused even under the ratio threshold", async () => {
    const lying = declareOriginalSize(zip({ "a.bin": new Uint8Array(1 * MiB) }), 10);
    expect(checkZipDirectory(lying)).toBeNull();
    expect(await checkZipInflation(lying)).toBe("suspiciousRatio");
  });

  test("non-ZIP bytes → notZip", async () => {
    expect(checkZipDirectory(strToU8("definitely not a zip"))).toBe("notZip");
    expect(checkZipDirectory(new Uint8Array(0))).toBe("notZip");
    expect(await checkZipInflation(strToU8("PK\u0003\u0004 truncated"))).toBe("notZip");
  });

  test("an entry whose data runs past the end of the file → notZip", () => {
    const honest = zip({ "a.xml": strToU8("<a/>") });
    expect(checkZipDirectory(patchU32(honest, centralHeader(honest) + 20, 10_000))).toBe("notZip");
  });

  test("a nested zip bomb inside the package → refused by the inflation check", async () => {
    const inner = zip({ "zeros.bin": new Uint8Array(20 * MiB) });
    const outer = zip({ "[Content_Types].xml": strToU8("<Types/>"), "ppt/embeddings/bomb.zip": inner });
    expect(checkZipDirectory(outer)).toBeNull();
    expect(await checkZipInflation(outer)).toBe("suspiciousRatio");
  });

  test("archives nested past two levels (42.zip style) → refused; two levels pass", async () => {
    const z0 = zip({ "a.txt": strToU8("hello") });
    const z1 = zip({ "z0.zip": z0 });
    const z2 = zip({ "z1.zip": z1 });
    const z3 = zip({ "z2.zip": z2 });
    expect(await checkZipInflation(z2)).toBeNull();
    expect(checkZipDirectory(z3)).toBeNull();
    expect(await checkZipInflation(z3)).toBe("suspiciousRatio");
  });

  test("inner archives count toward the same total", async () => {
    const limits = { ...ZIP_LIMITS, maxTotalUncompressed: 2_000 };
    const inner = zip({ "a.txt": new Uint8Array(1_200).fill(65) });
    const outer = zip({ "inner.zip": inner, "b.txt": new Uint8Array(1_200).fill(66) });
    expect(checkZipDirectory(outer, limits)).toBeNull();
    expect(checkZipDirectory(inner, limits)).toBeNull();
    expect(await checkZipInflation(outer, limits)).toBe("tooLargeUncompressed");
  });

  test("a broken deflate stream is bounded by what it produced, not refused", async () => {
    const honest = zip({ "a.xml": strToU8("<a>".repeat(5000)) });
    const dir = readZipDirectory(honest, 10);
    if (typeof dir === "string") throw new Error(dir);
    const broken = honest.slice();
    broken.fill(0xff, dir.entries[0].dataOffset, dir.entries[0].dataOffset + 8);
    expect(await checkZipInflation(broken)).toBeNull();
  });
});

describe("readZipDirectory (JSZip's view)", () => {
  async function jszipNames(bytes: Uint8Array): Promise<string[]> {
    const loaded = await JSZip.loadAsync(bytes);
    return Object.keys(loaded.files).filter((name) => !loaded.files[name].dir).sort();
  }

  test("reads the same entries as JSZip, bytes prepended to the archive included", async () => {
    const bytes = new Uint8Array(await deck());
    const prepended = new Uint8Array(bytes.length + 777);
    prepended.set(strToU8("#!/bin/sh self-extractor stub"), 0);
    prepended.set(bytes, 777);
    for (const archive of [bytes, prepended]) {
      const dir = readZipDirectory(archive, 5000);
      if (typeof dir === "string") throw new Error(dir);
      const names = dir.entries.map((e) => e.name).filter((n) => !n.endsWith("/")).sort();
      expect(names).toEqual(await jszipNames(archive));
    }
    expect(checkZipDirectory(prepended)).toBeNull();
    expect(await checkZipInflation(prepended)).toBeNull();
  });

  test("sizes in a ZIP64 extra field are read like JSZip; a 4-byte tail is not a field (JSZip's bound)", async () => {
    const small = zip({ "a.xml": strToU8("<a/>".repeat(100)) });
    const small64 = withCentralExtra(small, zip64Field(realSizes(small).originalSize, realSizes(small).compressedSize));
    const dir = readZipDirectory(small64, 10);
    if (typeof dir === "string") throw new Error(dir);
    expect(dir.entries[0]).toMatchObject(realSizes(small));
    expect(await jszipNames(small64)).toEqual(["a.xml"]);
    expect(checkZipDirectory(small64)).toBeNull();
    expect(await checkZipInflation(small64)).toBeNull();

    const bomb = zip({ "zeros.bin": new Uint8Array(20 * MiB) });
    const { originalSize, compressedSize } = realSizes(bomb);
    expect(checkZipDirectory(withCentralExtra(bomb, zip64Field(originalSize, compressedSize)))).toBe("suspiciousRatio");
    const tail = concat([zip64Field(originalSize, compressedSize), zip64Field(0, 0, 0).subarray(0, 4)]);
    expect(checkZipDirectory(withCentralExtra(bomb, tail))).toBe("suspiciousRatio");
  });

  test("a second ZIP64 extra field (JSZip uses the last one) → notZip, not a bomb that passes", async () => {
    const bomb = zip({ "zeros.bin": new Uint8Array(20 * MiB) });
    const { originalSize, compressedSize } = realSizes(bomb);
    // The first field declares a small, harmless entry; JSZip inflates what the second one says.
    const crafted = withCentralExtra(bomb, concat([zip64Field(4 * MiB, 16), zip64Field(originalSize, compressedSize)]));
    const loaded = await JSZip.loadAsync(crafted);
    expect((await loaded.file("zeros.bin")!.async("uint8array")).length).toBe(20 * MiB);
    expect(checkZipDirectory(crafted)).toBe("notZip");
    expect(await checkZipInflation(crafted)).toBe("notZip");
    const result = await runParsePipeline(crafted.buffer.slice(crafted.byteOffset, crafted.byteOffset + crafted.byteLength) as ArrayBuffer);
    expect(result).toEqual({ type: "rejected", code: "notZip" });
  });

  test("a ZIP64 extra field whose length runs past the extra region → notZip", () => {
    const bomb = zip({ "zeros.bin": new Uint8Array(20 * MiB) });
    const { originalSize, compressedSize } = realSizes(bomb);
    expect(checkZipDirectory(withCentralExtra(bomb, zip64Field(originalSize, compressedSize, 24)))).toBe("notZip");
  });

  test("ZIP64 end records are read like JSZip", async () => {
    const honest = withZip64End(zip({ "a.xml": strToU8("<a/>"), "b.xml": strToU8("<b/>") }));
    expect(await jszipNames(honest)).toEqual(["a.xml", "b.xml"]);
    const dir = readZipDirectory(honest, 10);
    if (typeof dir === "string") throw new Error(dir);
    expect(dir.entries.map((e) => e.name)).toEqual(["a.xml", "b.xml"]);
    expect(checkZipDirectory(honest)).toBeNull();
  });

  test("a ZIP64 locator offset JSZip reads differently (32-bit wrap) or cannot read → notZip", async () => {
    const plain = zip({ "a.xml": strToU8("<a/>") });
    const recordAt = BigInt(plain.length - 22);
    // 2^32 + the real offset: JSZip's readInt wraps it back onto the record, so this reader must not search instead.
    const wrapped = withZip64End(plain, { locatorOffset: 2n ** 32n + recordAt });
    expect(await jszipNames(wrapped)).toEqual(["a.xml"]);
    expect(checkZipDirectory(wrapped)).toBe("notZip");
    const pastEnd = withZip64End(plain, { locatorOffset: BigInt(plain.length + 76) });
    expect(await JSZip.loadAsync(pastEnd).then(() => "loaded", () => "refused")).toBe("refused");
    expect(checkZipDirectory(pastEnd)).toBe("notZip");
  });

  test("a ZIP64 end record with extensible data (JSZip's loop never advances) → notZip", async () => {
    const plain = zip({ "a.xml": strToU8("<a/>") });
    const benign = withZip64End(plain, { extensible: new Uint8Array(6) });
    expect(await JSZip.loadAsync(benign).then(() => "loaded", () => "refused")).toBe("refused");
    expect(checkZipDirectory(benign)).toBe("notZip");
    // A length of -6 sends JSZip back to the same field forever (not run here: it never returns).
    const spin = withZip64End(plain, { extensible: new Uint8Array([0, 0, 0xfa, 0xff, 0xff, 0xff]) });
    expect(checkZipDirectory(spin)).toBe("notZip");
    expect(await checkZipInflation(spin)).toBe("notZip");
  });
});

describe("slide scan", () => {
  test("slide parts in pptxtojson's order (by number, not by listing order)", () => {
    const types = `<Types><Override PartName="/ppt/slides/slide10.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
      + `<Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
      + `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/></Types>`;
    expect(slidePartNames(types)).toEqual(["ppt/slides/slide2.xml", "ppt/slides/slide10.xml"]);
  });

  test("hidden and animated flags", () => {
    expect(scanSlideXml(`<p:sld show="0"><p:cSld/></p:sld>`)).toEqual({ hidden: true, animated: false });
    const timing = `<p:timing><p:tnLst><p:par><p:cTn id="1"><p:childTnLst><p:par><p:cTn presetClass="entr"><p:childTnLst><p:set/></p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>`;
    expect(scanSlideXml(`<p:sld><p:cSld/>${timing}</p:sld>`)).toEqual({ hidden: false, animated: true });
    // An empty timing root (PowerPoint writes one) is not an animation.
    expect(scanSlideXml(`<p:sld><p:timing><p:tnLst><p:par><p:cTn id="1" nodeType="tmRoot"/></p:par></p:tnLst></p:timing></p:sld>`).animated).toBe(false);
  });

  test("tags are read like /<name\\b[^>]*>/: first root tag, prefixes on Override, part numbers", () => {
    expect(scanSlideXml(`<p:sldX show="0"><p:sld\nshow='0'>`).hidden).toBe(true);
    expect(scanSlideXml(`<p:sldLayout show="0"/><p:sld><p:cSld/></p:sld>`).hidden).toBe(false);
    expect(scanSlideXml(`<p:sld show="0"`).hidden).toBe(false);
    const type = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
    const types = `<ct:Types><ct:Override PartName="/ppt/slides/slide3.xml" ContentType="${type}"/><Overrides PartName="/ppt/slides/slide1.xml" ContentType="${type}"/>`
      + `<Override PartName="/ppt/slides/slide.xml" ContentType="${type}"/><Override ContentType="${type}" PartName="/ppt/slides/slide2.xml"/>`;
    expect(slidePartNames(types)).toEqual(["ppt/slides/slide2.xml", "ppt/slides/slide3.xml"]);
    expect([partNumber("/ppt/slides/slide12.xml"), partNumber("slide.xml"), partNumber("12.xml"), partNumber("slide12.xmlx")]).toEqual([12, null, 12, null]);
  });

  test("linear on parts crafted to backtrack (a 14 KB file whose slide part took 10 s to scan)", async () => {
    const huge = 2_000_000;
    const timed = (run: () => unknown) => {
      const start = performance.now();
      const value = run();
      return { value, ms: performance.now() - start };
    };
    const root = timed(() => scanSlideXml("<p:sld ".repeat(huge / 7)));
    expect(root.value).toEqual({ hidden: false, animated: false });
    expect(root.ms).toBeLessThan(1_000);
    const overrides = timed(() => slidePartNames("<Override ".repeat(huge / 10)));
    expect(overrides.value).toEqual([]);
    expect(overrides.ms).toBeLessThan(1_000);
    const digits = "1".repeat(huge);
    const longName = timed(() => slidePartNames(`<Override PartName="/ppt/slides/slide${digits}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`));
    expect(longName.value).toEqual([`ppt/slides/slide${digits}.xml`]);
    expect(longName.ms).toBeLessThan(1_000);
    // End to end: the zip guard accepts the part (it compresses far under the ratio rule's size floor).
    const buf = await deck((files) => {
      files["ppt/slides/slide1.xml"] = strToU8("<p:sld ".repeat(300_000));
    });
    const bytes = new Uint8Array(buf);
    expect(checkZipDirectory(bytes) ?? (await checkZipInflation(bytes))).toBeNull();
    const scan = timed(() => scanSlides(bytes));
    expect(scan.value).toEqual({ hidden: [false, false], animated: [false, false] });
    expect(scan.ms).toBeLessThan(1_000);
  });
});

describe("runParsePipeline", () => {
  test("parses a deck: lean result with asset references, one asset per distinct image, a scan per slide", async () => {
    const buf = await deck((files) => {
      const slide2 = strFromU8(files["ppt/slides/slide2.xml"]);
      files["ppt/slides/slide2.xml"] = strToU8(
        slide2.replace("<p:sld ", '<p:sld show="0" ').replace("</p:sld>", '<p:timing><p:tnLst><p:par><p:cTn id="1"><p:childTnLst><p:anim/></p:childTnLst></p:cTn></p:par></p:tnLst></p:timing></p:sld>'),
      );
    });
    const result = await runParsePipeline(buf);
    if (result.type !== "parsed") throw new Error(result.code);
    expect(result.lean.slides).toHaveLength(2);
    expect(result.scan).toEqual({ hidden: [false, true], animated: [false, true] });
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0].mime).toBe("image/png");
    const json = JSON.stringify(result.lean);
    expect(json).not.toContain("base64,");
    expect(json.match(/"asset:a1"/g)).toHaveLength(2);
  });

  test("stops at a stage boundary when the checkpoint throws (the main-thread fallback's deadline and abort)", async () => {
    const buf = await deck();
    let calls = 0;
    const error = await runParsePipeline(buf, () => {
      calls++;
      throw new SlidesImportError("failed", "the parse timed out");
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SlidesImportError);
    expect(calls).toBe(1);
  });

  test("refuses a bomb before pptxtojson sees it", async () => {
    const bomb = zip({ "zeros.bin": new Uint8Array(20 * MiB) });
    const result = await runParsePipeline(bomb.buffer.slice(bomb.byteOffset, bomb.byteOffset + bomb.byteLength) as ArrayBuffer);
    expect(result).toEqual({ type: "rejected", code: "suspiciousRatio" });
  });
});

describe("parsePptx (worker, or the main-thread fallback when it cannot start)", () => {
  test("resolves the lean result and the assets", async () => {
    const parsed = await parsePptx(await deck());
    expect(parsed.lean.slides).toHaveLength(2);
    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets[0].bytes.byteLength).toBeGreaterThan(0);
    expect(parsed.scan.hidden).toEqual([false, false]);
  });

  test("an unsafe file rejects with [slides.import_rejected] and the tab keeps going", async () => {
    const bomb = zip({ "zeros.bin": new Uint8Array(20 * MiB) });
    const error = await parsePptx(bomb.buffer.slice(bomb.byteOffset, bomb.byteOffset + bomb.byteLength) as ArrayBuffer).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SlidesImportError);
    expect((error as SlidesImportError).code).toBe("unsafeFile");
    expect((error as SlidesImportError).rejectCode).toBe("suspiciousRatio");
    expect((error as Error).message).toStartWith("[slides.import_rejected]");
  });

  test("a file that is not a presentation rejects with [slides.import_failed]", async () => {
    const notDeck = zip({ "hello.txt": strToU8("hi") });
    const error = await parsePptx(notDeck.buffer.slice(notDeck.byteOffset, notDeck.byteOffset + notDeck.byteLength) as ArrayBuffer).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SlidesImportError);
    expect((error as SlidesImportError).code).toBe("failed");
  });

  test("falls back to this thread when there is no Worker, or when it errors before \"ready\"", async () => {
    const original = globalThis.Worker;
    let created = 0;
    class FailingWorker extends EventTarget {
      constructor() {
        super();
        created++;
        setTimeout(() => this.dispatchEvent(new Event("error")), 0);
      }
      postMessage(): void {}
      terminate(): void {}
    }
    try {
      (globalThis as { Worker?: unknown }).Worker = undefined;
      expect((await parsePptx(await deck())).lean.slides).toHaveLength(2);
      (globalThis as { Worker?: unknown }).Worker = FailingWorker;
      expect((await parsePptx(await deck())).assets).toHaveLength(1);
      expect(created).toBe(1);
    } finally {
      (globalThis as { Worker?: unknown }).Worker = original;
    }
  });

  test("an aborted signal rejects with an AbortError", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await parsePptx(await deck(), controller.signal).catch((e: unknown) => e);
    expect((error as Error).name).toBe("AbortError");
  });
});
