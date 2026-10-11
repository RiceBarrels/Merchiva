// Where the /manager shell's notification dots land (sidebar rows and rail, the phone menu
// button, the store lists, the New Tab launcher), and when Mr. Merchiva's dock reads his rows,
// with the dot selectors mocked.
// The fixture uses mock.module, which would leak into other test files sharing this process, so
// it runs in a child `bun test` process.

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/notify/manager-dots.isolated.tsx";

test(
  "the manager shell's dots render on the right entry points",
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
    expect(output).toMatch(/\b10 pass\b/);
  },
  60_000,
);
