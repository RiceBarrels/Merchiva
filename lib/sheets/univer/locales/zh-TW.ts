// Univer's zh-TW copy: the packs of the nine presets the editor registers, merged (sheets.md §9.5).
// Loaded through locale-loader.ts, one small chunk per language.

import { mergeLocales, type ILanguagePack } from "@univerjs/presets";
import core from "@univerjs/preset-sheets-core/locales/zh-TW";
import conditionalFormatting from "@univerjs/preset-sheets-conditional-formatting/locales/zh-TW";
import dataValidation from "@univerjs/preset-sheets-data-validation/locales/zh-TW";
import drawing from "@univerjs/preset-sheets-drawing/locales/zh-TW";
import filter from "@univerjs/preset-sheets-filter/locales/zh-TW";
import findReplace from "@univerjs/preset-sheets-find-replace/locales/zh-TW";
import hyperLink from "@univerjs/preset-sheets-hyper-link/locales/zh-TW";
import note from "@univerjs/preset-sheets-note/locales/zh-TW";
import sort from "@univerjs/preset-sheets-sort/locales/zh-TW";

const pack: ILanguagePack = mergeLocales(core, filter, sort, conditionalFormatting, dataValidation, findReplace, hyperLink, note, drawing);

export default pack;
