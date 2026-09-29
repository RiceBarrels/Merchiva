// Mr. Merchiva's role and task cards (CommandGroup) through the autonomy gate: a job's reply
// restored from history runs as its gate says, and a task waits for a role its reply creates. The
// fixture uses mock.module for the cards, i18n and toasts, which would leak into other test files
// sharing this process, so it runs in a child `bun test` process.

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/merchiva-dock/command-group.isolated.tsx";

test(
  "CommandGroup runs restored job replies by the gate and waits for the reply's own roles",
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
