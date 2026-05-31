// Locate the Merchiva repo root and provide naming helpers shared by the
// scaffolding commands.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function findRepoRoot(start = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, "messages")) && existsSync(join(dir, "app"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "Could not find the Merchiva repo root (looked for ./app and ./messages). Run from inside the project.",
  );
}

/** "waste-log", "wasteLog", "Waste Log" → "waste-log" */
export function toKebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .toLowerCase()
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** "waste-log" → "WasteLog" */
export function toPascal(s: string): string {
  return toKebab(s)
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
}

/** "waste-log" → "wasteLog" */
export function toCamel(s: string): string {
  const p = toPascal(s);
  return p ? p[0].toLowerCase() + p.slice(1) : p;
}

/** "waste-log" → "Waste Log" */
export function toTitle(s: string): string {
  return toKebab(s)
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}
