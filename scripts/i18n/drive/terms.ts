// Drive-specific zh-tw / zh-hk wording that OpenCC's phrase tables miss. The patterns are written in the
// traditional form OpenCC OUTPUTS, because they run after the conversion (each comment names the zh-cn source).
// zh-tw: applyTaiwanTerms(toTW(v), DRIVE_TW_TERMS) — these rules first, then TW_TERMS (所有者→擁有者,
// 回收站→垃圾桶, 共享→共用 already live there). zh-hk: applyTerms(toHK(v), DRIVE_HK_TERMS).
// Every string these rules touch was checked by hand; scripts/tests/i18n/drive-terms.test.ts has one case per rule
// and fails a rule that never matches converter output.
import * as OpenCC from "opencc-js";
import { applyTaiwanTerms, type TermRule } from "../tw-terms";

/** Taiwan usage, after `cn→twp`. twp already gives 資料夾 (文件夹), 上傳 (上传) and 簡報 (演示文稿). */
export const DRIVE_TW_TERMS: ReadonlyArray<TermRule> = [
  [/電子表格/g, "試算表"], // 电子表格
  [/幻燈片/g, "簡報"], // 幻灯片
  [/雲盤/g, "雲端硬碟"], // 云盘
  [/門店/g, "店面"], // 门店
];

/**
 * Hong Kong usage, after `cn→hk`. Order matters: 文件夾 runs before 我的文件 (so 我的文件夹 becomes 我的資料夾),
 * and 店舖文件 runs after 門店/店鋪 have become 店舖. There is deliberately no bare 文件→檔案 rule: in zh-hk
 * 文件 also means "document".
 */
export const DRIVE_HK_TERMS: ReadonlyArray<TermRule> = [
  [/上傳/g, "上載"], // 上传
  [/文件夾/g, "資料夾"], // 文件夹
  [/演示文稿/g, "簡報"], // 演示文稿
  [/幻燈片/g, "簡報"], // 幻灯片
  [/電子表格/g, "試算表"], // 电子表格
  [/雲盤/g, "雲端硬碟"], // 云盘
  [/門店/g, "店舖"], // 门店
  [/店鋪/g, "店舖"], // 店铺
  [/我的文件/g, "我的檔案"], // 我的文件
  [/店舖文件/g, "店舖檔案"], // 门店文件 / 店铺文件, after the two rules above
];

/** Applies `rules` in order. */
export function applyTerms(text: string, rules: ReadonlyArray<TermRule>): string {
  return rules.reduce((out, [from, to]) => out.replace(from, to), text);
}

const toTW = OpenCC.Converter({ from: "cn", to: "twp" });
const toHK = OpenCC.Converter({ from: "cn", to: "hk" });

/** OpenCC's raw output, before any term rule (the tests check each rule against it). */
export const convertZh = { tw: toTW, hk: toHK } as const;

/** zh-cn → the zh-tw seed a human then reviews. */
export function deriveZhTw(zhcn: string): string {
  return applyTaiwanTerms(toTW(zhcn), DRIVE_TW_TERMS);
}

/** zh-cn → the zh-hk seed a human then reviews. */
export function deriveZhHk(zhcn: string): string {
  return applyTerms(toHK(zhcn), DRIVE_HK_TERMS);
}
