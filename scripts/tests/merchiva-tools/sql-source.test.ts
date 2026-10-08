// Mr. Merchiva's read tools end to end over a fake SQL endpoint. The fixture stubs
// "server-only" and the global fetch with mock.module, which would leak into other test files
// sharing this process, so it runs in a child `bun test` process (same pattern as
// scripts/tests/ai/store-ai-routes.test.ts).

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/merchiva-tools/sql-source.isolated.ts";

test(
  "the read tools load as the caller, once per request, and fail as tool errors",
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
    expect(output).toMatch(/\b20 pass\b/);
  },
  60_000,
);
