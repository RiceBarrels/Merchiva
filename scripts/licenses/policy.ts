// License policy for everything that ships to a browser, the Capacitor apps or Tauri. All policy is data: the
// generator (scripts/licenses/generate.ts) and the guard tests (scripts/tests/legal/*) read it from here.
// Adding an entry to ELECTIONS or EXCEPTIONS needs the user's yes.

/** Roots never imported by client-reachable code. Enforced by scripts/tests/legal/license-policy.test.ts. */
export const SERVER_ONLY_ROOTS: Readonly<Record<string, string>> = {
  vercel: "Vercel CLI (deploy tooling)",
  bun: "Bun runtime binary used by scripts",
  shadcn: "component generator CLI; its stylesheet ships and is listed through STYLE_ONLY_ROOTS",
  "@capacitor/cli": "native project tooling",
  stripe: "server SDK (app/api/billing/*)",
  square: "server SDK (app/api/square/*)",
  resend: "server e-mail SDK",
  "web-push": "server push sender",
  "@workos-inc/node": "server auth SDK",
  "@modelcontextprotocol/sdk": "server MCP",
  ink: "terminal client (cli/)",
  "ink-text-input": "terminal client (cli/)",
  openai: "server only",
  ai: "server only (app/api/*, lib/merchiva/tools.ts)",
  "@ai-sdk/openai": "server only",
  jose: "server JWT verification (lib/auth/verify-token.ts)",
  "@types/turndown": "type declarations only",
};

/**
 * Files outside app/api that import a SERVER_ONLY_ROOTS package without `import "server-only"`. Each reason names
 * every importer, checked when the entry was written; the transitive check in license-policy.test.ts still proves
 * that no "use client" file reaches them.
 */
export const SERVER_IMPORT_ALLOWLIST: Readonly<Record<string, string>> = {
  "lib/stripe.ts": "stripe; imported only by app/api/billing/* and app/api/admins/coupons/*",
  "lib/email/resend.ts": "resend; imported only by app/api/suppliers/* and app/api/team/send-invite-email",
  "lib/auth/workos.ts": "@workos-inc/node; imported only by app/api/auth/*",
  "lib/auth/verify-token.ts": "jose; imported only by app/api/** route handlers (billing, drive routes via lib/drive/server/deps.ts)",
};

/** devDependencies whose output ships (Tailwind preflight CSS). */
export const EXTRA_ROOTS: readonly string[] = ["tailwindcss"];

/**
 * SERVER_ONLY_ROOTS whose stylesheet an app stylesheet `@import`s, so it ships in every client CSS bundle. Each is
 * listed as one npm entry without its dependency closure (the rest of the package is tooling). Enforced by
 * scripts/tests/legal/license-policy.test.ts: every package an app stylesheet imports is listed, and every entry here
 * is still imported.
 */
export const STYLE_ONLY_ROOTS: Readonly<Record<string, string>> = {
  shadcn: "shadcn/tailwind.css, @imported by app/globals.css (the data-* variants, accordion keyframes, no-scrollbar)",
};

/** Skipped: lock meta has `os`/`cpu` (native binaries), or the name matches a build/server-only binary. */
export const NATIVE_OR_SERVER_PATTERNS: readonly RegExp[] = [
  /^sharp$/, /^@img\//, /^@next\/swc-/, /^@esbuild\//, /^@msgpackr-extract\//, /^@emnapi\//,
];

/**
 * Declared dependency edges the closure does not follow, because no file of the depending package imports the
 * dependency (so nothing of it can reach a bundle). scripts/tests/legal/license-policy.test.ts greps the depending
 * package's files to prove it. The dependency stays in the set if any other distributed package needs it.
 */
export const UNUSED_DEPENDENCY_EDGES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  spacetimedb: { prettier: "declared for code generation; no file of the installed spacetimedb package imports it" },
};

/**
 * Packages that vendor other libraries in a sub-folder, each with its own license file. Those files are read as
 * well as the top-level ones (victory-vendor ships the d3 modules it re-exports under lib-vendor/<name>/LICENSE).
 */
export const NESTED_LICENSE_DIRS: Readonly<Record<string, string>> = {
  "victory-vendor": "lib-vendor",
};

/** Order = election preference. */
export const ALLOWED_LICENSES = [
  "MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "0BSD", "MIT-0", "Zlib",
  "CC0-1.0", "Unlicense", "BlueOak-1.0.0", "Python-2.0", "CC-BY-4.0", "OFL-1.1",
] as const;
export const ALLOWED_EXCEPTIONS = ["LLVM-exception"] as const;
export const NEEDS_ELECTION_RE = /GPL|MPL|EPL|CDDL|SEE LICENSE IN/i;

export const ELECTIONS: Readonly<Record<string, { elected: string; note: string }>> = {
  jszip: { elected: "MIT", note: "JSZip is dual-licensed (MIT OR GPL-3.0-or-later). Merchiva uses it under the MIT license." },
  dompurify: { elected: "Apache-2.0", note: "DOMPurify is dual-licensed (MPL-2.0 OR Apache-2.0). Merchiva uses it under the Apache License 2.0." },
  rgbcolor: { elected: "MIT", note: "rgbcolor declares \"MIT OR SEE LICENSE IN FEEL-FREE.md\". Merchiva uses it under the MIT license." },
  "@tauri-apps/api": { elected: "MIT", note: "Dual-licensed (Apache-2.0 OR MIT). Merchiva uses it under the MIT license." },
};

