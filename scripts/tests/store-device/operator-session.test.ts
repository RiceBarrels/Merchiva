// When /store deletes the tablet's `device_operator_session` (the server-side operator a PIN or
// QR log-in leaves behind). The fixture uses mock.module for the screen's data layer, device
// primitives and sibling panes, which would leak into other test files sharing this process, so
// it runs in a child `bun test` process.

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/store-device/operator-session.isolated.tsx";

test(
  "the store device drops its operator session on log-out, stale operator and idle lock, and its push subscription on mount",
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
    expect(output).toMatch(/\b14 pass\b/);
  },
  60_000,
);
