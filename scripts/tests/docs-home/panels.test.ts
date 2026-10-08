// The editor routes: DocEditorRoute (another file type, not found, "just created", old version links),
// SheetEditorRoute and SlidesEditorRoute before and after a document's type is known, and the share dialog's
// owner-only "General access" rule.
//
// The fixtures replace modules with `mock.module`, which would leak into other test files sharing this process,
// so each runs in a child process.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURES = [
  "./scripts/tests/docs-home/editor-route.isolated.tsx",
  "./scripts/tests/docs-home/typed-routes.isolated.tsx",
  "./scripts/tests/docs-home/share-dialog.isolated.tsx",
];

describe("docs panels and the editor route", () => {
  for (const fixture of FIXTURES) {
    test(
      fixture.split("/").pop() ?? fixture,
      () => {
        const proc = Bun.spawnSync([process.execPath, "test", fixture], { cwd: ROOT, env: process.env, stdout: "pipe", stderr: "pipe" });
        const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
        if (proc.exitCode !== 0) console.error(output);
        expect(proc.exitCode).toBe(0);
        expect(output).toContain(" 0 fail");
      },
      60_000,
    );
  }
});
