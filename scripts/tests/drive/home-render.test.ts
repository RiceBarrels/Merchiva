// The Drive manager home (drive-ui §7, §10, §18 home-render): each render state of the page, the action runner
// (downloads from the gesture, "Save next", trash with Undo, dialogs, drops, "Open as …", links) and the editor
// adapters (lib/drive/editors.ts: New ▸ Doc / Sheet / Slides and "Open as …" through the editors' own modules).
//
// The fixtures replace modules with `mock.module`, which would leak into other test files sharing this process, so
// each runs in a child process: home-render.isolated.tsx once per scenario, home/actions.isolated.tsx and
// home/editors.isolated.ts once each.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SCENARIOS = [
  "checking", "not_published", "offline", "empty-my", "items-grid", "items-list", "trash-empty", "search-no-matches",
  "members", "apps-summary", "needs-ack",
] as const;

function run(fixture: string, env: Record<string, string> = {}): { exitCode: number | null; output: string } {
  const proc = Bun.spawnSync([process.execPath, "test", fixture], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exitCode: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

function expectGreen({ exitCode, output }: { exitCode: number | null; output: string }): void {
  if (exitCode !== 0) console.error(output);
  expect(exitCode).toBe(0);
  expect(output).toMatch(/\b[1-9]\d* pass\b/);
  expect(output).toContain(" 0 fail");
}

describe("drive home renders each state", () => {
  for (const scenario of SCENARIOS) {
    test(scenario, () => expectGreen(run("./scripts/tests/drive/home-render.isolated.tsx", { DRIVE_HOME_SCENARIO: scenario })), 60_000);
  }
});

test("drive home actions: downloads, trash and undo, dialogs, drops, open as (isolated fixture)", () => {
  expectGreen(run("./scripts/tests/drive/home/actions.isolated.tsx"));
}, 120_000);

test("drive editors: create and open-as through the editors' modules (isolated fixture)", () => {
  expectGreen(run("./scripts/tests/drive/home/editors.isolated.ts"));
}, 120_000);
