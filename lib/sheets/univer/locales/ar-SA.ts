// Univer's ar-SA copy: the packs of the nine presets the editor registers, merged (sheets.md §9.5).
// Loaded through locale-loader.ts, one small chunk per language.

import { mergeLocales, type ILanguagePack } from "@univerjs/presets";
import core from "@univerjs/preset-sheets-core/locales/ar-SA";
import conditionalFormatting from "@univerjs/preset-sheets-conditional-formatting/locales/ar-SA";
import dataValidation from "@univerjs/preset-sheets-data-validation/locales/ar-SA";
import drawing from "@univerjs/preset-sheets-drawing/locales/ar-SA";
import filter from "@univerjs/preset-sheets-filter/locales/ar-SA";
import findReplace from "@univerjs/preset-sheets-find-replace/locales/ar-SA";
import hyperLink from "@univerjs/preset-sheets-hyper-link/locales/ar-SA";
import note from "@univerjs/preset-sheets-note/locales/ar-SA";
import sort from "@univerjs/preset-sheets-sort/locales/ar-SA";

const pack: ILanguagePack = mergeLocales(core, filter, sort, conditionalFormatting, dataValidation, findReplace, hyperLink, note, drawing);

export default pack;
