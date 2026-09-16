// Sign-out purge of browser-shell storage. The store fixture installs globals and mock.module
// replacements that would leak into other test files sharing this process, so it runs in a child
// `bun test` process (same pattern as history-bridge.test.ts).

import { expect, test } from "bun:test";
import { join } from "node:path";
import { MIRROR_STORAGE_KEY } from "@/lib/browser-shell/history-bridge";
import { BOOT_INTENT_KEY, localTabsKey, sessionTabsKey } from "@/lib/browser-shell/persistence";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/browser-shell/sign-out.isolated.ts";

// Mirrors SHELL_STORAGE_PREFIXES in lib/browser-shell/sign-out.ts (importing that module here would
// load the tab store into this shared process).
const SIGN_OUT_SOURCE = join(ROOT, "lib", "browser-shell", "sign-out.ts");

test("purge prefixes cover every persisted browser-shell key", async () => {
  const source = await Bun.file(SIGN_OUT_SOURCE).text();
  const block = source.match(/SHELL_STORAGE_PREFIXES[^=]*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
  expect(block).not.toBeNull();
  const prefixes = Array.from((block?.[1] ?? "").matchAll(/"([^"]+)"/g), (match) => match[1]);
  expect(prefixes.length).toBeGreaterThan(0);

  const scope = { userId: "user-1", organizationId: "org-1" };
  const bookmarksSource = await Bun.file(join(ROOT, "lib", "browser-shell", "bookmarks.ts")).text();
  const historySource = await Bun.file(join(ROOT, "lib", "browser-shell", "browsing-history.ts")).text();
  const bookmarksKey = bookmarksSource.match(/`(merchiva_bookmarks:[^`$]*)\$\{/)?.[1];
  const historyKey = historySource.match(/`(merchiva_history:[^`$]*)\$\{/)?.[1];
  expect(bookmarksKey).toBeDefined();
  expect(historyKey).toBeDefined();

  const keys = [sessionTabsKey(scope), localTabsKey(scope), BOOT_INTENT_KEY, MIRROR_STORAGE_KEY, `${bookmarksKey}x`, `${historyKey}x`];
  for (const key of keys) {
    expect(prefixes.some((prefix) => key.startsWith(prefix))).toBe(true);
  }
});

test(
  "sign-out leaves no tab URLs, doc ids or titles in storage (tab store teardown, pagehide, event)",
  () => {
    const proc = Bun.spawnSync([process.execPath, "test", FIXTURE], {
      cwd: ROOT,
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
    if (proc.exitCode !== 0) console.error(output);
    expect(proc.exitCode).toBe(0);
    expect(output).toContain(" 0 fail");
    expect(output).toMatch(/\b5 pass\b/);
  },
  60_000,
);
