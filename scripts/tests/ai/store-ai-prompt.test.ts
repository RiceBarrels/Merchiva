// Mr. Merchiva's main system prompt. lib/ai/store-ai-prompt.ts is server-only and the fixture
// stubs "server-only" with mock.module, which would leak into other test files sharing this
// process, so it runs in a child `bun test` process (same pattern as store-ai-routes.test.ts).

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/ai/store-ai-prompt.isolated.ts";

test(
  "the prompt looks ids up, invents no prerequisites, proposes missing roles, names only the caller's tools and spells out the store's weeks",
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
    expect(output).toMatch(/\b9 pass\b/);
  },
  60_000,
);
