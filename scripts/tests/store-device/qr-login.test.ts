// The QR log-in on /store (useQrLogin): a phone's approval logs the member in even though the
// tablet consumes the request first, the QR is replaced once scanned, and a punch-out logs nobody
// in. The fixture uses mock.module for the hook's data layer, which would leak into other test
// files sharing this process, so it runs in a child `bun test` process.

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/store-device/qr-login.isolated.tsx";

test(
  "a scanned store QR logs its member in, is replaced at once, and a punch-out logs nobody in",
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
    expect(output).toMatch(/\b6 pass\b/);
  },
  60_000,
);
