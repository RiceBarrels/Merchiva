// lib/spacetimedb/hooks/useDeviceApps.ts: DeviceAppWrites, the list every install / uninstall builds on. setDeviceApps
// replaces the whole list, so a write issued before the previous one's row streams back must build on it, a row
// landing between two writes must not drop the second, and a failed write undoes only its own toggle.

import { describe, expect, test } from "bun:test";
import { DeviceAppWrites } from "@/lib/spacetimedb/hooks/useDeviceApps";

describe("DeviceAppWrites", () => {
  test("two installs in one round trip (from any two hooks of the window) both survive", () => {
    const writes = new DeviceAppWrites(["slides"]);
    const docs = writes.begin("docs", true);
    const sheets = writes.begin("sheets", true);
    expect(docs.next).toEqual(["slides", "docs"]);
    expect(sheets.next).toEqual(["slides", "docs", "sheets"]);
  });

  test("the first write's row landing while the second is in flight does not drop the second", () => {
    const writes = new DeviceAppWrites(["slides"]);
    const docs = writes.begin("docs", true);
    const sheets = writes.begin("sheets", true);
    docs.settle(true);
    writes.observe(["slides", "docs"]);
    expect(writes.begin("tasks", true).next).toEqual(["slides", "docs", "sheets", "tasks"]);
    sheets.settle(true);
  });

  test("idle, the streamed row is adopted (another device's change counts)", () => {
    const writes = new DeviceAppWrites(["slides"]);
    writes.begin("docs", true).settle(true);
    writes.observe(["docs"]);
    expect(writes.current()).toEqual(["docs"]);
  });

  test("a failed write undoes only its own toggle", () => {
    const writes = new DeviceAppWrites(["slides"]);
    const docs = writes.begin("docs", true);
    const off = writes.begin("slides", false);
    docs.settle(false);
    expect(writes.current()).toEqual([]);
    off.settle(true);
    const again = writes.begin("slides", true);
    again.settle(false);
    again.settle(false);
    expect(writes.current()).toEqual([]);
  });
});
