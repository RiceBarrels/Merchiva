import { describe, expect, test } from "bun:test";
import { TW_TERMS, type TermRule } from "../../i18n/tw-terms";
import { DRIVE_HK_TERMS, DRIVE_TW_TERMS, convertZh, deriveZhHk, deriveZhTw } from "../../i18n/drive/terms";

/*
 * The Drive zh-tw / zh-hk term rules run on OpenCC's OUTPUT, so a rule written in simplified characters (or in a
 * form OpenCC never produces) silently does nothing. Each case runs a zh-cn input through the real converter and
 * the rule chain; the last test fails any Drive rule that no case exercises at its place in the chain.
 */

const TW_CASES: ReadonlyArray<[zhcn: string, zhtw: string]> = [
  ["电子表格", "試算表"],
  ["新建电子表格", "新增試算表"], // 新建 → 新增 comes from TW_TERMS, after the Drive rules
  ["幻灯片", "簡報"],
  ["云盘", "雲端硬碟"],
  ["门店文件", "店面檔案"],
  ["门店", "店面"],
];

const HK_CASES: ReadonlyArray<[zhcn: string, zhhk: string]> = [
  ["上传", "上載"],
  ["上传文件", "上載文件"],
  ["我的文件夹", "我的資料夾"],
  ["文件夹", "資料夾"],
  ["演示文稿", "簡報"],
  ["幻灯片", "簡報"],
  ["电子表格", "試算表"],
  ["云盘", "雲端硬碟"],
  ["门店", "店舖"],
  ["店铺", "店舖"],
  ["我的文件", "我的檔案"],
  ["门店文件", "店舖檔案"],
  ["店铺文件", "店舖檔案"],
];

/** Applies `rules` in order and records which of them matched the text at their turn. */
function trace(text: string, rules: ReadonlyArray<TermRule>): { out: string; fired: Set<TermRule> } {
  const fired = new Set<TermRule>();
  let out = text;
  for (const rule of rules) {
    if (out.search(rule[0]) >= 0) fired.add(rule);
    out = out.replace(rule[0], rule[1]);
  }
  return { out, fired };
}

describe("zh-tw (cn→twp, then DRIVE_TW_TERMS, then TW_TERMS)", () => {
  test.each(TW_CASES)("%s → %s", (zhcn, zhtw) => {
    expect(deriveZhTw(zhcn)).toBe(zhtw);
  });
});

describe("zh-hk (cn→hk, then DRIVE_HK_TERMS)", () => {
  test.each(HK_CASES)("%s → %s", (zhcn, zhhk) => {
    expect(deriveZhHk(zhcn)).toBe(zhhk);
  });

  test("文件 on its own stays 文件 (it also means document in zh-hk)", () => {
    expect(deriveZhHk("文件")).toBe("文件");
    expect(DRIVE_HK_TERMS.some(([from]) => from.source === "文件")).toBe(false);
  });
});

describe("every Drive rule matches real converter output", () => {
  test("zh-tw", () => {
    const fired = new Set<TermRule>();
    for (const [zhcn] of TW_CASES) {
      const run = trace(convertZh.tw(zhcn), [...DRIVE_TW_TERMS, ...TW_TERMS]);
      expect(run.out).toBe(deriveZhTw(zhcn));
      for (const rule of run.fired) fired.add(rule);
    }
    expect(DRIVE_TW_TERMS.filter((rule) => !fired.has(rule)).map(([from]) => from.source)).toEqual([]);
  });

  test("zh-hk", () => {
    const fired = new Set<TermRule>();
    for (const [zhcn] of HK_CASES) {
      const run = trace(convertZh.hk(zhcn), DRIVE_HK_TERMS);
      expect(run.out).toBe(deriveZhHk(zhcn));
      for (const rule of run.fired) fired.add(rule);
    }
    expect(DRIVE_HK_TERMS.filter((rule) => !fired.has(rule)).map(([from]) => from.source)).toEqual([]);
  });
});
