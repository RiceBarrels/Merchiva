// One-shot codemod: replace `<Loader2 ... animate-spin ... />` with `<Spinner size={N} />`
// and add `import { Spinner } from "@/components/ui/loaders/geometric";` to each file.
//
// Conservative — only matches self-closing single-line tags. Loader2 used as a
// non-spinning icon (no `animate-spin`) is left alone. After the run, files with
// no remaining Loader2 usage get their `Loader2` import stripped.
//
// Usage: bun scripts/replace-loader2-spinner.ts

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SCAN_DIRS = ["app", "components"];

// Tailwind h-{n} → px (h-4 = 16px). Covers the sizes used in the repo.
const SIZE_PX: Record<string, number> = {
  "2.5": 10, "3": 12, "3.5": 14, "4": 16, "5": 20, "6": 24, "7": 28, "8": 32, "10": 40, "12": 48,
};

function listFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === ".next" || name === "dist") continue;
      listFiles(full, out);
    } else if (name.endsWith(".tsx") || name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

// Match `<Loader2 ... />` self-closing tags containing `animate-spin` in their
// className. Tolerates attribute order, extra props (key, style, title), and
// either string or backtick className.
const TAG_RE = /<Loader2\b([^/>]*?)\/>/g;

function extractClassName(attrs: string): string | null {
  // className="..." OR className={`...`} OR className={"..."}
  const m = attrs.match(/className\s*=\s*(?:"([^"]*)"|\{\s*`([^`]*)`\s*\}|\{\s*"([^"]*)"\s*\})/);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

function sizeFromClass(cls: string): number {
  const m = cls.match(/h-(\d+(?:\.\d+)?)/);
  if (!m) return 16;
  return SIZE_PX[m[1]] ?? 16;
}

function colorClassFromClass(cls: string): string {
  // Preserve color/spacing classes that should stay on the Spinner wrapper
  // (mr-*, ml-*, text-*, shrink-0, opacity-*). Drop h-*, w-*, animate-spin.
  const kept: string[] = [];
  for (const part of cls.split(/\s+/).filter(Boolean)) {
    if (/^h-/.test(part) || /^w-/.test(part) || part === "animate-spin") continue;
    kept.push(part);
  }
  return kept.join(" ");
}

function transformFile(path: string): { changed: boolean; replaced: number } {
  let src = readFileSync(path, "utf8");
  const orig = src;
  let replaced = 0;

  src = src.replace(TAG_RE, (full, attrs: string) => {
    const cls = extractClassName(attrs);
    if (cls === null || !/\banimate-spin\b/.test(cls)) return full;
    const size = sizeFromClass(cls);
    const kept = colorClassFromClass(cls);
    replaced++;
    const classProp = kept ? ` className="${kept}"` : "";
    return `<Spinner size={${size}}${classProp} />`;
  });

  if (src === orig) return { changed: false, replaced: 0 };

  // Manage imports. Add Spinner if not already imported.
  const hasSpinnerImport = /from\s+["']@\/components\/ui\/loaders\/geometric["']/.test(src);
  if (!hasSpinnerImport) {
    // Place the import right AFTER the last existing import statement, anchored
    // to a real line start (avoid matching `import` inside comments/strings).
    const importRe = /^[ \t]*import\s[\s\S]*?from\s+["'][^"']+["']\s*;?[ \t]*\n/gm;
    let lastEnd = -1;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src)) !== null) {
      lastEnd = m.index + m[0].length;
    }
    const inj = `import { Spinner } from "@/components/ui/loaders/geometric";\n`;
    if (lastEnd > 0) {
      src = src.slice(0, lastEnd) + inj + src.slice(lastEnd);
    } else {
      // No imports at all — prepend after any leading "use client" + blank lines.
      const leading = src.match(/^(?:(?:"use client";|'use client';)\n+)?/);
      const idx = leading ? leading[0].length : 0;
      src = src.slice(0, idx) + inj + src.slice(idx);
    }
  } else {
    // Spinner export already pulled? If not, add it to the existing import.
    src = src.replace(
      /import\s*\{([^}]*)\}\s*from\s*["']@\/components\/ui\/loaders\/geometric["']/,
      (m, inside: string) => {
        if (/\bSpinner\b/.test(inside)) return m;
        return `import { Spinner,${inside}} from "@/components/ui/loaders/geometric"`;
      },
    );
  }

  // If no <Loader2 ... is left in the file body, drop Loader2 from lucide imports.
  if (!/<Loader2\b/.test(src)) {
    src = src.replace(
      /import\s*\{([^}]*)\}\s*from\s*["']lucide-react["'](\s*;?)/g,
      (m, inside: string, semi: string) => {
        const items = inside.split(",").map((s) => s.trim()).filter((s) => s && s !== "Loader2");
        if (items.length === 0) return ""; // drop empty import
        return `import { ${items.join(", ")} } from "lucide-react"${semi}`;
      },
    );
  }

  writeFileSync(path, src);
  return { changed: true, replaced };
}

const files: string[] = [];
for (const d of SCAN_DIRS) listFiles(join(ROOT, d), files);

let totalReplaced = 0;
let filesChanged = 0;
for (const f of files) {
  try {
    const { changed, replaced } = transformFile(f);
    if (changed) {
      filesChanged++;
      totalReplaced += replaced;
      console.log(`  ${relative(ROOT, f)} — ${replaced} replaced`);
    }
  } catch (err) {
    console.error(`! ${relative(ROOT, f)} —`, err);
  }
}

console.log(`\nDone. ${totalReplaced} <Loader2 animate-spin /> → <Spinner /> across ${filesChanged} files.`);
