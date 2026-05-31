// Config resolution for the Merchiva CLI.
//
// Precedence (highest first):
//   1. Environment variables (MERCHIVA_API_URL, MERCHIVA_LANG, MERCHIVA_TOKEN)
//   2. ~/.merchiva/config.json
//   3. NEXT_PUBLIC_APP_URL from the shell env
//   4. Built-in defaults (http://localhost:3000, lang "en")

import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const LOCALES = ["en", "zh", "es", "fr", "ar", "hi"] as const;
export type Locale = (typeof LOCALES)[number];

export interface CliConfig {
  /** Base origin of the running Merchiva app, e.g. http://localhost:3000 */
  baseUrl: string;
  /** Default language for Mr. Merchiva replies. */
  lang: Locale;
  /** WorkOS access token — doubles as the SpacetimeDB OIDC token. */
  token?: string;
  /** WorkOS refresh token, used to mint a fresh access token. */
  refreshToken?: string;
  /** Email of the signed-in user (display only). */
  userEmail?: string;
  /** Pinned organization id for the TUI (otherwise the first org is used). */
  orgId?: string;
}

const CONFIG_DIR = join(homedir(), ".merchiva");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function readFile(): Partial<CliConfig> {
  try {
    if (!existsSync(CONFIG_FILE)) return {};
    return JSON.parse(readFileSync(CONFIG_FILE, "utf-8")) as Partial<CliConfig>;
  } catch {
    return {};
  }
}

function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function loadConfig(): CliConfig {
  const file = readFile();
  const baseUrl =
    process.env.MERCHIVA_API_URL ||
    file.baseUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const langCandidate = process.env.MERCHIVA_LANG || file.lang || "en";
  const lang: Locale = isLocale(langCandidate) ? langCandidate : "en";

  const token = process.env.MERCHIVA_TOKEN || file.token;
  const orgId = process.env.MERCHIVA_ORG || file.orgId;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    lang,
    token,
    orgId,
    refreshToken: file.refreshToken,
    userEmail: file.userEmail,
  };
}

export function saveConfig(patch: Partial<CliConfig>): CliConfig {
  const merged = { ...readFile(), ...patch };
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  return loadConfig();
}

export function configPath(): string {
  return CONFIG_FILE;
}
