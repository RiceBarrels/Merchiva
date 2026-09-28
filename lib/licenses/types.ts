// Third-party notices: the data format shared by the generator (scripts/licenses/*) and the /licenses UI
// (components/licenses/*). The generator writes public/legal/third-party-notices.json in this shape.

export type NoticeSource = "npm" | "inlined" | "vendored" | "asset";

export interface NoticeEntry {
  /** npm name; for inlined code the upstream package name; for assets the asset name. */
  name: string;
  /** "" when unknown (inlined or vendored code carries no reliable version). */
  version: string;
  /** SPDX expression, after LICENSE_OVERRIDES. */
  license: string;
  /** Set when `license` is an OR expression: the license Merchiva uses the package under. */
  elected?: string;
  source: NoticeSource;
  /** inlined: "exceljs@4.4.0"; vendored: "next@16.2.7"; asset: "next/font/google (app/layout.tsx)". */
  via?: string;
  /** Copyright lines from the license files plus ATTRIBUTIONS / UPSTREAM lines, de-duplicated. */
  copyright: string[];
  /** Keys into NoticesFile.texts: license files first, then NOTICE files. */
  textIds: string[];
  /** Normalized https URL from package.json "repository". */
  repository?: string;
  /**
   * English policy note (election, exception, placeholder). Data for the .txt file only: the UI never renders it
   * (it would be untranslated). The UI shows `elected` through `licenses.elected`.
   */
  note?: string;
}

export interface NoticesFile {
  schemaVersion: 1;
  packageCount: number;
  /** id = first 16 hex chars of sha256(text with CRLF → LF, trimmed). */
  texts: Record<string, string>;
  /** Sorted by (name, version, source, via). */
  packages: NoticeEntry[];
}

export const NOTICES_JSON_PATH = "/legal/third-party-notices.json";
export const NOTICES_TXT_PATH = "/legal/THIRD_PARTY_NOTICES.txt";
