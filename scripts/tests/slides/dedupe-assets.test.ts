// In-worker image dedupe of a .pptx parse result (lib/slides/import/dedupe-assets.ts, slides.md §10.1 step 2, F26):
// one data URL referenced from many slides becomes one asset and many "asset:<key>" references, decoded once. Then
// the main-thread side (lib/slides/import/assets.ts, step 6): types sniffed from the bytes, uploads three at a time
// with one retry, every use written, bytes released.
import { describe, expect, test } from "bun:test";

import { createAssetRegistry, sniffImageKind, uploadAssets, type ImageKind, type PendingAsset } from "@/lib/slides/import/assets";
import { ASSET_REF_PREFIX, assetKeyOf, extractDataUrls } from "@/lib/slides/import/dedupe-assets";

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_URL = `data:image/png;base64,${PNG_B64}`;

function decoded(b64: string): number[] {
  return [...Buffer.from(b64, "base64")];
}

describe("extractDataUrls", () => {
  test("one data URL shown on 200 slides: one asset, 200 references, bytes equal the decoded base64", () => {
    const parsed = {
      slides: Array.from({ length: 200 }, (_, i) => ({
        fill: { type: "color", value: "#ffffff" },
        layoutElements: [{ type: "image", base64: PNG_URL, order: i }],
        elements: [],
      })),
    };
    const { lean, assets } = extractDataUrls(parsed);
    expect(assets).toHaveLength(1);
    expect(assets[0].key).toBe("a1");
    expect(assets[0].mime).toBe("image/png");
    expect([...new Uint8Array(assets[0].bytes)]).toEqual(decoded(PNG_B64));
    const refs = lean.slides.map((s) => s.layoutElements[0].base64);
    expect(refs).toHaveLength(200);
    expect(new Set(refs)).toEqual(new Set([`${ASSET_REF_PREFIX}a1`]));
    // The lean result is small: the base64 string crosses the thread boundary zero times.
    expect(JSON.stringify(lean)).not.toContain(PNG_B64);
  });

  test("distinct strings get distinct keys in first-seen order; the input is not modified", () => {
    const other = `data:image/jpeg;base64,/9j/4AAQSkZJRg==`;
    const parsed = { a: PNG_URL, b: [other, PNG_URL], c: { d: other } };
    const copy = structuredClone(parsed);
    const { lean, assets } = extractDataUrls(parsed);
    expect(lean).toEqual({ a: "asset:a1", b: ["asset:a2", "asset:a1"], c: { d: "asset:a2" } });
    expect(assets.map((a) => [a.key, a.mime])).toEqual([["a1", "image/png"], ["a2", "image/jpeg"]]);
    expect(parsed).toEqual(copy);
  });

  test("an empty MIME (pptxtojson's BMP / WebP data URLs) is still extracted, with mime ''", () => {
    const { lean, assets } = extractDataUrls({ base64: "data:;base64,Qk0+AAAA" });
    expect(lean.base64).toBe("asset:a1");
    expect(assets[0].mime).toBe("");
    expect([...new Uint8Array(assets[0].bytes)]).toEqual(decoded("Qk0+AAAA"));
  });

  test("non-image strings and data: inside text stay untouched", () => {
    const parsed = {
      content: `<p><span>see data:image/png;base64,${PNG_B64}</span></p>`,
      name: "data: not a url",
      plain: "data:image/png,notbase64",
      n: 3,
      flag: true,
      none: null,
    };
    const { lean, assets } = extractDataUrls(parsed);
    expect(assets).toHaveLength(0);
    expect(lean).toEqual(parsed);
  });

  test("broken base64 decodes to an empty buffer instead of throwing", () => {
    const { assets } = extractDataUrls({ x: "data:image/png;base64,@@@=" });
    expect(assets).toHaveLength(1);
    expect(assets[0].bytes.byteLength).toBe(0);
  });

  test("every asset has its own ArrayBuffer (a transfer list may not repeat one)", () => {
    const { assets } = extractDataUrls([PNG_URL, "data:image/gif;base64,R0lGODlhAQABAAAAACw=", "data:;base64,"]);
    const buffers = assets.map((a) => a.bytes);
    expect(new Set(buffers).size).toBe(buffers.length);
  });
});

describe("assetKeyOf", () => {
  test("reads only well-formed references", () => {
    expect(assetKeyOf("asset:a12")).toBe("a12");
    expect(assetKeyOf("asset:")).toBeNull();
    expect(assetKeyOf("asset:../x")).toBeNull();
    expect(assetKeyOf("data:image/png;base64,AAAA")).toBeNull();
    expect(assetKeyOf(12)).toBeNull();
  });
});

// ── What happens to the assets on the main thread (lib/slides/import/assets.ts, slides.md §10.1 step 6) ──────────

function bytes(...parts: Array<number[] | string>): ArrayBuffer {
  const out: number[] = [];
  for (const part of parts) out.push(...(typeof part === "string" ? new TextEncoder().encode(part) : part));
  return new Uint8Array(out).buffer;
}

