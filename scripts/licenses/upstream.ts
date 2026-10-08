// License facts the installed files cannot give: packages whose tarball ships no license file (UPSTREAM), extra
// copyright lines (ATTRIBUTIONS), inlined bundles (BUNDLES), code vendored by Next (VENDORED) and non-npm assets
// (ASSETS). Every UPSTREAM line was checked against the `source` it names on 2026-09-27. For inlined code whose
// version is not recorded in the bundle, `source` is the release the bundle's dependency range resolved to when the
// host was published (exceljs 4.4.0: 2023-10-19, built with browserify 16.5.2).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface UpstreamLicense {
  license: string;
  copyright: string[];
  /** Where the license and the copyright lines were checked. */
  source: string;
  /** "template" (default): the spdx-texts.ts template filled with `copyright`. Any other value is the literal text. */
  text?: "template" | string;
  /** English note for the .txt notices (never rendered in the UI). */
  note?: string;
}

/** Verbatim upstream license files, kept in scripts/licenses/upstream-texts/. */
function upstreamText(file: string): string {
  return readFileSync(join(import.meta.dir, "upstream-texts", file), "utf8");
}

const RADIX: UpstreamLicense = {
  license: "MIT",
  copyright: ["Copyright (c) 2022 WorkOS"],
  source: "https://github.com/radix-ui/primitives/blob/main/LICENSE",
};
const CRYPTO_BROWSERIFY_CONTRIBUTORS = ["Copyright (c) 2017 crypto-browserify contributors"];
const npmLicense = (spec: string, file = "LICENSE") => `https://registry.npmjs.org tarball ${spec}, ${file}`;
const readmeLicense = (spec: string) => `https://registry.npmjs.org tarball ${spec}, README License section (no license file)`;

