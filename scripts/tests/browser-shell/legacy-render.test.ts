// Server renders of the shared components with and without the browser shell, and of the New Tab
// page under the legacy shell. The fixture uses mock.module, which would leak into other test
// files sharing this process, so it runs in a child `bun test` process.

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/browser-shell/legacy-render.isolated.tsx";

test(
  "legacy shell output is unchanged and the New Tab page renders without a shell provider",
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