const PNG_BYTES = Buffer.from(PNG_B64, "base64");
const SAMPLES: Array<[ImageKind, ArrayBuffer]> = [
  ["png", PNG_BYTES.buffer.slice(PNG_BYTES.byteOffset, PNG_BYTES.byteOffset + PNG_BYTES.byteLength)],
  ["jpeg", bytes([0xff, 0xd8, 0xff, 0xe0])],
  ["gif", bytes("GIF89a", [1, 0])],
  ["webp", bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ")],
  ["tiff", bytes([0x49, 0x49, 0x2a, 0x00, 8, 0])],
  ["emf", bytes([1, 0, 0, 0], new Array<number>(36).fill(0), " EMF")],
  ["wmf", bytes([0xd7, 0xcd, 0xc6, 0x9a, 0, 0])],
  ["bmp", bytes("BM", new Array<number>(40).fill(0))],
  ["svg", bytes('﻿<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
  ["unknown", bytes("hello world")],
];

function pending(key: string, data: ArrayBuffer, uses: Array<(url: string) => void> = []): PendingAsset {
  return { key, mime: "", bytes: data, uses };
}

describe("sniffImageKind", () => {
  test("types images by their signature", () => {
    for (const [kind, data] of SAMPLES) expect(sniffImageKind(data)).toBe(kind);
  });
});

describe("createAssetRegistry", () => {
  test("looks references up, registers writers only for images a slide can show, reports each image once", () => {
    const registry = createAssetRegistry(SAMPLES.map(([kind, data], i) => ({ key: `a${i + 1}`, mime: kind === "png" ? "image/png" : "", bytes: data })));
    expect(registry.lookup("asset:a1")).toEqual({ key: "a1", kind: "png" });
    expect(registry.lookup("asset:a6")).toEqual({ key: "a6", kind: "emf" });
    expect(registry.lookup("asset:a99")).toBeNull();
    expect(registry.lookup("data:image/png;base64,AAAA")).toBeNull();
    registry.use("a1", () => {});
    registry.use("a1", () => {});
    registry.use("a6", () => {}); // EMF: never pending
    registry.lookup("asset:a8");
    registry.use("a8", () => {});
    expect(registry.pending().map((a) => [a.key, a.mime, a.uses.length])).toEqual([["a1", "image/png", 2], ["a8", "image/bmp", 1]]);
    expect(registry.firstReport("a6")).toBe(true);
    expect(registry.firstReport("a6")).toBe(false);
  });
});

describe("uploadAssets", () => {
  test("uploads each image once, writes its URL into every use, and releases its bytes", async () => {
    const written: string[] = [];
    const asset = pending("a1", SAMPLES[0][1], [(url) => written.push(`one:${url}`), (url) => written.push(`two:${url}`)]);
    const files: File[] = [];
    const progress: Array<[number, number]> = [];
    const failures = await uploadAssets([asset], (done, total) => progress.push([done, total]), undefined, async (file) => {
      files.push(file);
      return "https://cdn.example/x.png";
    });
    expect(failures.size).toBe(0);
    expect(written).toEqual(["one:https://cdn.example/x.png", "two:https://cdn.example/x.png"]);
    expect(files.map((f) => [f.name, f.type])).toEqual([["image-a1.png", "image/png"]]);
    expect(asset.bytes.byteLength).toBe(0);
    expect(progress).toEqual([[0, 1], [1, 1]]);
  });

  test("retries once; a second failure is imageUploadFailed; unusable bytes never reach the upload", async () => {
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls === 1) throw new Error("network");
      return "https://cdn.example/ok.png";
    };
    expect((await uploadAssets([pending("a1", SAMPLES[0][1])], () => {}, undefined, flaky)).size).toBe(0);
    expect(calls).toBe(2);
    const failing = await uploadAssets([pending("a1", SAMPLES[0][1])], () => {}, undefined, async () => {
      throw new Error("503");
    });
    expect(failing.get("a1")).toBe("imageUploadFailed");
    let touched = false;
    const unusable = await uploadAssets([pending("t", SAMPLES[4][1]), pending("u", SAMPLES[9][1])], () => {}, undefined, async () => {
      touched = true;
      return "";
    });
    expect(Object.fromEntries(unusable)).toEqual({ t: "imageUnsupported", u: "imageUnsupported" });
    expect(touched).toBe(false);
  });

  test("an image over 8 MB that cannot be re-encoded here is imageTooLarge", async () => {
    const big = new Uint8Array(8 * 1024 * 1024 + 16);
    big.set(PNG_BYTES.subarray(0, 8));
    const failures = await uploadAssets([pending("big", big.buffer)], () => {}, undefined, async () => "https://cdn.example/big.png");
    expect(failures.get("big")).toBe("imageTooLarge");
  });

  test("runs at most three uploads at a time", async () => {
    let active = 0;
    let peak = 0;
    const assets = Array.from({ length: 8 }, (_, i) => pending(`a${i}`, SAMPLES[0][1].slice(0)));
    await uploadAssets(assets, () => {}, undefined, async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return "https://cdn.example/x.png";
    });
    expect(peak).toBe(3);
  });

  test("an aborted signal rejects with an AbortError", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = await uploadAssets([pending("a1", SAMPLES[0][1])], () => {}, controller.signal, async () => "https://x").catch((e: unknown) => e);
    expect((error as Error).name).toBe("AbortError");
  });
});
