// Univer's fr-FR copy: the packs of the nine presets the editor registers, merged (sheets.md §9.5).
// Loaded through locale-loader.ts, one small chunk per language.

import { mergeLocales, type ILanguagePack } from "@univerjs/presets";
import core from "@univerjs/preset-sheets-core/locales/fr-FR";
import conditionalFormatting from "@univerjs/preset-sheets-conditional-formatting/locales/fr-FR";
import dataValidation from "@univerjs/preset-sheets-data-validation/locales/fr-FR";
import drawing from "@univerjs/preset-sheets-drawing/locales/fr-FR";
import filter from "@univerjs/preset-sheets-filter/locales/fr-FR";
import findReplace from "@univerjs/preset-sheets-find-replace/locales/fr-FR";
import hyperLink from "@univerjs/preset-sheets-hyper-link/locales/fr-FR";
import note from "@univerjs/preset-sheets-note/locales/fr-FR";
import sort from "@univerjs/preset-sheets-sort/locales/fr-FR";

const pack: ILanguagePack = mergeLocales(core, filter, sort, conditionalFormatting, dataValidation, findReplace, hyperLink, note, drawing);

export default pack;
