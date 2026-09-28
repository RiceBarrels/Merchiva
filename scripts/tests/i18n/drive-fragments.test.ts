import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveZh, mergeFragments } from "../../i18n/drive";
import {
  FRAGMENTS_DIR, LOCALES, MESSAGES_DIR, flatten, formatProblem, incompleteFragmentDirs, leavesOf, loadFragments,
  loadMessages, unmergedLeaves, validateFragments, type Fragment, type Locale, type Tree,
} from "../../i18n/drive/fragment";
import { deriveZhHk, deriveZhTw } from "../../i18n/drive/terms";
import { brandViolation } from "../../licenses/brand";

/*
 * The Drive / Sheets / Slides i18n fragments (scripts/i18n/drive/). Until the serial merge (W2.3) they are the
 * source of truth and messages/*.json is untouched; W2.3 flips REQUIRE_MERGED, and from then on every fragment
 * leaf must equal messages/, so a skipped merge or a direct edit of a merged key fails here.
 *
 * It also catches a second writer: scripts/i18n/docs-home.ts still holds the pre-Drive values of drive-ui's two
 * overwrites (docs.share.managersNote, docs.share.visibilityPrivate) and derives their zh-tw / zh-hk from zh-cn with
 * OpenCC, so re-running it reverts those 16 leaves. Keep this file (integration-legal §6.7) until docs-home.ts
 * stops writing both keys.
 */
const REQUIRE_MERGED = true;

