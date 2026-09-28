// Univer's zh-HK copy: the packs of the nine presets the editor registers, merged (sheets.md §9.5).
// Loaded through locale-loader.ts, one small chunk per language.

import { mergeLocales, type ILanguagePack } from "@univerjs/presets";
import core from "@univerjs/preset-sheets-core/locales/zh-HK";
import conditionalFormatting from "@univerjs/preset-sheets-conditional-formatting/locales/zh-HK";
import dataValidation from "@univerjs/preset-sheets-data-validation/locales/zh-HK";
import drawing from "@univerjs/preset-sheets-drawing/locales/zh-HK";
import filter from "@univerjs/preset-sheets-filter/locales/zh-HK";
import findReplace from "@univerjs/preset-sheets-find-replace/locales/zh-HK";
import hyperLink from "@univerjs/preset-sheets-hyper-link/locales/zh-HK";
import note from "@univerjs/preset-sheets-note/locales/zh-HK";
import sort from "@univerjs/preset-sheets-sort/locales/zh-HK";

const pack: ILanguagePack = mergeLocales(core, filter, sort, conditionalFormatting, dataValidation, findReplace, hyperLink, note, drawing);

export default pack;
