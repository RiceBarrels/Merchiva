// Docs home render states (plan §D7 acceptance item 2: loading, empty, not-published).
//
// The fixture replaces modules with `mock.module`, which would leak into other test files
// sharing this process, so each scenario runs home-render.isolated.tsx in a child process.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const FIXTURE = "./scripts/tests/docs-home/home-render.isolated.tsx";
const SCENARIOS = ["checking", "not_published", "empty", "docs", "trash-empty", "no-matches"] as const;

function runScenario(scenario: (typeof SCENARIOS)[number]): { exitCode: number | null; output: string } {
  const proc = Bun.spawnSync([process.execPath, "test", FIXTURE], {
    cwd: ROOT,
    env: { ...process.env, DOCS_HOME_SCENARIO: scenario },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exitCode: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

describe("docs home renders each state", () => {
  for (const scenario of SCENARIOS) {
    test(
      scenario,
      () => {
        const { exitCode, output } = runScenario(scenario);
        if (exitCode !== 0) console.error(output);
        expect(exitCode).toBe(0);
        expect(output).toContain("1 pass");
      },
      60_000,
    );
  }
});
