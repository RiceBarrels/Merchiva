// lib/sheets/univer/theme.ts — the neutral Univer palette (sheets.md §9.4, §15 theme): every key of Univer's
// default theme is present, every colour is a hex value or a reference to a shade that exists, and the scales
// we replace are grey (equal channels), as the app's tokens are.

import { describe, expect, test } from "bun:test";
import { loadHeadlessModules } from "./helpers/headless";

type Node = Record<string, unknown>;
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const REF_RE = /^([a-z-]+)\.(\d+)$/;

function paths(node: unknown, prefix = ""): string[] {
  if (!node || typeof node !== "object") return [prefix];
  return Object.entries(node as Node).flatMap(([key, child]) => paths(child, prefix ? `${prefix}.${key}` : key));
}

function at(node: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Node)[key] : undefined), node);
}

const isGrey = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) === ((n >> 8) & 255) && ((n >> 8) & 255) === (n & 255);
};

describe("MERCHIVA_UNIVER_THEME", () => {
  test("has every key of Univer's default theme, with valid values", async () => {
    const { presets: P } = await loadHeadlessModules();
    const { MERCHIVA_UNIVER_THEME: theme, buildUniverTheme } = await import("@/lib/sheets/univer/theme");
    const expected = paths(P.defaultTheme).sort();
    expect(paths(theme).sort()).toEqual(expected);
    for (const path of expected) {
      const value = at(theme, path);
      if (typeof value === "number") {
        expect(path.endsWith(".alpha") && value >= 0 && value <= 1).toBe(true);
        continue;
      }
      expect(typeof value).toBe("string");
      const text = value as string;
      const ref = REF_RE.exec(text);
      if (ref) expect([text, typeof at(theme, `${ref[1]}.${ref[2]}`)]).toEqual([text, "string"]);
      else expect([path, HEX_RE.test(text)]).toEqual([path, true]);
    }
    const copy = buildUniverTheme();
    expect(copy).toEqual(theme);
    expect(copy).not.toBe(theme);
    expect(copy.primary).not.toBe(theme.primary);
  });

  test("primary and gray are the neutral scale; the accent colours stay Univer's", async () => {
    const { presets: P } = await loadHeadlessModules();
    const { MERCHIVA_UNIVER_THEME: theme } = await import("@/lib/sheets/univer/theme");
    for (const scale of [theme.primary, theme.gray]) {
      for (const value of Object.values(scale)) expect([value, isGrey(value)]).toEqual([value, true]);
    }
    expect([theme.gray[0], theme.gray[1000]]).toEqual(["#ffffff", "#0a0a0a"]);
    expect(theme.red).toEqual(P.defaultTheme.red);
    expect(theme.highlight).toEqual(P.defaultTheme.highlight);
    expect(theme["loop-color"]).toEqual(P.defaultTheme["loop-color"]);
  });
});

describe("peer outline colour", () => {
  test("a presence colour becomes a light fill of the same colour; anything else a neutral one", async () => {
    const { peerFillColor } = await import("@/lib/sheets/univer/peer-highlight");
    expect(peerFillColor("#2563eb")).toBe("rgba(37, 99, 235, 0.12)");
    expect(peerFillColor("red")).toBe("rgba(115, 115, 115, 0.12)");
  });
});
