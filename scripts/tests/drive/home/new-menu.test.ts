// The Drive New menu and New ▸ Import a file (components/drive/toolbar/new-menu.tsx, useDriveCreate.importFile).
// The fixture replaces modules with `mock.module`, which would leak into other test files sharing this process, so
// new-menu.isolated.tsx runs in a child process.

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");

test("drive New menu: editor plugin hints, templates, import a file (isolated fixture)", () => {
  const proc = Bun.spawnSync([process.execPath, "test", "./scripts/tests/drive/home/new-menu.isolated.tsx"], {
    cwd: ROOT,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
  if (proc.exitCode !== 0) console.error(output);
  expect(proc.exitCode).toBe(0);
  expect(output).toMatch(/\b[1-9]\d* pass\b/);
  expect(output).toContain(" 0 fail");
}, 60_000);
