// Slides never turns strings into markup (slides.md §13): slide text, imported HTML and clipboard content are
// rendered as React elements or parsed with a tokenizer, never assigned as HTML. This guard greps every source file
// under components/slides and lib/slides, so a later unit cannot add such a sink without failing the suite.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FOLDERS = ["components/slides", "lib/slides"];
const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs)$/;

/** Markup sinks: React's raw-HTML prop, assignments to inner/outer HTML, and the other string-to-DOM APIs. */
const SINKS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "dangerouslySetInnerHTML", re: /dangerouslySetInnerHTML/ },
  { name: "innerHTML/outerHTML assignment", re: /\.(inner|outer)HTML\s*(\+?=)(?!=)/ },
  { name: "insertAdjacentHTML", re: /insertAdjacentHTML/ },
  { name: "createContextualFragment", re: /createContextualFragment/ },
  { name: "document.write", re: /document\.write(ln)?\s*\(/ },
];

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (SOURCE_RE.test(name)) out.push(path);
  }
  return out;
}

describe("no HTML string sinks in Slides", () => {
  const files = FOLDERS.flatMap((folder) => sourceFiles(join(ROOT, folder)));

  test("the scan covers the renderer and the model", () => {
    const rel = files.map((f) => relative(ROOT, f));
    expect(rel).toContain("components/slides/canvas/rich-text-view.tsx");
    expect(rel).toContain("components/slides/canvas/slide-view.tsx");
    expect(rel).toContain("lib/slides/model/validate.ts");
  });

  test("no file uses a markup sink", () => {
    const hits: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const sink of SINKS) {
          if (sink.re.test(line)) hits.push(`${relative(ROOT, file)}:${i + 1} ${sink.name}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });

  test("the patterns catch what they are meant to", () => {
    const sample = [
      "<div dangerouslySetInnerHTML={{ __html: x }} />",
      "el.innerHTML = html;",
      "el.outerHTML += html;",
      "node.insertAdjacentHTML('beforeend', x)",
      "range.createContextualFragment(x)",
      "document.write(x)",
    ];
    for (const line of sample) expect(SINKS.some((s) => s.re.test(line))).toBe(true);
    for (const line of ["if (el.innerHTML === x) {}", "const innerHTMLish = 1;", "// the innerHTML of nothing"]) {
      expect(SINKS.some((s) => s.re.test(line))).toBe(false);
    }
  });
});
