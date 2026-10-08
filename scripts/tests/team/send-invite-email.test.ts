// Runs send-invite-email.isolated.ts in a child `bun test`: it mocks
// lib/email/resend with mock.module, which would leak into other files here.

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");

test("send-invite-email trusts only the invitation token and the caller's own rows", () => {
  const proc = Bun.spawnSync([process.execPath, "test", "./scripts/tests/team/send-invite-email.isolated.ts"], {
    cwd: ROOT, env: process.env, stdout: "pipe", stderr: "pipe",
  });
  const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
  if (proc.exitCode !== 0) console.error(output);
  expect(proc.exitCode).toBe(0);
  expect(output).toContain(" 0 fail");
  expect(output).toMatch(/\b10 pass\b/);
}, 60_000);
