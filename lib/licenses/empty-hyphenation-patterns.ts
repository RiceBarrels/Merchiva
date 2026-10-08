// Stand-in for the TeX hyphenation pattern files of @univerjs/engine-render. next.config.ts aliases every file its
// PATTERN_LOADERS imports to this module (scripts/licenses/hyphenation.ts), so none of that data ships: several of
// those languages are MPL/GPL/LGPL or LPPL only. Merchiva never turns on auto-hyphenation. If a document does, each
// language loads a pattern with no break points and its text is laid out without hyphens.
//
// engine-render reads `module[snackToPascal(lang)]`, so there is one export per language it lazy-loads.
// scripts/tests/legal/hyphenation.test.ts keeps this list equal to the installed PATTERN_LOADERS.

/** [levels table, pattern trie]: one empty level and an empty trie, so no word gets a hyphen. */
const EMPTY_PATTERN: readonly [string, string] = ["", "{}"];

export {
  EMPTY_PATTERN as Af, EMPTY_PATTERN as As, EMPTY_PATTERN as Be, EMPTY_PATTERN as Bg, EMPTY_PATTERN as Bn,
  EMPTY_PATTERN as Ca, EMPTY_PATTERN as Cop, EMPTY_PATTERN as Cs, EMPTY_PATTERN as Cu, EMPTY_PATTERN as Cy,
  EMPTY_PATTERN as Da, EMPTY_PATTERN as De1901, EMPTY_PATTERN as De1996, EMPTY_PATTERN as DeCh1901,
  EMPTY_PATTERN as ElMonoton, EMPTY_PATTERN as ElPolyton, EMPTY_PATTERN as EnGb, EMPTY_PATTERN as Es,
  EMPTY_PATTERN as Et, EMPTY_PATTERN as Eu, EMPTY_PATTERN as Fi, EMPTY_PATTERN as Fr, EMPTY_PATTERN as Fur,
  EMPTY_PATTERN as Ga, EMPTY_PATTERN as Gl, EMPTY_PATTERN as Grc, EMPTY_PATTERN as Gu, EMPTY_PATTERN as Hi,
  EMPTY_PATTERN as Hr, EMPTY_PATTERN as Hsb, EMPTY_PATTERN as Hu, EMPTY_PATTERN as Hy, EMPTY_PATTERN as Ia,
  EMPTY_PATTERN as Id, EMPTY_PATTERN as Is, EMPTY_PATTERN as It, EMPTY_PATTERN as Ka, EMPTY_PATTERN as Kmr,
  EMPTY_PATTERN as Kn, EMPTY_PATTERN as La, EMPTY_PATTERN as LaXClassic, EMPTY_PATTERN as LaXLiturgic,
  EMPTY_PATTERN as Lt, EMPTY_PATTERN as Lv, EMPTY_PATTERN as Ml, EMPTY_PATTERN as MnCyrl, EMPTY_PATTERN as MnCyrlXLmc,
  EMPTY_PATTERN as Mr, EMPTY_PATTERN as MulEthi, EMPTY_PATTERN as Nb, EMPTY_PATTERN as Nl, EMPTY_PATTERN as Nn,
  EMPTY_PATTERN as No, EMPTY_PATTERN as Oc, EMPTY_PATTERN as Or, EMPTY_PATTERN as Pa, EMPTY_PATTERN as Pi,
  EMPTY_PATTERN as Pl, EMPTY_PATTERN as Pms, EMPTY_PATTERN as Pt, EMPTY_PATTERN as Rm, EMPTY_PATTERN as Ro,
  EMPTY_PATTERN as Ru, EMPTY_PATTERN as Sa, EMPTY_PATTERN as ShCyrl, EMPTY_PATTERN as ShLatn, EMPTY_PATTERN as Sk,
  EMPTY_PATTERN as Sl, EMPTY_PATTERN as SrCyrl, EMPTY_PATTERN as Sv, EMPTY_PATTERN as Ta, EMPTY_PATTERN as Te,
  EMPTY_PATTERN as Th, EMPTY_PATTERN as Tk, EMPTY_PATTERN as Tr, EMPTY_PATTERN as Uk, EMPTY_PATTERN as ZhLatnPinyin,
};