/** Keyed by "name@version" (exact) or "name" (any version). */
export const UPSTREAM: Readonly<Record<string, UpstreamLicense>> = {
  // Installed packages whose tarball has no license file.
  "@univerjs/protocol": {
    license: "Apache-2.0",
    copyright: ["Copyright 2023-present DreamNum Co., Ltd."],
    source: "copyright from the package's own source headers (lib/types/*.d.ts); terms: https://github.com/dream-num/univer/blob/dev/LICENSE",
  },
  "ot-json1": { license: "ISC", copyright: ["Copyright (c) 2013-2018, Joseph Gentle <me@josephg.com>"], source: readmeLicense("ot-json1@1.0.2") },
  "ot-text-unicode": { license: "MIT", copyright: ["Copyright 2011 ottypes library contributors"], source: readmeLicense("ot-text-unicode@4.0.0") },
  unicount: { license: "ISC", copyright: ["Copyright 2019 Joseph Gentle"], source: readmeLicense("unicount@1.1.0") },
  "franc-min": {
    license: "MIT",
    copyright: [
      "Copyright (c) 2014 Titus Wormer <tituswormer@gmail.com>",
      "Copyright (c) 2008 Kent S Johnson",
      "Copyright (c) 2006 Jacob R Rideout <kde@jacobrideout.net>",
      "Copyright (c) 2004 Maciej Ceglowski",
    ],
    source: "https://github.com/wooorm/franc/blob/6.2.0/license",
  },
  "react-remove-scroll-bar": {
    license: "MIT",
    copyright: ["Copyright (c) 2025 Anton Korzunov <thekashey@gmail.com>"],
    source: "https://github.com/theKashey/react-remove-scroll-bar/blob/main/LICENSE (the 2.3.8 tarball ships none)",
  },
  "@radix-ui/react-compose-refs": RADIX,
  "@radix-ui/react-context": RADIX,
  "@radix-ui/react-id": RADIX,
  "@radix-ui/react-use-callback-ref": RADIX,
  "@radix-ui/react-use-escape-keydown": RADIX,
  "@radix-ui/react-use-layout-effect": RADIX,
  "victory-vendor": {
    license: "MIT AND ISC",
    copyright: [],
    source: "https://github.com/FormidableLabs/victory/blob/v37.3.6/LICENSE.txt; the vendored d3 licenses are read from lib-vendor/*/LICENSE",
    text: upstreamText("victory@37.3.6.txt"),
  },
  keycon: { license: "MIT", copyright: ["Copyright (c) 2019 Daybrush"], source: "https://github.com/daybrush/keycon/blob/master/LICENSE" },
  "css-styled": { license: "MIT", copyright: ["Copyright (c) 2019 Daybrush"], source: "https://github.com/daybrush/css-styled/blob/master/LICENSE" },
  "@cfcs/core": { license: "MIT", copyright: ["Copyright (c) 2022-present NAVER Corp."], source: "https://github.com/naver/cfcs/blob/main/LICENSE" },
  "@egjs/component": { license: "MIT", copyright: ["Copyright (c) 2015 NAVER Corp."], source: readmeLicense("@egjs/component@3.0.5") },
  "isarray@1.0.0": {
    license: "MIT",
    copyright: ["Copyright (c) 2013 Julian Gruber <julian@juliangruber.com>"],
    source: "https://github.com/juliangruber/isarray/blob/master/LICENSE and the 1.0.0 README",
  },
  "https@1.0.0": {
    license: "ISC",
    copyright: [],
    source: "https://registry.npmjs.org/https (1.0.0 is the only version: package.json only, no code)",
    note: "Empty placeholder pinned by package.json overrides; pptxgenjs declares it but never imports it.",
  },
  "client-only": {
    license: "MIT",
    copyright: ["Copyright (c) the client-only authors (published by the React team, https://github.com/facebook/react)"],
    source: "https://registry.npmjs.org/client-only (0.0.1: homepage reactjs.org, bugs github.com/facebook/react)",
    note: "Marker package (an empty module and an import guard). It ships no license file and names no copyright holder.",
  },
  "@next/env": { license: "MIT", copyright: ["Copyright (c) 2025 Vercel, Inc."], source: "https://github.com/vercel/next.js/blob/v16.2.7/license.md" },
  "saxes@5.0.1": { license: "ISC", copyright: [], source: "https://github.com/lddubeau/saxes/blob/v5.0.1/LICENSE", text: upstreamText("saxes@5.0.1.txt") },
  "hash.js": { license: "MIT", copyright: ["Copyright Fedor Indutny, 2014."], source: readmeLicense("hash.js@1.1.7") },
  "is-node-process": {
    license: "MIT",
    copyright: ["Copyright (c) the is-node-process authors (https://github.com/mswjs/is-node-process)"],
    source: "https://github.com/mswjs/is-node-process (MIT per package.json; no license file and no copyright line upstream)",
  },
  // Checked 2026-10-06 against the installed 3.1.2 bundle headers. Keyed by exact version: an upgrade must re-read
  // the header (the copyright years move with each release).
  "survey-core@3.1.2": {
    license: "MIT",
    copyright: ["Copyright (c) 2015-2026 Devsoft Baltic OÜ"],
    source:
      "bundle header of survey.core.js (tarball ships no license file); terms: https://github.com/surveyjs/survey-library/blob/master/LICENSE",
  },
  "survey-react-ui@3.1.2": {
    license: "MIT",
    copyright: ["Copyright (c) 2015-2026 Devsoft Baltic OÜ"],
    source:
      "bundle header of survey-react-ui.js (tarball ships no license file); terms: https://github.com/surveyjs/survey-library/blob/master/LICENSE",
  },

  // Inlined in exceljs/dist/exceljs.bare.min.js and installed nowhere.
  "crypto-browserify": { license: "MIT", copyright: ["Copyright (c) 2013 Dominic Tarr"], source: npmLicense("crypto-browserify@3.12.0") },
  "browserify-aes": { license: "MIT", copyright: ["Copyright (c) 2014-2017 browserify-aes contributors"], source: npmLicense("browserify-aes@1.2.0") },
  "browserify-cipher": { license: "MIT", copyright: ["Copyright (c) 2014-2017 Calvin Metcalf & contributors"], source: npmLicense("browserify-cipher@1.0.1") },
  "browserify-des": {
    license: "MIT",
    copyright: ["Copyright (c) 2014-2017 Calvin Metcalf, Fedor Indutny & contributors"],
    source: npmLicense("browserify-des@1.0.2", "license"),
  },
  "browserify-rsa": { license: "MIT", copyright: ["Copyright (c) 2014-2016 Calvin Metcalf & contributors"], source: npmLicense("browserify-rsa@4.1.0") },
  "browserify-sign": {
    license: "ISC",
    copyright: ["Copyright (c) 2014-2015 Calvin Metcalf and browserify-sign contributors"],
    source: npmLicense("browserify-sign@4.2.1"),
  },
  "buffer-xor": { license: "MIT", copyright: ["Copyright (c) 2015 Daniel Cousens"], source: npmLicense("buffer-xor@1.0.3") },
  "cipher-base": { license: "MIT", copyright: CRYPTO_BROWSERIFY_CONTRIBUTORS, source: npmLicense("cipher-base@1.0.4") },
  "create-ecdh": { license: "MIT", copyright: ["Copyright (c) 2014-2017 createECDH contributors"], source: npmLicense("create-ecdh@4.0.4") },
  "create-hash": { license: "MIT", copyright: CRYPTO_BROWSERIFY_CONTRIBUTORS, source: npmLicense("create-hash@1.2.0") },
  "create-hmac": { license: "MIT", copyright: CRYPTO_BROWSERIFY_CONTRIBUTORS, source: npmLicense("create-hmac@1.1.7") },
  "evp_bytestokey": { license: "MIT", copyright: CRYPTO_BROWSERIFY_CONTRIBUTORS, source: npmLicense("evp_bytestokey@1.0.3") },
  "parse-asn1": { license: "ISC", copyright: ["Copyright (c) 2017, crypto-browserify contributors"], source: npmLicense("parse-asn1@5.1.6") },
  "diffie-hellman": { license: "MIT", copyright: ["Copyright (c) 2017 Calvin Metcalf"], source: npmLicense("diffie-hellman@5.0.3") },
  "public-encrypt": { license: "MIT", copyright: ["Copyright (c) 2017 Calvin Metcalf"], source: npmLicense("public-encrypt@4.0.3") },
  pbkdf2: { license: "MIT", copyright: ["Copyright (c) 2014 Daniel Cousens"], source: npmLicense("pbkdf2@3.1.2") },
  "hash-base": { license: "MIT", copyright: ["Copyright (c) 2016 Kirill Fomichev"], source: npmLicense("hash-base@3.1.0") },
  "md5.js": { license: "MIT", copyright: ["Copyright (c) 2016 Kirill Fomichev"], source: npmLicense("md5.js@1.3.5") },
  randombytes: { license: "MIT", copyright: ["Copyright (c) 2017 crypto-browserify"], source: npmLicense("randombytes@2.1.0") },
  randomfill: { license: "MIT", copyright: ["Copyright (c) 2017 crypto-browserify"], source: npmLicense("randomfill@1.0.4") },
  ripemd160: { license: "MIT", copyright: ["Copyright (c) 2016 crypto-browserify"], source: npmLicense("ripemd160@2.0.2") },
  "sha.js": { license: "(MIT AND BSD-3-Clause)", copyright: [], source: npmLicense("sha.js@2.4.11"), text: upstreamText("sha.js@2.4.11.txt") },
  elliptic: { license: "MIT", copyright: ["Copyright Fedor Indutny, 2014."], source: readmeLicense("elliptic@6.5.4 (version recorded in the bundle)") },
  "des.js": { license: "MIT", copyright: ["Copyright Fedor Indutny, 2015."], source: readmeLicense("des.js@1.1.0") },
  "hmac-drbg": { license: "MIT", copyright: ["Copyright Fedor Indutny, 2017."], source: readmeLicense("hmac-drbg@1.0.1") },
  "miller-rabin": { license: "MIT", copyright: ["Copyright Fedor Indutny, 2014."], source: readmeLicense("miller-rabin@4.0.1") },
  brorand: { license: "MIT", copyright: ["Copyright Fedor Indutny, 2014."], source: readmeLicense("brorand@1.1.0") },
  "minimalistic-crypto-utils": { license: "MIT", copyright: ["Copyright Fedor Indutny, 2017."], source: readmeLicense("minimalistic-crypto-utils@1.0.1") },
  "browser-pack": {
    license: "MIT",
    copyright: [],
    source: npmLicense("browser-pack@6.1.0"),
    text: upstreamText("browser-pack@6.1.0.txt"),
    note: "The upstream LICENSE names no copyright holder; the package author is James Halliday.",
  },
  "stream-browserify": { license: "MIT", copyright: ["Copyright (c) James Halliday"], source: npmLicense("stream-browserify@2.0.2") },
  "timers-browserify": {
    license: "MIT",
    copyright: [],
    source: npmLicense("timers-browserify@1.4.2", "LICENSE.md"),
    text: upstreamText("timers-browserify@1.4.2.txt"),
  },
  util: { license: "MIT", copyright: ["Copyright Joyent, Inc. and other Node contributors. All rights reserved."], source: npmLicense("util@0.10.4") },

  // Inlined in pptxtojson/dist/index.js (versions recorded in the source map's .pnpm paths) and installed nowhere.
  "buffer-es6": { license: "MIT", copyright: [], source: npmLicense("buffer-es6@4.9.3"), text: upstreamText("buffer-es6@4.9.3.txt") },
  "process-es6": { license: "MIT", copyright: ["Copyright (c) 2013 Roman Shtylman <shtylman@gmail.com>"], source: npmLicense("process-es6@0.11.6") },
  "rollup-plugin-node-builtins": {
    license: "MIT",
    copyright: ["Copyright Joyent, Inc. and other Node contributors.", "Copyright (c) Calvin Metcalf"],
    source: "rollup-plugin-node-builtins@2.1.2 README License section and the inlined files' headers (no license file)",
    note: "package.json says ISC; the README says MIT, with ports of Node/browserify modules under their original licenses. The inlined files are Node.js ports (events, util, stream, string_decoder) carrying the Joyent MIT header. The holder of the plugin's own code is its repository owner, Calvin Metcalf.",
  },
  "rollup-plugin-node-globals": {
    license: "MIT",
    copyright: ["Copyright (c) Calvin Metcalf"],
    source: "rollup-plugin-node-globals@1.4.0 package.json (MIT, author Calvin Metcalf; no license file)",
    note: "The package ships no license file; the holder is the package.json author.",
  },

  // Vendored by Next under next/dist/compiled/* without a license file or without a declared license.
  punycode: { license: "MIT", copyright: ["Copyright Mathias Bynens <https://mathiasbynens.be/>"], source: "https://github.com/mathiasbynens/punycode.js/blob/main/LICENSE-MIT.txt" },
  setimmediate: {
    license: "MIT",
    copyright: ["Copyright (c) 2012 Barnesandnoble.com, llc, Donavon West, and Domenic Denicola"],
    source: "https://github.com/YuzuJS/setImmediate/blob/master/LICENSE.txt",
  },
  "constants-browserify": {
    license: "MIT",
    copyright: ["Copyright (c) 2013 Julian Gruber <julian@juliangruber.com>"],
    source: "https://github.com/juliangruber/constants-browserify/blob/master/LICENSE.md",
  },
  "querystring-es3": {
    license: "MIT",
    copyright: [],
    source: "next/dist/compiled/querystring-es3/LICENSE (MIT terms; the package declares no license)",
  },
  react: { license: "MIT", copyright: [], source: "next/dist/compiled/react/LICENSE (MIT; package.json declares none)" },
  "react-dom": { license: "MIT", copyright: [], source: "next/dist/compiled/react-dom/LICENSE (MIT; package.json declares none)" },
  scheduler: { license: "MIT", copyright: [], source: "next/dist/compiled/scheduler/LICENSE (MIT; package.json declares none)" },
};

