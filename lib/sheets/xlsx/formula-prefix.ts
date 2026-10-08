// Future-function prefixes in .xlsx formulas (sheets.md §11.4). The file format stores every function Excel
// added after 2007 with an `_xlfn.` prefix (FILTER and SORT, worksheet-only, as `_xlfn._xlws.`) and the names
// LET and LAMBDA bind with `_xlpm.`; Excel reads an unprefixed one as an unknown name and shows #NAME?. Univer's
// formulas carry no prefixes: the export adds them (addFormulaPrefixes), the import removes them
// (stripFormulaPrefixes). String literals, quoted sheet names and bracketed references are never touched.
// No Univer runtime import: this runs in the xlsx worker, which does not load the formula engine.

/**
 * Functions stored as `_xlfn.<NAME>`: a literal copy of Univer's NEW_EXCEL_FUNCTIONS (engine-formula 1.0.2,
 * src/functions/new-excel-functions.ts), plus LET and LAMBDA (Univer prefixes them in its own branch) and the
 * post-2007 functions Univer implements but leaves out of that list. NETWORKDAYS.INTL, WORKDAY.INTL and
 * ISO.CEILING are in ISO/IEC 29500's own function list, so they take no prefix (Univer's list leaves them out too).
 */
export const EXCEL_FUTURE_FUNCTIONS: ReadonlySet<string> = new Set([
  "ACOT", "ACOTH", "ARABIC", "BASE", "CEILING.MATH", "CEILING.PRECISE", "COMBINA", "COT", "COTH", "CSC", "CSCH",
  "DECIMAL", "FLOOR.MATH", "FLOOR.PRECISE", "MUNIT", "RANDARRAY", "SEC", "SECH", "SEQUENCE", "CHOOSECOLS",
  "CHOOSEROWS", "DROP", "EXPAND", "FILTER", "FORMULATEXT", "HSTACK", "SORT", "SORTBY", "TAKE", "TOCOL", "TOROW",
  "UNIQUE", "VSTACK", "WRAPCOLS", "WRAPROWS", "XLOOKUP", "XMATCH", "BITAND", "BITLSHIFT", "BITOR", "BITRSHIFT",
  "BITXOR", "ERF.PRECISE", "ERFC.PRECISE", "IMCOSH", "IMCOT", "IMCSC", "IMCSCH", "IMSEC", "IMSECH", "IMSINH",
  "IMTAN", "ISFORMULA", "SHEET", "SHEETS", "IFNA", "IFS", "GROUPBY", "SWITCH", "XOR", "BETA.DIST", "BETA.INV",
  "BINOM.DIST", "BINOM.DIST.RANGE", "BINOM.INV", "CHISQ.DIST", "CHISQ.DIST.RT", "CHISQ.INV", "CHISQ.INV.RT",
  "CHISQ.TEST", "CONFIDENCE.NORM", "CONFIDENCE.T", "COVARIANCE.P", "COVARIANCE.S", "EXPON.DIST", "F.DIST",
  "F.DIST.RT", "F.INV", "F.INV.RT", "F.TEST", "FORECAST.LINEAR", "GAMMA", "GAMMA.DIST", "GAMMA.INV",
  "GAMMALN.PRECISE", "GAUSS", "HYPGEOM.DIST", "LOGNORM.DIST", "LOGNORM.INV", "MAXIFS", "MINIFS", "MODE.MULT",
  "MODE.SNGL", "NEGBINOM.DIST", "NORM.DIST", "NORM.INV", "NORM.S.DIST", "NORM.S.INV", "PERCENTILE.EXC",
  "PERCENTILE.INC", "PERCENTRANK.EXC", "PERCENTRANK.INC", "PERMUTATIONA", "PHI", "POISSON.DIST", "QUARTILE.EXC",
  "QUARTILE.INC", "RANK.AVG", "RANK.EQ", "SKEW.P", "STDEV.P", "STDEV.S", "T.DIST", "T.DIST.2T", "T.DIST.RT",
  "T.INV", "T.INV.2T", "T.TEST", "VAR.P", "VAR.S", "WEIBULL.DIST", "Z.TEST", "ARRAYTOTEXT", "ENCODEURL",
  "NUMBERVALUE", "TEXTAFTER", "TEXTBEFORE", "TEXTJOIN", "TEXTSPLIT", "UNICHAR", "UNICODE", "VALUETOTEXT", "DAYS",
  "ISOWEEKNUM", "PDURATION", "RRI", "BYCOL", "BYROW", "MAKEARRAY", "MAP", "REDUCE", "SCAN",
  // Not in Univer's list.
  "LET", "LAMBDA", "AGGREGATE", "CONCAT", "FORECAST.ETS", "FORECAST.ETS.CONFINT", "FORECAST.ETS.SEASONALITY",
  "FORECAST.ETS.STAT", "FILTERXML", "WEBSERVICE", "IMAGE", "ISOMITTED", "PERCENTOF", "REGEXTEST", "REGEXEXTRACT",
  "REGEXREPLACE", "ANCHORARRAY",
]);

