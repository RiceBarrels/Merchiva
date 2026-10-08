// Drive writes, folder uploads, drop reading and multi-file downloads (drive-ui §7.7, §8.2, §8.3).
//
// The fixture replaces the reducer wrappers and the download primitives with `mock.module`, which would leak into
// other test files sharing this process, so it runs drive-writes.isolated.ts in a child process.

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/drive/drive-writes.isolated.ts";

test(
  "drive writes pass the actor, split batches and time out as network (isolated fixture)",
  () => {
    const proc = Bun.spawnSync([process.execPath, "test", FIXTURE], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
    if (proc.exitCode !== 0) console.error(output);
    expect(proc.exitCode).toBe(0);
    expect(output).toMatch(/\b\d+ pass\b/);
    expect(output).toContain(" 0 fail");
  },
  120_000,
);