/** Extra copyright lines for packages whose license file has none. Keys are names or "scope/*" globs. */
export const ATTRIBUTIONS: Readonly<Record<string, string[]>> = {
  "@univerjs/*": ["Copyright 2023-present DreamNum Co., Ltd."],
};

export interface InlinedPackage {
  name: string;
  license: string;
  copyright: string[];
  repository?: string;
  /** English note for the .txt notices (never rendered in the UI). */
  note?: string;
}
export interface BundleSpec {
  /** npm package that ships the bundle. */
  host: string;
  /** Exact; a mismatch with the installed version is a `bundle-version-drift` problem. */
  version: string;
  /** Bundle path inside the package (must exist). */
  file: string;
  /** Source map: node_modules/<pkg> segments in `sources` name the inlined packages. */
  map?: string;
  /** What the map can't show (vendored src, upstream ports). */
  extra?: InlinedPackage[];
}

const DEVON_GOVETT_MIT = (years: string, name: string): InlinedPackage => ({
  name, license: "MIT", copyright: [`Copyright (c) ${years} Devon Govett`], repository: `https://github.com/foliojs/${name}`,
});
const UNICODE_COPYRIGHT = ["Copyright © 1991-2026 Unicode, Inc."];

// The Univer rows below are ports and data that Univer's sources carry under its own Apache header. Each was matched
// against the upstream release on 2026-09-27 (engine-render: linebreak 1.1.0, unicode-trie 2.0.0, tiny-inflate 1.0.3,
// hyphen 1.10.6 and hyph-utf8's hyph-en-us.tex; core: numfmt 3.2.3; ui: CLDR common/annotations). The Unicode lines
// are the notice of the current Unicode License v3 (https://www.unicode.org/license.txt).
export const BUNDLES: readonly BundleSpec[] = [
  // The app imports only the bare build (lib/sheets/xlsx/xlsx.worker.ts, lib/sheets/xlsx/client.ts).
  { host: "exceljs", version: "4.4.0", file: "dist/exceljs.bare.min.js", map: "dist/exceljs.bare.min.js.map" },
  {
    host: "pptxtojson", version: "2.2.0", file: "dist/index.js", map: "dist/index.js.map",
    extra: [
      { name: "PPTXjs", license: "MIT", copyright: ["Copyright (c) 2017 meshesha"], repository: "https://github.com/meshesha/PPTXjs" },
      { name: "PPTX2HTML", license: "MIT", copyright: ["Copyright (c) 2014 g21589"], repository: "https://github.com/g21589/PPTX2HTML" },
    ],
  },
  {
    host: "pptxgenjs", version: "4.0.1", file: "dist/pptxgen.es.js",
    extra: [{ name: "officegen", license: "MIT", copyright: ["Copyright (c) 2013 Ziv Barber"], repository: "https://github.com/Ziv-Barber/officegen" }],
  },
  {
    host: "@vercel/blob", version: "2.8.0", file: "dist/chunk-YYMLUMXS.js",
    extra: [{ name: "bytes", license: "MIT", copyright: ["Copyright (c) 2012-2014 TJ Holowaychuk", "Copyright (c) 2015 Jed Watson"], repository: "https://github.com/visionmedia/bytes.js" }],
  },
  {
    host: "@univerjs/design", version: "1.0.2", file: "lib/index.js",
    extra: [{ name: "tailwind-merge", license: "MIT", copyright: ["Copyright (c) 2021 Dany Castillo"], repository: "https://github.com/dcastil/tailwind-merge" }],
  },
  {
    host: "@univerjs/engine-render", version: "1.0.2", file: "lib/es/index.js",
    extra: [
      { ...DEVON_GOVETT_MIT("2014-present", "linebreak"), note: "Univer's line breaker (src/components/docs/layout/line-breaker) is a port of linebreak." },
      { ...DEVON_GOVETT_MIT("2018", "unicode-trie"), note: "The upstream license names no holder; Devon Govett is the package author." },
      DEVON_GOVETT_MIT("2015-present", "tiny-inflate"),
      {
        name: "Unicode Character Database",
        license: "Unicode-3.0",
        copyright: UNICODE_COPYRIGHT,
        repository: "https://www.unicode.org/ucd/",
        note: "Line break property data, compiled into the line breaker's trie.",
      },
      {
        name: "hyphen",
        license: "ISC",
        copyright: ["Copyright (c) 2023, Yevhen Tiurin <yevhentiurin@gmail.com>"],
        repository: "https://github.com/ytiurin/hyphen",
        note:
          "Univer's hyphenation code and pattern data are a port of hyphen. Only the American English patterns ship: Merchiva's build replaces the pattern file of every other language with an empty pattern.",
      },
      {
        name: "hyph-en-us",
        license: "FSFAP-no-warranty-disclaimer",
        copyright: ["Copyright (C) 1990, 2004, 2005 Gerard D.C. Kuiken"],
        repository: "https://github.com/hyphenation/tex-hyphen",
        note: "American English hyphenation patterns (hyph-utf8 hyph-en-us.tex), inlined in the hyphen port's format.",
      },
    ],
  },
  {
    host: "@univerjs/core", version: "1.0.2", file: "lib/es/index.js",
    extra: [{
      name: "numfmt",
      license: "MIT",
      copyright: ["Copyright (c) 2020, Borgar Þorsteinsson <borgar@borgar.net>"],
      repository: "https://github.com/borgar/numfmt",
      note: "Univer's number formatter (src/shared/numfmt) is a port of numfmt.",
    }],
  },
  {
    host: "@univerjs/ui", version: "1.0.2", file: "lib/es/locale/en-US.js",
    extra: [{
      name: "Unicode CLDR",
      license: "Unicode-3.0",
      copyright: UNICODE_COPYRIGHT,
      repository: "https://github.com/unicode-org/cldr",
      note: "Emoji annotations (the emoji picker's search keywords), in every Univer UI locale.",
    }],
  },
  {
    host: "@egjs/children-differ", version: "1.0.1", file: "dist/children-differ.js",
    extra: [{ name: "tslib", license: "Apache-2.0", copyright: ["Copyright (c) Microsoft Corporation. All rights reserved."], repository: "https://github.com/microsoft/tslib" }],
  },
];