export const LICENSE_OVERRIDES: Readonly<Record<string, { license: string; reason: string }>> = {
  spacetimedb: {
    license: "BUSL-1.1",
    reason: "package.json says ISC; the shipped LICENSE.txt is the SpacetimeDB Business Source License 1.1.",
  },
  "ot-text-unicode": {
    license: "MIT",
    reason: "package.json says ISC; the package ships no license file, and the License section of its README grants the MIT license.",
  },
};

/**
 * Distributed packages allowed despite a license outside ALLOWED_LICENSES. `approvedBy: "pending-user"` blocks a
 * release (`generate.ts --release` exits 1); any other value names the decision that approved the entry.
 */
export const EXCEPTIONS: Readonly<Record<string, { license: string; approvedBy: "pending-user" | string; reason: string }>> = {
  spacetimedb: {
    license: "BUSL-1.1",
    approvedBy: "Project decision U16 (2026-09-26): documented pre-existing exception, not a release blocker. Not a counsel review.",
    reason:
      "Pre-existing core client SDK, not introduced by Drive. The Additional Use Grant allows production use (no more than one SpacetimeDB instance in production, not offered as a Database Service). Change Date 2031-09-08.",
  },
  // Data inlined in Univer packages (upstream.ts BUNDLES) under permissive licenses that are not on ALLOWED_LICENSES.
  "Unicode Character Database": {
    license: "Unicode-3.0",
    approvedBy: "Orchestrator review 2026-09-27: permissive, notice-only license; the notice ships in /licenses (user rule: permissive licenses only).",
    reason: "Unicode data under the Unicode License v3, a permissive license whose copyright and permission notice accompanies every copy.",
  },
  "Unicode CLDR": {
    license: "Unicode-3.0",
    approvedBy: "Orchestrator review 2026-09-27: permissive, notice-only license; the notice ships in /licenses (user rule: permissive licenses only).",
    reason: "Unicode data under the Unicode License v3, a permissive license whose copyright and permission notice accompanies every copy.",
  },
  "hyph-en-us": {
    license: "FSFAP-no-warranty-disclaimer",
    approvedBy: "Orchestrator review 2026-09-27: permissive, notice-only license; the notice ships in /licenses (user rule: permissive licenses only).",
    reason: "All-permissive notice: copying and distribution, with or without modification, are permitted provided the copyright notice and the notice are preserved.",
  },
};

/** Never allowed in package.json, overrides or the lockfile (matched against package NAMES, aliases included). */
export const FORBIDDEN_PACKAGES: readonly RegExp[] = [
  /^@univerjs-pro\//,
  /^@univerjs\/preset-[a-z0-9-]+-(advanced|collaboration)$/,
  /^hyperformula$/,
  /^handsontable$/,
  /^@handsontable\//,
  /^xlsx$/,
];

/** Never imported from app/ components/ lib/ spacetimedb/src/ cli/ (matched against the import specifier). */
export const FORBIDDEN_IMPORT_SPECIFIERS: readonly RegExp[] = [
  /^@univerjs-pro\//,
  /^@univerjs\/preset-[a-z0-9-]+-(advanced|collaboration)(\/|$)/,
  /^hyperformula(\/|$)/,
  /^handsontable(\/|$)/,
  /^@handsontable\//,
  /^xlsx(\/|$)/,
];

/** Office dependencies pinned to an exact version in package.json, and resolved to it in bun.lock. */
export const PINNED_VERSIONS: Readonly<Record<string, string>> = {
  "@univerjs/engine-formula": "1.0.2",
  "@univerjs/preset-sheets-conditional-formatting": "1.0.2",
  "@univerjs/preset-sheets-core": "1.0.2",
  "@univerjs/preset-sheets-data-validation": "1.0.2",
  "@univerjs/preset-sheets-drawing": "1.0.2",
  "@univerjs/preset-sheets-filter": "1.0.2",
  "@univerjs/preset-sheets-find-replace": "1.0.2",
  "@univerjs/preset-sheets-hyper-link": "1.0.2",
  "@univerjs/preset-sheets-note": "1.0.2",
  "@univerjs/preset-sheets-sort": "1.0.2",
  "@univerjs/presets": "1.0.2",
  "@vercel/blob": "2.8.0",
  exceljs: "4.4.0",
  pptxgenjs: "4.0.1",
  pptxtojson: "2.2.0",
  "react-moveable": "0.56.0",
  "react-selecto": "1.26.3",
  rxjs: "7.8.2",
};

/** package.json `overrides` that must stay: https (empty placeholder pulled in by pptxgenjs), unzipper (drops `buffers`). */
export const PINNED_OVERRIDES: Readonly<Record<string, string>> = {
  https: "1.0.0",
  unzipper: "0.12.3",
};

/** Every lock package in `scope` moves in lockstep at `version`, except the listed ones. */
export const UNIVER_LOCKSTEP = { scope: "@univerjs/", version: "1.0.2", except: ["@univerjs/icons"] } as const;

/** Floors for every lock entry of a name, nested copies included. pptxtojson ≤ 0.1.2 was GPL-3.0 / AGPL-3.0. */
export const MIN_VERSIONS: Readonly<Record<string, string>> = {
  pptxtojson: ">=1.0.0",
};

/** Unlicensed packages the unzipper override keeps out of the lockfile. */
export const MUST_BE_ABSENT: readonly string[] = ["buffers", "binary"];
