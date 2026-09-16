import { describe, expect, test } from "bun:test";
import { DOC_EXCERPT_MAX, docExcerpt, docTextStats, docWordCount, docWordCountFallback } from "@/lib/docs/text";
import { loadServerDeclarations } from "./server-source";

/** The server function exactly as written in plan §B4.2. */
const PLAN_EXCERPT_MAX = 280;
function planDocExcerpt(plainText: string): string {
  return plainText.replace(/\s+/g, " ").trim().slice(0, PLAN_EXCERPT_MAX);
}

const EXCERPT_CORPUS: string[] = [
  "",
  " ",
  "\n\n\t",
  "Hello",
  "  Hello   world  ",
  "Line one\nLine two\r\nLine three\tTabbed",
  "Non breaking em-space　ideographic space",
  "Zero​width stays",
  "店铺交接班记录：\n\n1. 盘点库存\n2. 清洁台面",
  "مرحبا بالعالم — نص عربي",
  "a".repeat(279),
  "a".repeat(280),
  "a".repeat(281),
  `${"word ".repeat(100)}`,
  `${" ".repeat(10)}${"b".repeat(300)}${" ".repeat(10)}`,
  // Surrogate pair straddling the 280 boundary: both sides slice UTF-16 code units.
  `${"x".repeat(279)}😀tail`,
  `${"y".repeat(278)}  \n  z${"q".repeat(10)}`,
];

describe("docExcerpt", () => {
  test("DOC_EXCERPT_MAX is 280", () => {
    expect(DOC_EXCERPT_MAX).toBe(280);
  });

  test("matches the plan §B4.2 server function string-for-string", () => {
    for (const input of EXCERPT_CORPUS) expect(docExcerpt(input)).toBe(planDocExcerpt(input));
  });

  test("collapses whitespace, trims, caps at 280 without an ellipsis", () => {
    expect(docExcerpt("  Hello \n\n world  ")).toBe("Hello world");
    expect(docExcerpt("a".repeat(500))).toBe("a".repeat(280));
    expect(docExcerpt("a".repeat(500)).endsWith("…")).toBe(false);
  });
});

const server = loadServerDeclarations(["docExcerpt"]);

describe.if(server !== null)("docExcerpt parity with spacetimedb/src/index.ts", () => {
  test("client output equals the server function for the whole corpus", () => {
    const serverExcerpt = server?.docExcerpt as (s: string) => string;
    for (const input of EXCERPT_CORPUS) expect(docExcerpt(input)).toBe(serverExcerpt(input));
  });
});

test.if(server === null)("server docExcerpt not in spacetimedb/src/index.ts yet — checked against plan §B4.2 only", () => {
  console.warn("[docs/text.test] docExcerpt is missing from spacetimedb/src/index.ts; parity was checked against the plan text.");
});

describe("docWordCount", () => {
  test("Latin text", () => {
    expect(docWordCount("")).toBe(0);
    expect(docWordCount("   \n\t ")).toBe(0);
    expect(docWordCount("Hello world")).toBe(2);
    expect(docWordCount("Hello, world!")).toBe(2);
    expect(docWordCount("Don't stop — 42 apples.")).toBe(4);
    expect(docWordCount("… — !!! ???")).toBe(0);
    expect(docWordCount("one\n\ntwo\nthree")).toBe(3);
  });

  test("numbers count as words on every engine (JSC marks them not word-like)", () => {
    expect(docWordCount("42")).toBe(1);
    expect(docWordCount("3.14 is pi")).toBe(3);
    expect(docWordCount("v2 x_y")).toBe(2);
  });

  test("CJK text counts at least one word per run and never more than its characters", () => {
    const count = docWordCount("盘点库存");
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(4);
  });
});

describe("docWordCountFallback", () => {
  test("counts each CJK character plus whitespace-separated words", () => {
    expect(docWordCountFallback("")).toBe(0);
    expect(docWordCountFallback("你好世界 hello")).toBe(5);
    expect(docWordCountFallback("こんにちは world")).toBe(6);
    expect(docWordCountFallback("店铺abc")).toBe(3);
  });

  test("Hangul is space-delimited; punctuation-only tokens are not words", () => {
    expect(docWordCountFallback("안녕하세요 세계")).toBe(2);
    expect(docWordCountFallback("— hello — !!")).toBe(1);
    expect(docWordCountFallback("don't stop 42")).toBe(3);
  });
});

describe("docTextStats", () => {
  test("words and characters", () => {
    expect(docTextStats("Hello world")).toEqual({ words: 2, characters: 11, charactersNoSpaces: 10 });
  });

  test("line breaks are block separators, not characters", () => {
    expect(docTextStats("Hello\n\nworld")).toEqual({ words: 2, characters: 10, charactersNoSpaces: 10 });
  });

  test("grapheme clusters count once", () => {
    const stats = docTextStats("👍🏽 ok");
    expect(stats.characters).toBe(4);
    expect(stats.charactersNoSpaces).toBe(3);
  });

  test("empty and whitespace-only text", () => {
    expect(docTextStats("")).toEqual({ words: 0, characters: 0, charactersNoSpaces: 0 });
    expect(docTextStats(" \n ")).toEqual({ words: 0, characters: 2, charactersNoSpaces: 0 });
  });
});
