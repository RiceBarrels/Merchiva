// capacitor.config.ts imports the Keyboard plugin's `KeyboardResize` enum, because the plugin's type augmentation
// rejects the plain "body" literal and that type error fails `next build`. The Capacitor CLI loads this file with
// its own TypeScript-to-CommonJS loader, so the runtime import must work there, and the value must still
// serialize to "body" so native keyboard behaviour is unchanged.

import { expect, test } from "bun:test";
import { join } from "node:path";

import config from "../../../capacitor.config";

const ROOT = join(import.meta.dir, "..", "..", "..");
const node = Bun.which("node");

test('Keyboard.resize serializes to "body"', () => {
  expect(config.plugins?.Keyboard?.resize).toBe("body");
  const serialized = JSON.parse(JSON.stringify(config)) as { plugins: { Keyboard: { resize: string } } };
  expect(serialized.plugins.Keyboard.resize).toBe("body");
});

test.skipIf(!node)(
  "the Capacitor CLI's config loader reads the file under Node",
  () => {
    // loadConfig only reads: it transpiles capacitor.config.ts with typescript and requires it.
    const script = [
      'const { loadConfig } = require("@capacitor/cli/dist/config");',
      "loadConfig()",
      "  .then((c) => process.stdout.write(JSON.stringify({ type: c.app.extConfigType, keyboard: c.app.extConfig.plugins.Keyboard })))",
      "  .catch((e) => { console.error(e); process.exit(1); });",
    ].join("\n");
    const proc = Bun.spawnSync([node ?? "node", "-e", script], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
    if (proc.exitCode !== 0) console.error(proc.stderr.toString());
    expect(proc.exitCode).toBe(0);
    expect(JSON.parse(proc.stdout.toString())).toEqual({
      type: "ts",
      keyboard: { resize: "body", resizeOnFullScreen: false },
    });
  },
  60_000,
);
