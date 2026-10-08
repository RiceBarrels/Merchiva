// /api/store-ai and /api/store-ai/enqueue end to end, minus the model and the database. The
// fixture replaces those with mock.module and a stubbed fetch, which would leak into other test
// files sharing this process, so it runs in a child `bun test` process (same pattern as
// scripts/tests/browser-shell/history-bridge.test.ts).

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/ai/store-ai-routes.isolated.ts";

test(
  "the AI routes honour the Mr. Merchiva switch, keep voice's write redirect direct, speak the caller's locale, see the current page, and never end on a blank reply",
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
    expect(output).toMatch(/\b15 pass\b/);
  },
  60_000,
);
