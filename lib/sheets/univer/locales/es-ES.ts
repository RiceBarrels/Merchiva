// Univer's es-ES copy: the packs of the nine presets the editor registers, merged (sheets.md §9.5).
// Loaded through locale-loader.ts, one small chunk per language.

import { mergeLocales, type ILanguagePack } from "@univerjs/presets";
import core from "@univerjs/preset-sheets-core/locales/es-ES";
import conditionalFormatting from "@univerjs/preset-sheets-conditional-formatting/locales/es-ES";
import dataValidation from "@univerjs/preset-sheets-data-validation/locales/es-ES";
import drawing from "@univerjs/preset-sheets-drawing/locales/es-ES";
import filter from "@univerjs/preset-sheets-filter/locales/es-ES";
import findReplace from "@univerjs/preset-sheets-find-replace/locales/es-ES";
import hyperLink from "@univerjs/preset-sheets-hyper-link/locales/es-ES";
import note from "@univerjs/preset-sheets-note/locales/es-ES";
import sort from "@univerjs/preset-sheets-sort/locales/es-ES";

const pack: ILanguagePack = mergeLocales(core, filter, sort, conditionalFormatting, dataValidation, findReplace, hyperLink, note, drawing);

export default pack;
