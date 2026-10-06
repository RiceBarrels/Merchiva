// Runs order-route.isolated.ts in a child `bun test`: it mocks lib/email/resend
// and the service client with mock.module, which would leak into other files here.

import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");

test("suppliers/order sends only for a store's manager, to the store's own supplier", () => {
  const proc = Bun.spawnSync([process.execPath, "test", "./scripts/tests/suppliers/order-route.isolated.ts"], {
    cwd: ROOT, env: process.env, stdout: "pipe", stderr: "pipe",
  });
  const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
  if (proc.exitCode !== 0) console.error(output);
  expect(proc.exitCode).toBe(0);
  expect(output).toContain(" 0 fail");
  expect(output).toMatch(/\b7 pass\b/);
}, 60_000);
