// Tab store + history bridge against a fake browser. The fixture installs globals and
// mock.module replacements that would leak into other test files sharing this process,
// so it runs in a child `bun test` process (same pattern as scripts/tests/docs/hooks.test.ts).

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/browser-shell/history-bridge.isolated.ts";

test(
  "tab store drives real history writes, popstate reconcile, persistence, sign-out, scroll restore and teardown",
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
    expect(output).toMatch(/\b12 pass\b/);
  },
  60_000,
);
