import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lockKeySegments, parseJsonc, readLockfile, resolveDependency, splitNameVersion } from "../../licenses/lockfile";
import { extractCopyrights, findInstalledCopy, inSkippedFolder, normalizeRepository } from "../../licenses/package-files";
import { evaluateLicense, sniffLicenseText } from "../../licenses/spdx";
import { apache2Text, mitText } from "../../licenses/spdx-texts";

/* Unit cases for the license tooling's parsers (scripts/licenses/*). */

const ROOT = join(import.meta.dir, "..", "..", "..");

describe("evaluateLicense", () => {
  test("allowed ids, AND, and case-insensitive ids", () => {
    expect(evaluateLicense("x", "MIT")).toEqual({ ok: true });
    expect(evaluateLicense("x", "(MIT AND Zlib)")).toEqual({ ok: true });
    expect(evaluateLicense("x", "mit")).toEqual({ ok: true });
    expect(evaluateLicense("x", "Apache-2.0 WITH LLVM-exception")).toEqual({ ok: true });
  });
  test("an OR of permissive licenses elects the preferred one", () => {
    expect(evaluateLicense("x", "MIT OR Apache-2.0")).toEqual({ ok: true, elected: "MIT" });
    expect(evaluateLicense("x", "(Apache-2.0 OR MIT) AND ISC")).toEqual({ ok: true, elected: "(MIT) AND ISC" });
  });
  test("an OR with a copyleft or file-reference alternative needs a recorded election", () => {
    const verdict = evaluateLicense("not-in-elections", "(MIT OR GPL-3.0-or-later)");
    expect(verdict.ok).toBe(false);
    expect(evaluateLicense("jszip", "(MIT OR GPL-3.0-or-later)")).toEqual({ ok: true, elected: "MIT" });
    expect(evaluateLicense("rgbcolor", "MIT OR SEE LICENSE IN FEEL-FREE.md")).toEqual({ ok: true, elected: "MIT" });
    expect(evaluateLicense("dompurify", "(MPL-2.0 OR Apache-2.0)")).toEqual({ ok: true, elected: "Apache-2.0" });
  });
  test("disallowed, empty and unparseable expressions fail", () => {
    for (const expr of ["GPL-3.0", "BUSL-1.1", "UNLICENSED", "", "MIT AND GPL-2.0", "(MIT", "SEE LICENSE IN LICENSE.txt", "Apache-2.0 WITH Classpath-exception-2.0"]) {
      expect(evaluateLicense("x", expr).ok).toBe(false);
    }
  });
});

describe("sniffLicenseText", () => {
  test("finds source-available and copyleft license headings", () => {
    expect(sniffLicenseText(readFileSync(join(ROOT, "node_modules/spacetimedb/LICENSE.txt"), "utf8"))).toBe("BUSL");
    expect(sniffLicenseText("GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3")).toBe("AGPL");
    expect(sniffLicenseText("GNU LESSER GENERAL PUBLIC LICENSE")).toBe("LGPL");
    expect(sniffLicenseText("GNU GENERAL PUBLIC LICENSE\nVersion 2")).toBe("GPL");
    expect(sniffLicenseText(mitText(["Copyright (c) 2020 A"]))).toBeNull();
  });
});

describe("extractCopyrights", () => {
  test("keeps holder lines and drops license prose, clauses and placeholders", () => {
    const text = [
      "MIT License",
      "",
      "Copyright (c) 2020 A <a@example.com>",
      " * Copyright 2019 B",
      "(c) 2023 Clockwork Laboratories, Inc.",
      "© Mathias Bynens",
      "Copyright &lt;c@example.com&gt; C",
      "The above copyright notice and this permission notice shall be included",
      "copyright notice and this permission notice appear in all copies.",
      "COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM",
      "(c) You must retain, in the Source form of any Derivative Works",
      "Copyright [yyyy] [name of copyright owner]",
      "Copyright {yyyy} {name of copyright owner}",
      "Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>",
      "copyright treaty adopted on 20 December 1996",
      "Copyright",
      "Copyright (c) 2020 A <a@example.com>",
    ].join("\n");
    expect(extractCopyrights(text)).toEqual([
      "Copyright (c) 2020 A <a@example.com>",
      "Copyright 2019 B",
      "(c) 2023 Clockwork Laboratories, Inc.",
      "© Mathias Bynens",
      "Copyright <c@example.com> C",
    ]);
  });
});

