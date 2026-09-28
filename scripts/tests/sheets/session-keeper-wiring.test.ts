// SheetSessionKeeper publishes the app connection that parked spreadsheet sessions follow across reconnects
// (lib/sheets/use-sheet-session-keeper.ts). It only works if the signed-in layout mounts it, on /manager and on the
// device surfaces (/store, /personal), which render through the same layout without the shell.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const layout = readFileSync(join(import.meta.dir, "../../../app/manager/layout.tsx"), "utf8");

describe("SheetSessionKeeper wiring", () => {
  test("the manager layout imports the keeper", () => {
    expect(layout).toMatch(/import \{ SheetSessionKeeper \} from "@\/lib\/sheets\/use-sheet-session-keeper";/);
  });

  test("it is mounted in both the shell branch and the bare device-surface branch", () => {
    const mounts = layout.match(/<SheetSessionKeeper \/>/g) ?? [];
    expect(mounts.length).toBe(2);
    const shell = layout.indexOf("<ManagerShell>");
    const bare = layout.indexOf("Device surfaces get no shell");
    expect(shell).toBeGreaterThan(-1);
    expect(bare).toBeGreaterThan(-1);
    const positions = [...layout.matchAll(/<SheetSessionKeeper \/>/g)].map((m) => m.index ?? -1);
    expect(positions.some((p) => p > bare && p < shell)).toBe(true);
    expect(positions.some((p) => p > shell)).toBe(true);
  });
});