/** Worksheet-only future functions: `_xlfn._xlws.<NAME>`. */
const WORKSHEET_FUNCTIONS: ReadonlySet<string> = new Set(["FILTER", "SORT"]);

const PREFIX_RE = /^(?:_xlfn\.|_xlws\.|_xlpm\.)+/i;
const ANY_PREFIX_RE = /_xl(?:fn|ws|pm)\./i;
const NAME_CHAR_RE = /^[\p{L}\p{M}\p{N}_.\\$]$/u;
const ERROR_CHAR_RE = /^[A-Za-z0-9_/!?]$/;
const SPACE_RE = /^\s$/;
/** A run of name characters right before "(": every call, plus look-alikes in text the tokenizer then skips. */
const CALL_RE = /([\p{L}\p{M}\p{N}_.\\$]+)\(/gu;

interface Token {
  /** name: a function, defined name, reference or number; opaque: never rewritten; punct / space: one character. */
  kind: "name" | "opaque" | "punct" | "space";
  text: string;
}

/** The code point at `i` as a string (a whole surrogate pair). */
function charAt(text: string, i: number): string {
  return String.fromCodePoint(text.codePointAt(i) ?? 0);
}

/** The end of the quoted run opening at `start` ('…' or "…", a doubled quote escapes one); unterminated → the end. */
function quotedEnd(text: string, start: number): number {
  const quote = text[start];
  let j = start + 1;
  while (j < text.length) {
    if (text[j] !== quote) j++;
    else if (text[j + 1] === quote) j += 2;
    else return j + 1;
  }
  return j;
}

/** The end of the bracketed run opening at `start` (structured references nest brackets). */
function bracketEnd(text: string, start: number): number {
  let depth = 0;
  for (let j = start; j < text.length; j++) {
    if (text[j] === "[") depth++;
    else if (text[j] === "]" && --depth === 0) return j + 1;
  }
  return text.length;
}

function tokenize(formula: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    let end: number;
    let kind: Token["kind"] = "opaque";
    if (ch === '"' || ch === "'") end = quotedEnd(formula, i);
    else if (ch === "[") end = bracketEnd(formula, i);
    else if (ch === "#") {
      // An error literal (#N/A, #DIV/0!, #REF!…) or the spill operator.
      end = i + 1;
      while (end < formula.length && ERROR_CHAR_RE.test(formula[end])) end++;
    } else if (NAME_CHAR_RE.test(charAt(formula, i))) {
      kind = "name";
      end = i + charAt(formula, i).length;
      while (end < formula.length && NAME_CHAR_RE.test(charAt(formula, end))) end += charAt(formula, end).length;
    } else {
      kind = SPACE_RE.test(ch) ? "space" : "punct";
      end = i + 1;
    }
    out.push({ kind, text: formula.slice(i, end) });
    i = end;
  }
  return out;
}

function bare(name: string): string {
  return name.replace(PREFIX_RE, "");
}

