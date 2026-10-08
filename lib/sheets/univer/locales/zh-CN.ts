// Univer's zh-CN copy: the packs of the nine presets the editor registers, merged (sheets.md §9.5).
// Loaded through locale-loader.ts, one small chunk per language.

import { mergeLocales, type ILanguagePack } from "@univerjs/presets";
import core from "@univerjs/preset-sheets-core/locales/zh-CN";
import conditionalFormatting from "@univerjs/preset-sheets-conditional-formatting/locales/zh-CN";
import dataValidation from "@univerjs/preset-sheets-data-validation/locales/zh-CN";
import drawing from "@univerjs/preset-sheets-drawing/locales/zh-CN";
import filter from "@univerjs/preset-sheets-filter/locales/zh-CN";
import findReplace from "@univerjs/preset-sheets-find-replace/locales/zh-CN";
import hyperLink from "@univerjs/preset-sheets-hyper-link/locales/zh-CN";
import note from "@univerjs/preset-sheets-note/locales/zh-CN";
import sort from "@univerjs/preset-sheets-sort/locales/zh-CN";

const pack: ILanguagePack = mergeLocales(core, filter, sort, conditionalFormatting, dataValidation, findReplace, hyperLink, note, drawing);

export default pack;