const ROOT = join(import.meta.dir, "..", "..", "..");
const tmpRoot = mkdtempSync(join(tmpdir(), "drive-fragments-"));
afterAll(() => rmSync(tmpRoot, { recursive: true, force: true }));
let tmpCount = 0;
const tmpDir = (name: string) => {
  const dir = join(tmpRoot, `${tmpCount++}-${name}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

/** Every file under scripts/i18n/drive/, by path: what --check must leave alone. */
function fragmentFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of readdirSync(FRAGMENTS_DIR, { recursive: true, encoding: "utf8" }).sort()) {
    const path = join(FRAGMENTS_DIR, rel);
    if (statSync(path).isFile()) out[rel] = readFileSync(path, "utf8");
  }
  return out;
}

describe("fragments in the repo", () => {
  // Loaded inside each test, so a fragment that does not parse fails these tests with its message, not the file.
  const repo = () => ({ frags: loadFragments(), messages: loadMessages() });

  test("validate with no problems", () => {
    const { frags, messages } = repo();
    expect(validateFragments(frags, messages).map(formatProblem)).toEqual([]);
  });

  test("every directory is a fragment (has fragment.json)", () => {
    expect(incompleteFragmentDirs()).toEqual([]);
  });

  test("the W0.7a seeds are present; data-layer.json loads with the meta defaults", () => {
    const { frags } = repo();
    const names = frags.map((f) => f.name);
    expect(names).toContain("drive-disclosure");
    expect(names).toContain("data-layer");
    const dataLayer = frags.find((f) => f.name === "data-layer");
    expect({ ext: dataLayer?.extends, over: dataLayer?.overwrites, same: dataLayer?.allowSameAsEn }).toEqual({ ext: null, over: [], same: [] });
  });

  test.if(REQUIRE_MERGED)("every fragment leaf is merged into messages/ (edit the fragment, then run bun scripts/i18n/drive.ts)", () => {
    const { frags, messages } = repo();
    expect(unmergedLeaves(frags, messages)).toEqual([]);
  });

  test("--check writes nothing (messages/ and the fragments) and reports the merge state", () => {
    const messageFiles = () => LOCALES.map((l) => readFileSync(join(MESSAGES_DIR, `${l}.json`), "utf8"));
    const before = { messages: messageFiles(), fragments: fragmentFiles() };
    const run = Bun.spawnSync([process.execPath, join(ROOT, "scripts", "i18n", "drive.ts"), "--check"], { cwd: ROOT });
    expect({ messages: messageFiles(), fragments: fragmentFiles() }).toEqual(before);
    expect(run.exitCode).toBe(REQUIRE_MERGED ? 0 : 1);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// In-memory fragments: each violates exactly one rule.

type Values = Record<Locale, string>;
const GREETING: Values = {
  en: "Open the file", ar: "افتح الملف", es: "Abre el archivo", fr: "Ouvrez le fichier", hi: "फ़ाइल खोलें",
  "zh-cn": "打开文件", "zh-hk": "打開文件", "zh-tw": "打開檔案",
};
const COUNT: Values = {
  en: "{count} files", ar: "عدد الملفات: {count}", es: "{count} archivos", fr: "{count} fichiers", hi: "{count} फ़ाइलें",
  "zh-cn": "{count} 个文件", "zh-hk": "{count} 個文件", "zh-tw": "{count} 個檔案",
};
const TITLE: Values = {
  en: "Store files", ar: "ملفات المتجر", es: "Archivos de la tienda", fr: "Fichiers du magasin", hi: "स्टोर की फ़ाइलें",
  "zh-cn": "门店文件", "zh-hk": "店舖檔案", "zh-tw": "店面檔案",
};

function setPath(tree: Tree, key: string, value: string): void {
  const parts = key.split(".");
  let cur = tree;
  for (const part of parts.slice(0, -1)) cur = (cur[part] ??= {}) as Tree;
  cur[parts[parts.length - 1]] = value;
}

function trees(leaves: Record<string, Values>): Record<Locale, Tree> {
  const out = Object.fromEntries(LOCALES.map((l) => [l, {}])) as Record<Locale, Tree>;
  for (const [key, values] of Object.entries(leaves)) for (const l of LOCALES) setPath(out[l], key, values[l]);
  return out;
}

function frag(over: Partial<Fragment> = {}, leaves: Record<string, Values> = { "x.greeting": GREETING, "x.count": COUNT }): Fragment {
  return { name: "t", unit: "test", owned: ["x"], extends: null, overwrites: [], allowSameAsEn: [], locales: trees(leaves), source: "(memory)", ...over };
}

function emptyMessages(): Record<Locale, Map<string, string>> {
  return Object.fromEntries(LOCALES.map((l) => [l, new Map<string, string>()])) as Record<Locale, Map<string, string>>;
}

const rulesOf = (frags: Fragment[], messages = emptyMessages()) => validateFragments(frags, messages).map((p) => p.rule);
const edit = (f: Fragment, locale: Locale, key: string, value: string) => (setPath(f.locales[locale], key, value), f);

describe("validateFragments rules", () => {
  test("a valid fragment has no problems", () => expect(rulesOf([frag()])).toEqual([]));

  test("a missing ar key", () => {
    const f = frag();
    delete (f.locales.ar.x as Tree).count;
    expect(rulesOf([f])).toEqual(["key-parity"]);
  });

  test("a mismatched {count}", () => expect(rulesOf([edit(frag(), "fr", "x.count", "{n} fichiers")])).toEqual(["placeholders"]));
  test('"Excel" in a value', () => expect(rulesOf([edit(frag(), "en", "x.greeting", "Open in Excel")])).toEqual(["brand"]));
  test('"एक्सेल" in hi', () => expect(rulesOf([edit(frag(), "hi", "x.greeting", "एक्सेल फ़ाइल खोलें")])).toEqual(["brand"]));

  test("overlapping owned without extends", () => {
    const other = frag({ name: "b", owned: ["x.sub"] }, { "x.sub.title": TITLE });
    expect(rulesOf([frag(), other])).toEqual(["owned-overlap"]);
  });

  test("an extends fragment may add leaves under its parent's prefixes, but not redefine one", () => {
    expect(rulesOf([frag(), frag({ name: "c", owned: [], extends: "t" }, { "x.title": TITLE })])).toEqual([]);
    expect(rulesOf([frag(), frag({ name: "c", owned: [], extends: "t" }, { "x.greeting": GREETING })])).toEqual(["duplicate-leaf"]);
  });

  test("an unlisted overwrite (existing key, different value); listed, it passes", () => {
    const messages = emptyMessages();
    messages.en.set("x.greeting", "Open it");
    expect(rulesOf([frag()], messages)).toEqual(["unlisted-overwrite"]);
    expect(rulesOf([frag({ overwrites: ["x.greeting"] })], messages)).toEqual([]);
  });

  test("zh-tw or zh-hk equal to zh-cn on a convertible string", () => {
    expect(rulesOf([edit(frag(), "zh-tw", "x.greeting", GREETING["zh-cn"])])).toEqual(["simplified"]);
    expect(rulesOf([edit(frag(), "zh-hk", "x.greeting", GREETING["zh-cn"])])).toEqual(["simplified"]);
  });

  test("a file fragment and a directory fragment with the same name", () => {
    const dir = tmpDir("same-name");
    writeFileSync(join(dir, "t.json"), JSON.stringify({ unit: "test", owned: ["x"], locales: frag().locales }));
    const other = frag({}, { "y.title": TITLE });
    mkdirSync(join(dir, "t"));
    writeFileSync(join(dir, "t", "fragment.json"), JSON.stringify({ unit: "test", owned: ["y"] }));
    for (const l of LOCALES) writeFileSync(join(dir, "t", `${l}.json`), JSON.stringify(other.locales[l]));
    expect(validateFragments(loadFragments(dir), emptyMessages()).map((p) => p.rule)).toEqual(["meta"]);
  });

  test("a directory fragment missing zh-hk.json", () => {
    const dir = tmpDir("dir-fragment");
    const f = frag();
    mkdirSync(join(dir, "t"));
    writeFileSync(join(dir, "t", "fragment.json"), JSON.stringify({ unit: "test", owned: ["x"] }));
    for (const l of LOCALES) if (l !== "zh-hk") writeFileSync(join(dir, "t", `${l}.json`), JSON.stringify(f.locales[l]));
    const problems = validateFragments(loadFragments(dir), emptyMessages());
    expect(problems.map((p) => [p.rule, p.locale])).toEqual([["locale-missing", "zh-hk"]]);
  });

  test("a key outside owned", () => expect(rulesOf([frag({ owned: ["x.greeting"] })])).toEqual(["unowned"]));
  test("leading whitespace", () => expect(rulesOf([edit(frag(), "es", "x.greeting", " Abre el archivo")])).toEqual(["value"]));
  test("an empty value", () => expect(rulesOf([edit(frag(), "es", "x.greeting", "")])).toEqual(["value"]));
  test("es left in English", () => expect(rulesOf([edit(frag(), "es", "x.greeting", GREETING.en)])).toEqual(["untranslated"]));
  test("ar without Arabic script", () => expect(rulesOf([edit(frag(), "ar", "x.greeting", "Iftah al-milaf")])).toEqual(["script"]));

  test("allowSameAsEn and value-free strings are exempt from the script and translation checks", () => {
    const same: Values = { en: "PDF", ar: "PDF", es: "PDF", fr: "PDF", hi: "PDF", "zh-cn": "PDF", "zh-hk": "PDF", "zh-tw": "PDF" };
    const digits: Values = { en: "{count}/{total}", ar: "{count}/{total}", es: "{count}/{total}", fr: "{count}/{total}", hi: "{count}/{total}", "zh-cn": "{count}/{total}", "zh-hk": "{count}/{total}", "zh-tw": "{count}/{total}" };
    expect(rulesOf([frag({ allowSameAsEn: ["x.pdf"] }, { "x.pdf": same, "x.ratio": digits })])).toEqual([]);
    expect(rulesOf([frag({}, { "x.pdf": same })])).toEqual(Array(7).fill("untranslated"));
  });

  test("a leaf where messages has an object", () => {
    const messages = emptyMessages();
    messages.fr.set("x.greeting.more", "Plus");
    expect(rulesOf([frag()], messages)).toEqual(["collision"]);
  });

  test("a leaf under another fragment's leaf", () => {
    expect(rulesOf([frag(), frag({ name: "c", owned: [], extends: "t" }, { "x.greeting.more": TITLE })])).toEqual(["collision"]);
  });

  test("overwrites must exist in messages/en.json and be defined by the fragment", () => {
    expect(rulesOf([frag({ overwrites: ["x.greeting"] })])).toEqual(["overwrite-missing"]);
    const messages = emptyMessages();
    messages.en.set("docs.other", "Other");
    expect(rulesOf([frag({ overwrites: ["docs.other"] })], messages)).toEqual(["overwrite-unused"]);
  });

  test("allowSameAsEn must name a leaf of the fragment", () => expect(rulesOf([frag({ allowSameAsEn: ["x.nope"] })])).toEqual(["allow-unused"]));
  test("extends must name a fragment", () => expect(rulesOf([frag({ extends: "ghost" })])).toEqual(["extends"]));

  test("post-merge state: leaves equal to messages in every locale need no overwrites entry", () => {
    const f = frag();
    const messages = emptyMessages();
    for (const l of LOCALES) for (const [k, v] of Object.entries({ "x.greeting": GREETING[l], "x.count": COUNT[l] })) messages[l].set(k, v);
    expect(rulesOf([f], messages)).toEqual([]);
    expect(unmergedLeaves([f], messages)).toEqual([]);
    messages.es.set("x.count", "{count} ficheros");
    expect(rulesOf([f], messages)).toEqual(["unlisted-overwrite"]);
  });

  test('"numbers" and "keynote speaker" in en values pass', () => {
    const plain: Values = { ...COUNT, en: "{count} numbers" };
    const speaker: Values = { ...GREETING, en: "Invite the keynote speaker" };
    expect(rulesOf([frag({}, { "x.count": plain, "x.greeting": speaker })])).toEqual([]);
  });
});

describe("loading", () => {
  test("a directory with no fragment.json is skipped and named; an interrupted write's .tmp is ignored", () => {
    const dir = tmpDir("loading");
    const f = frag();
    writeFileSync(join(dir, "t.json"), JSON.stringify({ unit: "test", owned: ["x"], locales: f.locales }));
    writeFileSync(join(dir, "t.json.123.tmp"), "{");
    mkdirSync(join(dir, "wip"));
    writeFileSync(join(dir, "wip", "en.json"), JSON.stringify({ y: { title: TITLE.en } }));
    mkdirSync(join(dir, "d"));
    writeFileSync(join(dir, "d", "fragment.json"), JSON.stringify({ unit: "test", owned: ["z"] }));
    const other = frag({}, { "z.title": TITLE });
    for (const l of LOCALES) writeFileSync(join(dir, "d", `${l}.json`), JSON.stringify(other.locales[l]));
    writeFileSync(join(dir, "d", "zh-tw.json.456.tmp"), "{");

    const frags = loadFragments(dir);
    expect(frags.map((x) => x.name)).toEqual(["d", "t"]);
    expect(validateFragments(frags, emptyMessages())).toEqual([]);
    expect(incompleteFragmentDirs(dir)).toEqual([join(dir, "wip")]);
  });

  test("an absent locale flattens to no leaves instead of throwing", () => {
    const f = frag();
    delete (f.locales as Partial<Record<Locale, Tree>>)["zh-hk"];
    expect(flatten(f.locales["zh-hk"]).size).toBe(0);
    expect(leavesOf(f, "zh-hk").size).toBe(0);
  });
});

describe("brandViolation", () => {
  test.each([["en", "numbers"], ["en", "Numbers only"], ["en", "keynote speaker"], ["en", "Export as .xlsx"], ["zh-cn", "表格"]])("%s %p passes", (locale, value) => {
    expect(brandViolation(locale, value)).toBeNull();
  });
  test.each([["en", "Excel"], ["en", "excel file"], ["en", "Google"], ["fr", "Ouvrir dans PowerPoint"], ["en", "Built on Univer"], ["hi", "एक्सेल"], ["ar", "إكسل"], ["zh-cn", "微软"], ["zh-tw", "微軟"]])("%s %p fails", (locale, value) => {
    expect(brandViolation(locale, value)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Merge and derive, on temp copies only.

describe("merge", () => {
  test("merging the repo fragments twice into a copy of messages/ changes nothing the second time", () => {
    const dir = tmpDir("messages");
    cpSync(MESSAGES_DIR, dir, { recursive: true });
    const frags = loadFragments();
    // What the first run must report, read off the fragments and the current messages rather than hardcoded, so it
    // holds before the merge, after it, and whatever fragments exist: a leaf messages lacks is added, and a leaf
    // whose value differs is changed, which only a listed overwrite may do.
    const current = loadMessages(dir);
    const expectedChanged: Record<string, Locale[]> = {};
    let expectedAdded = 0;
    for (const f of frags) {
      for (const l of LOCALES) {
        for (const [key, value] of leavesOf(f, l)) {
          const old = current[l].get(key);
          if (old === undefined) expectedAdded++;
          else if (old !== value) (expectedChanged[key] ??= []).push(l);
        }
      }
    }
    const overwriteKeys = new Set(frags.flatMap((f) => f.overwrites));
    const first = mergeFragments(frags, dir);
    expect(Object.fromEntries(first.changed.map((c) => [c.key, c.locales]))).toEqual(expectedChanged);
    expect(first.changed.map((c) => c.key).filter((k) => !overwriteKeys.has(k))).toEqual([]);
    expect(first.added).toBe(expectedAdded);
    const merged = LOCALES.map((l) => readFileSync(join(dir, `${l}.json`), "utf8"));
    const second = mergeFragments(frags, dir);
    expect(second).toEqual({ changed: [], added: 0, written: [] });
    expect(LOCALES.map((l) => readFileSync(join(dir, `${l}.json`), "utf8"))).toEqual(merged);
    expect(validateFragments(frags, loadMessages(dir)).map(formatProblem)).toEqual([]);
    expect(unmergedLeaves(frags, loadMessages(dir))).toEqual([]);
  });

  test("an overwrite is reported once, then never again", () => {
    const dir = tmpDir("overwrite");
    for (const l of LOCALES) writeFileSync(join(dir, `${l}.json`), `${JSON.stringify({ x: { greeting: "old" }, y: "kept" }, null, 2)}\n`);
    const f = frag({ overwrites: ["x.greeting"] });
    expect(validateFragments([f], loadMessages(dir))).toEqual([]);
    const first = mergeFragments([f], dir);
    expect(first.changed).toEqual([{ key: "x.greeting", locales: [...LOCALES] }]);
    expect(first.added).toBe(LOCALES.length);
    expect(mergeFragments([f], dir)).toEqual({ changed: [], added: 0, written: [] });
    expect(JSON.parse(readFileSync(join(dir, "fr.json"), "utf8"))).toEqual({ x: { greeting: GREETING.fr, count: COUNT.fr }, y: "kept" });
  });

  test("refuses a key outside the fragment's prefixes even when validation was skipped", () => {
    const dir = tmpDir("guard");
    for (const l of LOCALES) writeFileSync(join(dir, `${l}.json`), "{}\n");
    expect(() => mergeFragments([frag({ owned: ["x.count"] })], dir)).toThrow(/outside/);
  });
});

describe("--derive-zh", () => {
  test("fills only the missing zh-tw / zh-hk leaves of a directory fragment", () => {
    const dir = tmpDir("derive");
    const f = frag({}, { "x.title": TITLE, "x.count": COUNT });
    mkdirSync(join(dir, "t"));
    writeFileSync(join(dir, "t", "fragment.json"), JSON.stringify({ unit: "test", owned: ["x"] }));
    for (const l of ["en", "ar", "es", "fr", "hi", "zh-cn"] as const) writeFileSync(join(dir, "t", `${l}.json`), JSON.stringify(f.locales[l]));
    writeFileSync(join(dir, "t", "zh-tw.json"), JSON.stringify({ x: { title: "店面檔案（已審閱）" } }));
    const en = readFileSync(join(dir, "t", "en.json"), "utf8");

    const report = deriveZh("t", dir);
    expect(report.derived).toEqual({ "zh-tw": ["x.count"], "zh-hk": ["x.title", "x.count"] });
    expect(JSON.parse(readFileSync(join(dir, "t", "zh-tw.json"), "utf8"))).toEqual({ x: { title: "店面檔案（已審閱）", count: deriveZhTw(COUNT["zh-cn"]) } });
    expect(JSON.parse(readFileSync(join(dir, "t", "zh-hk.json"), "utf8"))).toEqual({ x: { title: "店舖檔案", count: deriveZhHk(COUNT["zh-cn"]) } });
    expect(readFileSync(join(dir, "t", "en.json"), "utf8")).toBe(en);
    expect(deriveZh(join(dir, "t")).derived).toEqual({ "zh-tw": [], "zh-hk": [] });
  });

  test("rewrites only the derived locale of a file fragment and keeps its meta", () => {
    const dir = tmpDir("derive-file");
    const f = frag();
    const { "zh-hk": _dropped, ...locales } = f.locales;
    void _dropped;
    writeFileSync(join(dir, "t.json"), `${JSON.stringify({ $schema: "merchiva-i18n-fragment/1", unit: "test", owned: ["x"], locales }, null, 2)}\n`);
    expect(deriveZh(join(dir, "t.json")).derived["zh-hk"]).toEqual(["x.greeting", "x.count"]);
    const raw = JSON.parse(readFileSync(join(dir, "t.json"), "utf8")) as { $schema: string; locales: Record<string, Tree> };
    expect(raw.$schema).toBe("merchiva-i18n-fragment/1");
    expect(raw.locales["zh-tw"]).toEqual(f.locales["zh-tw"]);
    expect(raw.locales["zh-hk"]).toEqual({ x: { greeting: deriveZhHk(GREETING["zh-cn"]), count: deriveZhHk(COUNT["zh-cn"]) } });
  });
});