/** The token indexes of each argument of the call whose "(" is at `open` (spaces left out), and its ")". */
function callArgs(tokens: readonly Token[], open: number): { close: number; args: number[][] } | null {
  const args: number[][] = [[]];
  let depth = 0;
  for (let j = open; j < tokens.length; j++) {
    const { kind, text } = tokens[j];
    if (kind === "punct" && (text === "(" || text === "{")) {
      depth++;
      if (depth === 1) continue;
    } else if (kind === "punct" && (text === ")" || text === "}")) {
      depth--;
      if (depth === 0) return { close: j, args };
    } else if (kind === "punct" && text === "," && depth === 1) {
      args.push([]);
      continue;
    }
    if (kind !== "space") args[args.length - 1].push(j);
  }
  return null;
}

interface ParamScope {
  /** Token indexes of the call's "(" and ")". */
  open: number;
  close: number;
  /** The bound names, lower-cased. */
  names: Set<string>;
}

/** The names each LET (every other argument but the last) and LAMBDA (every argument but the last) binds. */
function paramScopes(tokens: readonly Token[]): ParamScope[] {
  const scopes: ParamScope[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) {
    if (tokens[i].kind !== "name" || tokens[i + 1].text !== "(") continue;
    const fn = bare(tokens[i].text).toUpperCase();
    if (fn !== "LET" && fn !== "LAMBDA") continue;
    const call = callArgs(tokens, i + 1);
    if (!call) continue;
    const declared = call.args.filter((_, k) => k < call.args.length - 1 && (fn === "LAMBDA" || k % 2 === 0));
    const names = new Set<string>();
    for (const arg of declared) {
      if (arg.length === 1 && tokens[arg[0]].kind === "name") names.add(bare(tokens[arg[0]].text).toLowerCase());
    }
    if (names.size > 0) scopes.push({ open: i + 1, close: call.close, names });
  }
  return scopes;
}

/** `name` as a future function call (`_xlfn.XLOOKUP`), or null when it is not one. */
function futureFunction(name: string): string | null {
  const upper = name.toUpperCase();
  if (WORKSHEET_FUNCTIONS.has(upper)) return `_xlfn._xlws.${upper}`;
  return EXCEL_FUTURE_FUNCTIONS.has(upper) ? `_xlfn.${upper}` : null;
}

/** Whether any call in `formula` may be a future function, LET or LAMBDA: most formulas need no tokenizing. */
function mayNeedPrefixes(formula: string): boolean {
  for (const match of formula.matchAll(CALL_RE)) if (EXCEL_FUTURE_FUNCTIONS.has(bare(match[1]).toUpperCase())) return true;
  return false;
}

/**
 * A Univer formula (without "=") as the file stores it: future functions prefixed with `_xlfn.` (FILTER and
 * SORT with `_xlfn._xlws.`), names bound by LET / LAMBDA with `_xlpm.` inside that call. Prefixes already
 * there are normalized, so the result is the same however often it is applied.
 */
export function addFormulaPrefixes(formula: string): string {
  if (!mayNeedPrefixes(formula)) return formula;
  const tokens = tokenize(formula);
  const scopes = paramScopes(tokens);
  let changed = false;
  const out = tokens.map((token, i) => {
    const prev = tokens[i - 1]?.text;
    const next = tokens[i + 1]?.text;
    if (token.kind !== "name" || prev === "!") return token.text;
    const name = bare(token.text);
    const call = next === "(";
    // "A" in "A:A" is a column and "a" in "a!B1" a sheet, whatever LET binds.
    const reference = prev === ":" || next === ":" || next === "!";
    const bound = !reference && scopes.some((s) => s.open < i && i < s.close && s.names.has(name.toLowerCase()));
    const fn = call ? futureFunction(name) : null;
    const text = fn ?? (bound ? `_xlpm.${name}` : token.text);
    if (text !== token.text) changed = true;
    return text;
  });
  return changed ? out.join("") : formula;
}

/** A formula read from a file with its `_xlfn.`, `_xlws.` and `_xlpm.` prefixes removed, for Univer. */
export function stripFormulaPrefixes(formula: string): string {
  if (!ANY_PREFIX_RE.test(formula)) return formula;
  return tokenize(formula).map((token) => (token.kind === "name" ? bare(token.text) : token.text)).join("");
}