export interface VendoredSpec { host: "next"; dir: "dist/compiled"; packages: readonly string[] }

/** Next's own React build and the browser polyfills its bundler may inject into client chunks (listed conservatively). */
export const VENDORED: VendoredSpec = {
  host: "next",
  dir: "dist/compiled",
  packages: [
    "react", "react-dom", "scheduler",
    "assert", "browserify-zlib", "buffer", "constants-browserify", "crypto-browserify", "events",
    "https-browserify", "os-browserify", "path-browserify", "process", "punycode", "querystring-es3",
    "setimmediate", "stream-browserify", "stream-http", "string_decoder", "timers-browserify",
    "tty-browserify", "util", "vm-browserify",
  ],
};

export interface AssetSpec { name: string; license: string; copyright: string[]; via: string; source?: string }

/** Fonts next/font/google downloads from Google Fonts at build time (app/layout.tsx). */
export const ASSETS: readonly AssetSpec[] = [
  {
    name: "Inter",
    license: "OFL-1.1",
    copyright: ["Copyright 2020 The Inter Project Authors (https://github.com/rsms/inter)"],
    via: "next/font/google (app/layout.tsx)",
    source: "https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt",
  },
  {
    name: "Geist Mono",
    license: "OFL-1.1",
    copyright: ["Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font.git)"],
    via: "next/font/google (app/layout.tsx)",
    source: "https://github.com/google/fonts/blob/main/ofl/geistmono/OFL.txt",
  },
];
