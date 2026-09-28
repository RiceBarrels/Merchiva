// The Drive manager's URL state and its list, nav and toolbar pieces (drive-ui §6.3–§6.4, §7.2–§7.5, §11).
//
// Both fixtures replace modules with `mock.module` and install globals (`window`, `Element`), which would leak
// into other test files sharing this process, so each runs in a child process.

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..", "..");

function runIsolated(fixture: string): void {
  const proc = Bun.spawnSync([process.execPath, "test", fixture], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
  if (proc.exitCode !== 0) console.error(output);
  expect(proc.exitCode).toBe(0);
  expect(output).toMatch(/\b\d+ pass\b/);
  expect(output).toContain(" 0 fail");
}

test(
  "URL state: history modes, preview marks, closing a preview steps Back (isolated fixture)",
  () => runIsolated("./scripts/tests/drive/list-nav/url-state.isolated.ts"),
  120_000,
);

test(
  "results keyboard, entry links, space hints, selection bar, crumbs and storage (isolated fixture)",
  () => runIsolated("./scripts/tests/drive/list-nav/ui.isolated.ts"),
  120_000,
);
