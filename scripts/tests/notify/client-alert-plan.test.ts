// What the alert hook does with rows it has not alerted (lib/notifications/alert-plan.ts):
// alert-only rows are read only once presented, rows nobody was shown are replayed
// (newest few, the rest folded), and a pushed row is "dealt with here" only when this
// page presented it, is about to, or it is already read.

import { describe, expect, test } from "bun:test";
import { ALERT_REPLAY_MAX, planAlertOnly, pushHandledHere } from "@/lib/notifications/alert-plan";

const none = () => false;

describe("planAlertOnly", () => {
  test("presented rows are read; never-presented rows are replayed, never read unseen", () => {
    const plan = planAlertOnly({ ids: ["a", "b", "c"], presented: new Set(["b"]), pending: none, skip: none });
    expect(plan).toEqual({ read: ["b"], replay: ["a", "c"], fold: [] });
  });

  test("rows still settling and SOS rows are left alone", () => {
    const plan = planAlertOnly({
      ids: ["new", "sos", "old"],
      presented: new Set(["new", "sos"]),
      pending: (id) => id === "new",
      skip: (id) => id === "sos",
    });
    expect(plan).toEqual({ read: [], replay: ["old"], fold: [] });
  });

  test("a long backlog: the newest few one by one, the rest as one alert", () => {
    const ids = ["n1", "n2", "n3", "n4", "n5"];
    const plan = planAlertOnly({ ids, presented: new Set(), pending: none, skip: none });
    expect(ALERT_REPLAY_MAX).toBe(3);
    expect(plan.replay).toEqual(["n1", "n2", "n3"]);
    expect(plan.fold).toEqual(["n4", "n5"]);
    expect(plan.read).toEqual([]);
  });
});

describe("pushHandledHere", () => {
  const input = {
    presented: new Set(["shown"]),
    pending: (id: string) => id === "settling",
    read: (id: string) => (id === "read" ? true : id === "unread" ? false : null),
  };

  test("presented, about to be, or read: handled", () => {
    expect(pushHandledHere("shown", input)).toBe(true);
    expect(pushHandledHere("settling", input)).toBe(true);
    expect(pushHandledHere("read", input)).toBe(true);
  });

  test("an unread row nobody was shown, another store's row, or no id: not handled", () => {
    expect(pushHandledHere("unread", input)).toBe(false);
    expect(pushHandledHere("other-store", input)).toBe(false);
    expect(pushHandledHere(null, input)).toBe(false);
  });
});
