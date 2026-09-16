// Docs hooks before the module is published / generated.
//
// The checks replace modules with `mock.module`, which would leak into other
// test files sharing this process, so each scenario runs the fixture
// (hooks-smoke.isolated.ts) in a child `bun test` process.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/docs/hooks-smoke.isolated.ts";

function runScenario(scenario: "pre-codegen" | "bindings"): { exitCode: number | null; output: string } {
  const proc = Bun.spawnSync([process.execPath, "test", FIXTURE], {
    cwd: ROOT,
    env: { ...process.env, DOCS_HOOKS_SCENARIO: scenario },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exitCode: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

describe("docs hooks without a published module", () => {
  test(
    "before codegen: every hook returns empty, ready, not_published — no docs subscriptions",
    () => {
      const { exitCode, output } = runScenario("pre-codegen");
      if (exitCode !== 0) console.error(output);
      expect(exitCode).toBe(0);
      expect(output).toContain("1 pass");
    },
    30_000,
  );

  test(
    "bindings generated, backend unconfirmed: hooks return empty and keep docs queries disabled",
    () => {
      const { exitCode, output } = runScenario("bindings");
      if (exitCode !== 0) console.error(output);
      expect(exitCode).toBe(0);
      expect(output).toContain("1 pass");
    },
    30_000,
  );
});