describe("templates", () => {
  test("the MIT template reproduces a real installed LICENSE", () => {
    const real = readFileSync(join(ROOT, "node_modules/pptxtojson/LICENSE"), "utf8").replace(/\r\n?/g, "\n").trim();
    expect(mitText(["Copyright (c) 2020-PRESENT pipipi-pikachu"])).toBe(real);
  });
  test("apache2Text is the verbatim Apache-2.0 file", () => {
    expect(apache2Text(ROOT)).toContain("Apache License\n                           Version 2.0, January 2004");
  });
});

describe("lockfile helpers", () => {
  test("names parse at the last @, keys split scope-aware", () => {
    expect(splitNameVersion("@univerjs/core@1.0.2")).toEqual(["@univerjs/core", "1.0.2"]);
    expect(splitNameVersion("jszip@3.10.2")).toEqual(["jszip", "3.10.2"]);
    expect(lockKeySegments("a/@s/b/c")).toEqual(["a", "@s/b", "c"]);
  });
  test("JSONC fallback parse accepts trailing commas", () => {
    expect(parseJsonc('{ "a": [1, 2,], "b": { "c": "x,}", }, }')).toEqual({ a: [1, 2], b: { c: "x,}" } });
  });
  test("dependencies resolve to the nearest nested copy, then the hoisted one", () => {
    const lock = readLockfile(ROOT);
    const nested = [...lock.packages.keys()].find((k) => k.includes("/") && !k.startsWith("@") && lock.packages.has(k.split("/")[0]));
    expect(nested).toBeDefined();
    const [parent, ...rest] = (nested as string).split("/");
    expect(resolveDependency(lock, parent, rest.join("/"))).toBe(nested as string);
    expect(resolveDependency(lock, "does-not-exist", "react")).toBe("react");
    expect(resolveDependency(lock, "react", "no-such-package-anywhere")).toBeNull();
  });
});

describe("normalizeRepository", () => {
  test("turns git URLs and shorthands into https URLs", () => {
    expect(normalizeRepository("git+https://github.com/a/b.git")).toBe("https://github.com/a/b");
    expect(normalizeRepository({ url: "git://github.com/a/b.git" })).toBe("https://github.com/a/b");
    expect(normalizeRepository("git@github.com:a/b")).toBe("https://github.com/a/b");
    expect(normalizeRepository("github:a/b")).toBe("https://github.com/a/b");
    expect(normalizeRepository("a/b")).toBe("https://github.com/a/b");
    expect(normalizeRepository("")).toBeUndefined();
  });
});

describe("findInstalledCopy", () => {
  test("test / fixture folders are judged below the root only (a checkout under a /test/ folder still finds its packages)", () => {
    const base = mkdtempSync(join(tmpdir(), "licenses-"));
    try {
      const root = join(base, "test", "repo");
      const nm = join(root, "node_modules");
      const install = (dir: string, name: string) => {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "package.json"), JSON.stringify({ name }));
      };
      install(join(nm, "a"), "a");
      install(join(nm, "@s", "b"), "@s/b");
      install(join(nm, "a", "node_modules", "test"), "test");
      install(join(nm, "a", "node_modules", "test", "node_modules", "util"), "util");
      expect(findInstalledCopy(root, "a")).toBe(join(nm, "a"));
      expect(findInstalledCopy(root, "@s/b")).toBe(join(nm, "@s", "b"));
      expect(findInstalledCopy(root, "test")).toBe(join(nm, "a", "node_modules", "test"));
      expect(findInstalledCopy(root, "util")).toBeNull();
      expect(inSkippedFolder(root, nm)).toBe(false);
      expect(inSkippedFolder(root, join(nm, "a", "node_modules", "test", "node_modules"))).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
