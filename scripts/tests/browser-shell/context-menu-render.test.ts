// Server render of ShellContextMenu, which app/manager/layout.tsx mounts on every /manager page.
// The fixture uses mock.module for the router and the auth / permissions / i18n providers, which
// would leak into other test files sharing this process, so it runs in a child `bun test` process.

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/browser-shell/context-menu-render.isolated.tsx";

test(
  "the shell context menu server-renders to nothing and cannot break a /manager page",
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
    expect(output).toMatch(/\b2 pass\b/);
  },
  60_000,
);
