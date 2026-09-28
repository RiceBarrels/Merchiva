// When the legacy store-machine lock under /manager deletes the tablet's `device_operator_session`.
// The fixture uses mock.module for the lock's data layer and stubs the JSX dev runtime, which
// would leak into other test files sharing this process, so it runs in a child `bun test` process.

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/store-device/legacy-lock-session.isolated.tsx";

test(
  "the legacy store-machine lock drops a leftover operator session whenever it waits for a PIN",
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
