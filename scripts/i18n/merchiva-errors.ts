// Merges the server-side Mr. Merchiva strings (`merchiva.errors.*`, `merchiva.replyReady.*`) into
// all 8 locale files. Read by lib/ai/reply-text.ts for /api/store-ai (fallback replies) and
// /api/store-ai/enqueue (the "reply ready" notification).
// Run: bun scripts/i18n/merchiva-errors.ts
// Leaf-scoped and idempotent: never deletes keys, only writes the subtrees in OWNED, and leaves a
// locale file untouched when nothing changed. zh-tw / zh-hk are converted from zh-cn leaf by leaf
// with opencc-js (never run scripts/gen-traditional-zh.ts: it rewrites both files wholesale and
// would erase other sessions' edits).
import { readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import * as OpenCC from "opencc-js";
import { applyTaiwanTerms } from "./tw-terms";

type Tree = { [key: string]: string | Tree };
type HandLocale = "en" | "zh-cn" | "fr" | "es" | "hi" | "ar";

const OWNED: readonly string[] = ["merchiva.errors", "merchiva.replyReady"];

function strings(voiceFallback: string, chatFallback: string, title: string, body: string): Tree {
  return {
    merchiva: {
      errors: { voiceFallback, chatFallback },
      replyReady: { title, body },
    },
  };
}

const DICT: Record<HandLocale, Tree> = {
  en: strings(
    "Sorry, I didn't catch that — could you try again?",
    "I couldn't generate a response. Please try again.",
    "Mr. Merchiva replied",
    "Your reply is ready.",
  ),
  "zh-cn": strings(
    "抱歉，我没听清，可以再说一次吗？",
    "我没能生成回复，请再试一次。",
    "Mr. Merchiva 回复了",
    "你的回复已经准备好了。",
  ),
  fr: strings(
    "Désolé, je n'ai pas compris. Pouvez-vous répéter ?",
    "Je n'ai pas pu générer de réponse. Veuillez réessayer.",
    "Mr. Merchiva a répondu",
    "Votre réponse est prête.",
  ),
  es: strings(
    "Disculpa, no entendí. ¿Puedes repetirlo?",
    "No pude generar una respuesta. Inténtalo de nuevo.",
    "Mr. Merchiva respondió",
    "Tu respuesta está lista.",
  ),
  hi: strings(
    "क्षमा करें, मैं नहीं समझ पाया। क्या आप दोबारा कह सकते हैं?",
    "मैं उत्तर नहीं बना सका। कृपया पुनः प्रयास करें।",
    "Mr. Merchiva ने जवाब दिया",
    "आपका जवाब तैयार है।",
  ),
  ar: strings(
    "آسف، لم أفهم. هل يمكنك المحاولة مرة أخرى؟",
    "لم أتمكن من إنشاء رد. يرجى المحاولة مرة أخرى.",
    "رد عليك السيد ميرشيفا",
    "ردك جاهز.",
  ),
};

const MESSAGES = join(import.meta.dir, "..", "..", "messages");

function flatten(tree: Tree, prefix = ""): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.push([path, v]);
    else out.push(...flatten(v, path));
  }
  return out;
}

function setLeaf(root: Record<string, unknown>, path: string, value: string): void {
  if (!OWNED.some((o) => path === o || path.startsWith(`${o}.`))) throw new Error(`${path} is outside ${OWNED.join(", ")}`);
  const parts = path.split(".");
  let cur = root;
  for (const part of parts.slice(0, -1)) {
    const next = cur[part];
    if (next === undefined) cur[part] = {};
    else if (typeof next !== "object" || next === null || Array.isArray(next)) throw new Error(`${path}: "${part}" is not an object`);
    cur = cur[part] as Record<string, unknown>;
  }
  const leaf = parts[parts.length - 1];
  if (cur[leaf] !== undefined && typeof cur[leaf] !== "string") throw new Error(`${path} would overwrite an object`);
  cur[leaf] = value;
}

/** Returns true when the file changed. */
function mergeInto(locale: string, entries: Array<[string, string]>): boolean {
  const file = join(MESSAGES, `${locale}.json`);
  for (let attempt = 0; attempt < 5; attempt++) {
    const mtime = statSync(file).mtimeMs;
    const original = readFileSync(file, "utf8");
    const json = JSON.parse(original) as Record<string, unknown>;
    for (const [k, v] of entries) setLeaf(json, k, v);
    const text = `${JSON.stringify(json, null, 2)}\n`;
    if (text === original) return false; // already merged: don't touch the file
    if (statSync(file).mtimeMs !== mtime) continue; // another writer: redo from a fresh read
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    renameSync(tmp, file);
    return true;
  }
  throw new Error(`${locale}.json kept changing; rerun`);
}

const locales = Object.keys(DICT) as HandLocale[];
const enKeys = flatten(DICT.en).map(([k]) => k).sort().join("\n");
for (const loc of locales) {
  if (flatten(DICT[loc]).map(([k]) => k).sort().join("\n") !== enKeys) throw new Error(`${loc} key set differs from en`);
}
const changed: string[] = [];
for (const loc of locales) if (mergeInto(loc, flatten(DICT[loc]))) changed.push(loc);
const zh = flatten(DICT["zh-cn"]);
const toTW = OpenCC.Converter({ from: "cn", to: "twp" });
const toHK = OpenCC.Converter({ from: "cn", to: "hk" });
if (mergeInto("zh-tw", zh.map(([k, v]): [string, string] => [k, applyTaiwanTerms(toTW(v))]))) changed.push("zh-tw");
if (mergeInto("zh-hk", zh.map(([k, v]): [string, string] => [k, toHK(v)]))) changed.push("zh-hk");
console.log(`merged ${zh.length} keys into 8 locales; changed: ${changed.length > 0 ? changed.join(", ") : "none"}`);
