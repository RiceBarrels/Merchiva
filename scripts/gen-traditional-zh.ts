/**
 * One-off generator: build Traditional Chinese dictionaries from the Simplified
 * source. zh-cn.json is canonical (hand-maintained); zh-tw.json and zh-hk.json
 * are derived with OpenCC and may be refined by hand afterwards.
 *
 * Run with: bun run scripts/gen-traditional-zh.ts
 *
 *   s2twp — Simplified → Traditional (Taiwan), with phrase/idiom conversion
 *   s2hk  — Simplified → Traditional (Hong Kong)
 */
import * as OpenCC from "opencc-js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MESSAGES = join(import.meta.dir, "..", "messages");

const src = JSON.parse(readFileSync(join(MESSAGES, "zh-cn.json"), "utf8"));

// opencc-js Converter: from "cn" (Simplified) → to "tw"/"hk" (Traditional).
const toTW = OpenCC.Converter({ from: "cn", to: "twp" });
const toHK = OpenCC.Converter({ from: "cn", to: "hk" });

function convertTree(node: unknown, convert: (s: string) => string): unknown {
  if (typeof node === "string") return convert(node);
  if (Array.isArray(node)) return node.map((n) => convertTree(n, convert));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) out[k] = convertTree(v, convert);
    return out;
  }
  return node;
}

const tw = convertTree(src, toTW);
const hk = convertTree(src, toHK);

writeFileSync(join(MESSAGES, "zh-tw.json"), JSON.stringify(tw, null, 2) + "\n", "utf8");
writeFileSync(join(MESSAGES, "zh-hk.json"), JSON.stringify(hk, null, 2) + "\n", "utf8");

console.log("✓ Wrote messages/zh-tw.json and messages/zh-hk.json");
