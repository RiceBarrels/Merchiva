// The docs editor's print rules live in the global stylesheet, which every route loads. A print rule there that
// hides body's children, or an unnamed @page, changes printing on every page (they came out blank). These checks
// keep the html/body overrides tied to the docs print portal, and confirm the scoped selectors survive the
// Lightning CSS pass that Tailwind runs on production builds.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Features, transform } from "lightningcss";

const GLOBALS = readFileSync(join(import.meta.dir, "..", "..", "..", "app", "globals.css"), "utf8");
const PORTAL = ".doc-print-portal";

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Index just past the `}` that closes the `{` at `open`. */
function closeBrace(css: string, open: number): number {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return i + 1;
  }
  throw new Error("unbalanced braces");
}

/** Full text of every `@media print { … }` block. */
function printBlocks(css: string): string[] {
  const source = stripComments(css);
  const blocks: string[] = [];
  const re = /@media\s+print\s*\{/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const end = closeBrace(source, re.lastIndex - 1);
    blocks.push(source.slice(m.index, end));
    re.lastIndex = end;
  }
  return blocks;
}

/** Top-level `prelude { body }` statements inside one block. */
function statements(block: string): Array<{ prelude: string; body: string }> {
  const inner = block.slice(block.indexOf("{") + 1, block.lastIndexOf("}"));
  const out: Array<{ prelude: string; body: string }> = [];
  let i = 0;
  for (let open = inner.indexOf("{", i); open >= 0; open = inner.indexOf("{", i)) {
    const end = closeBrace(inner, open);
    out.push({ prelude: inner.slice(i, open).trim(), body: inner.slice(open + 1, end - 1).trim() });
    i = end;
  }
  return out;
}

/** Splits a selector list on commas that are not inside parentheses. */
function selectors(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < prelude.length; i++) {
    const ch = prelude[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(prelude.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(prelude.slice(start).trim());
  return out.filter(Boolean);
}

const TARGETS_HTML_OR_BODY = /(^|[\s>+~(])(html|body)(?![\w-])/;
const SCOPED_TO_PORTAL = /^(html|body):has\([^)]*\.doc-print-portal\)/;

/** Print rules that would change printing outside the docs editor. */
function unscopedPrintRules(css: string): string[] {
  const problems: string[] = [];
  for (const block of printBlocks(css)) {
    for (const { prelude } of statements(block)) {
      if (prelude.startsWith("@page")) {
        if (!/^@page\s+[A-Za-z_][\w-]*/.test(prelude)) problems.push(prelude);
        continue;
      }
      for (const selector of selectors(prelude)) {
        if (TARGETS_HTML_OR_BODY.test(selector) && !SCOPED_TO_PORTAL.test(selector)) problems.push(selector);
      }
    }
  }
  return problems;
}

describe("docs print CSS scope", () => {
  test("the checker flags the original unscoped rules", () => {
    const unscoped = `@media print {
      @page { margin: 1in; }
      html, body { height: auto !important; }
      body { display: block !important; }
      body > *:not(.doc-print-portal) { display: none !important; }
      .doc-print-portal { display: block !important; }
    }`;
    expect(unscopedPrintRules(unscoped)).toEqual(["@page", "html", "body", "body", "body > *:not(.doc-print-portal)"]);
  });

  test("globals.css has a docs print block and every html/body/@page rule in it is scoped", () => {
    const blocks = printBlocks(GLOBALS);
    expect(blocks.some((block) => block.includes(PORTAL))).toBe(true);
    expect(unscopedPrintRules(GLOBALS)).toEqual([]);
  });

  test("each named @page is used by the print portal", () => {
    for (const block of printBlocks(GLOBALS)) {
      const rules = statements(block);
      const portalBodies = rules
        .filter(({ prelude }) => selectors(prelude).includes(PORTAL))
        .map(({ body }) => body)
        .join(";");
      for (const { prelude } of rules) {
        const name = /^@page\s+([A-Za-z_][\w-]*)/.exec(prelude)?.[1];
        if (name) expect(portalBodies).toMatch(new RegExp(`(^|[;\\s])page\\s*:\\s*${name}(\\s*;|\\s*$|\\s*!)`));
      }
    }
  });

  test("Tailwind's Lightning CSS pass keeps the scoped selectors and the named page", () => {
    const block = printBlocks(GLOBALS).find((b) => b.includes(PORTAL));
    expect(block).toBeDefined();
    // Same options as @tailwindcss/node's optimizer (node_modules/@tailwindcss/node/dist/index.mjs).
    const result = transform({
      filename: "globals.css",
      code: Buffer.from(block ?? ""),
      minify: true,
      drafts: { customMedia: true },
      nonStandard: { deepSelectorCombinator: true },
      include: Features.Nesting | Features.MediaQueries,
      exclude: Features.LogicalProperties | Features.DirSelector | Features.LightDark,
      targets: { safari: (16 << 16) | (4 << 8), ios_saf: (16 << 16) | (4 << 8), firefox: 128 << 16, chrome: 111 << 16 },
      errorRecovery: true,
    });
    const out = result.code.toString();
    expect(result.warnings).toEqual([]);
    expect(out).toMatch(/html:has\(\s*>\s*body\s*>\s*\.doc-print-portal\s*\)/);
    // The minifier drops the redundant `*` in `> *:not(…)`.
    expect(out).toMatch(/body:has\(\s*>\s*\.doc-print-portal\s*\)\s*>\s*\*?:not\(\.doc-print-portal\)\{display:none!important/);
    expect(out).toMatch(/@page doc-print\{margin:1in\}/);
    expect(out).toMatch(/page:doc-print/);
    expect(out).not.toMatch(/@page\{/);
  });
});
