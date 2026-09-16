// Taiwan usage that OpenCC's cn→twp phrases miss (it also turns 权限 into 許可權). Applied in order after the twp
// conversion, to the zh-tw strings of the browser-shell and Docs i18n scripts only; zh-hk keeps the plain `hk`
// converter. Every string these rules touch was checked by hand; a script whose wording differs (e.g. 应用 as the
// verb "apply") passes its own rules first.
export type TermRule = readonly [RegExp, string];

export const TW_TERMS: ReadonlyArray<TermRule> = [
  [/許可權/g, "權限"],
  [/訪問/g, "存取"],
  [/回收站/g, "垃圾桶"],
  [/撤消/g, "復原"],
  [/恢復/g, "還原"],
  [/新建/g, "新增"],
  [/創建/g, "建立"],
  [/模板/g, "範本"],
  [/佈局/g, "版面配置"],
  [/網格檢視/g, "格狀檢視"],
  [/列表檢視/g, "清單檢視"],
  [/常規/g, "一般"],
  [/匹配/g, "相符"],
  [/標籤頁/g, "分頁"],
  [/所有者/g, "擁有者"],
  [/共享/g, "共用"],
  [/應用(?!程式)/g, "應用程式"],
];

/** `extra` rules run first, then TW_TERMS. */
export function applyTaiwanTerms(text: string, extra: ReadonlyArray<TermRule> = []): string {
  return [...extra, ...TW_TERMS].reduce((out, [from, to]) => out.replace(from, to), text);
}
