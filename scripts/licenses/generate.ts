#!/usr/bin/env bun
/**
 * Third-party notices generator.
 *
 *   bun scripts/licenses/generate.ts            write public/legal/third-party-notices.json + THIRD_PARTY_NOTICES.txt
 *   bun scripts/licenses/generate.ts --check    write nothing; exit 1 if either file would change
 *   ... --release                               also exit 1 while an EXCEPTIONS entry is approvedBy "pending-user"
 *
 * Every mode prints the policy problems and exits 1 on any. Run it after any dependency change and commit
 * public/legal/*.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { NOTICES_JSON_PATH, NOTICES_TXT_PATH } from "@/lib/licenses/types";
import { collectNotices, renderNoticesText, type NoticeProblem } from "./collect";
import { EXCEPTIONS } from "./policy";

export const ROOT = join(import.meta.dir, "..", "..");
export const NOTICES_JSON_FILE = join(ROOT, "public", NOTICES_JSON_PATH.slice(1));
export const NOTICES_TXT_FILE = join(ROOT, "public", NOTICES_TXT_PATH.slice(1));

/** The exact bytes of the two committed files. */
export function renderNoticeFiles(root: string = ROOT): { json: string; txt: string; problems: NoticeProblem[] } {
  const { file, problems } = collectNotices(root);
  return { json: `${JSON.stringify(file, null, 2)}\n`, txt: renderNoticesText(file), problems };
}

/** EXCEPTIONS entries still waiting for the user's sign-off (they block a release). */
export function pendingExceptions(): string[] {
  return Object.entries(EXCEPTIONS)
    .filter(([, e]) => e.approvedBy === "pending-user")
    .map(([name, e]) => `${name} (${e.license}): ${e.reason}`);
}

function readOrEmpty(file: string): string {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function main(): number {
  const args = new Set(process.argv.slice(2));
  const check = args.has("--check");
  const release = args.has("--release");
  const { json, txt, problems } = renderNoticeFiles();
  let failed = false;

  for (const p of problems) console.error(`problem [${p.kind}] ${p.name}${p.version ? `@${p.version}` : ""}: ${p.detail}`);
  if (problems.length > 0) failed = true;

  if (check) {
    for (const [file, content] of [[NOTICES_JSON_FILE, json], [NOTICES_TXT_FILE, txt]] as const) {
      if (readOrEmpty(file) !== content) {
        console.error(`stale: ${file.slice(ROOT.length + 1)} (run \`bun scripts/licenses/generate.ts\`)`);
        failed = true;
      }
    }
  } else {
    for (const [file, content] of [[NOTICES_JSON_FILE, json], [NOTICES_TXT_FILE, txt]] as const) {
      mkdirSync(dirname(file), { recursive: true });
      if (readOrEmpty(file) !== content) {
        writeFileSync(file, content);
        console.log(`wrote ${file.slice(ROOT.length + 1)}`);
      }
    }
  }

  if (release) {
    const pending = pendingExceptions();
    for (const p of pending) console.error(`release blocked: EXCEPTIONS entry awaits sign-off: ${p}`);
    if (pending.length > 0) failed = true;
  }
  const parsed = JSON.parse(json) as { packageCount: number; texts: Record<string, string> };
  console.log(`${parsed.packageCount} entries, ${Object.keys(parsed.texts).length} license texts, ${problems.length} problems`);
  return failed ? 1 : 0;
}

if (import.meta.main) process.exit(main());
