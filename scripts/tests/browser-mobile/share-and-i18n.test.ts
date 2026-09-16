import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PUBLIC_APP_ORIGIN, buildShareUrl, tryNativeShare } from "../../../lib/browser-shell/mobile/share";

const ROOT = join(import.meta.dir, "..", "..", "..");

describe("buildShareUrl (spec §15)", () => {
  test("drops the dialogs param, the hash and trailing slashes; uses the public origin outside a browser", () => {
    expect(buildShareUrl("/manager/inventory/?dialogs=Edit%20item&tab=2#row")).toBe(`${PUBLIC_APP_ORIGIN}/manager/inventory?tab=2`);
    expect(buildShareUrl("/manager/docs/edit?id=abc")).toBe(`${PUBLIC_APP_ORIGIN}/manager/docs/edit?id=abc`);
  });

  test("public origin has no trailing slash", () => {
    expect(PUBLIC_APP_ORIGIN.endsWith("/")).toBe(false);
  });

  test("Web Share is reported unsupported without navigator.share", async () => {
    expect(await tryNativeShare({ url: "https://example.test/manager", title: "x" })).toBe("unsupported");
  });
});

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) collectFiles(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

function leaf(tree: unknown, key: string): unknown {
  let cur = tree;
  for (const part of key.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

describe("browserMobile i18n coverage", () => {
  const sources = [
    ...collectFiles(join(ROOT, "components", "browser-shell", "mobile")),
    ...collectFiles(join(ROOT, "lib", "browser-shell", "mobile")),
  ];
  const used = new Set<string>();
  for (const file of sources) {
    for (const match of readFileSync(file, "utf8").matchAll(/"(browserMobile\.[A-Za-z0-9_.]+)"/g)) used.add(match[1]);
  }
  const locales = ["en", "zh-cn", "zh-tw", "zh-hk", "fr", "es", "hi", "ar"];
  const messages = Object.fromEntries(
    locales.map((locale) => [locale, JSON.parse(readFileSync(join(ROOT, "messages", `${locale}.json`), "utf8")) as unknown]),
  );

  test("the chrome uses browserMobile keys", () => {
    expect(used.size).toBeGreaterThan(40);
  });

  test.each(locales)("every key used by the mobile chrome exists in %s", (locale) => {
    const missing = [...used].filter((key) => {
      const value = leaf(messages[locale], key);
      return typeof value !== "string" || value.trim() === "";
    });
    expect(missing).toEqual([]);
  });

  test.each(locales)("%s keeps the English placeholders", (locale) => {
    const mismatched = [...used].filter((key) => {
      const en = leaf(messages.en, key);
      const value = leaf(messages[locale], key);
      if (typeof en !== "string" || typeof value !== "string") return false;
      const names = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
      return names(en) !== names(value);
    });
    expect(mismatched).toEqual([]);
  });
});
