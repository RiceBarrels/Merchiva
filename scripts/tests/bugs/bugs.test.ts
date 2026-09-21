import { describe, expect, test } from "bun:test";
import {
  bugDateStr,
  compareBugs,
  isBugOpen,
  mapBugRow,
  type BugReport,
} from "@/lib/bugs";

/*
 * The bug tracker is filed into from three surfaces and read from all three, so
 * the row mapper and the triage order are the parts that must not drift: a row
 * written by the store tablet has to sort and render exactly as one written in
 * /manager, and a status the client does not know about must never make a
 * report disappear from the list.
 */

function row(over: Record<string, unknown> = {}) {
  return {
    id: { toHexString: () => "bug-1" },
    organizationId: "org-1",
    reporterId: { toHexString: () => "identity-1" },
    reporterMemberId: "member-1",
    reporterName: "Sam",
    title: "Stock count won't save",
    body: "Tapped save, nothing happened.",
    severity: "high",
    status: "open",
    surface: "store",
    route: "/manager/inventory",
    appVersion: "0.1.1-beta",
    userAgent: "Mozilla/5.0",
    screenshotUrl: "",
    date: "2026-09-21",
    resolutionNote: "",
    resolvedByName: "",
    createdAt: { microsSinceUnixEpoch: 1_758_400_000_000_000n },
    updatedAt: { microsSinceUnixEpoch: 1_758_400_000_000_000n },
    ...over,
  };
}

describe("mapBugRow", () => {
  test("reads identities and timestamps in their SpacetimeDB shapes", () => {
    const bug = mapBugRow(row());
    expect(bug.id).toBe("bug-1");
    expect(bug.reporterIdHex).toBe("identity-1");
    expect(bug.createdAt.getTime()).toBe(1_758_400_000_000);
  });

  test("accepts a timestamp that arrives as .toDate() instead of micros", () => {
    const at = new Date("2026-09-21T08:00:00Z");
    expect(mapBugRow(row({ createdAt: { toDate: () => at } })).createdAt.getTime()).toBe(at.getTime());
  });

  test("an empty screenshot column reads as 'no screenshot', not an empty src", () => {
    expect(mapBugRow(row()).screenshotUrl).toBeNull();
    expect(mapBugRow(row({ screenshotUrl: "https://example.test/a.png" })).screenshotUrl).toBe(
      "https://example.test/a.png",
    );
  });

  test("a status or severity the client does not know falls back instead of vanishing", () => {
    // The module validates both, but a row written by an older or newer build
    // must still render — the tone maps are keyed by these exact values.
    const bug = mapBugRow(row({ status: "triaged", severity: "catastrophic", surface: "watch" }));
    expect(bug.status).toBe("open");
    expect(bug.severity).toBe("normal");
    expect(bug.surface).toBe("manager");
  });
});

describe("compareBugs", () => {
  const at = (iso: string) => new Date(iso);
  const bug = (over: Partial<BugReport>): BugReport =>
    ({ ...mapBugRow(row()), ...over }) as BugReport;

  test("open reports come before closed ones, however old", () => {
    const stale = bug({ id: "stale", status: "open", severity: "low", createdAt: at("2026-01-01T00:00:00Z") });
    const fresh = bug({ id: "fresh", status: "fixed", severity: "blocker", createdAt: at("2026-09-21T00:00:00Z") });
    expect([fresh, stale].sort(compareBugs).map((b) => b.id)).toEqual(["stale", "fresh"]);
  });

  test("within the open ones, the worst severity leads", () => {
    const low = bug({ id: "low", severity: "low", createdAt: at("2026-09-21T09:00:00Z") });
    const blocker = bug({ id: "blocker", severity: "blocker", createdAt: at("2026-09-20T09:00:00Z") });
    expect([low, blocker].sort(compareBugs).map((b) => b.id)).toEqual(["blocker", "low"]);
  });

  test("at equal severity the newest leads", () => {
    const older = bug({ id: "older", createdAt: at("2026-09-20T09:00:00Z") });
    const newer = bug({ id: "newer", createdAt: at("2026-09-21T09:00:00Z") });
    expect([older, newer].sort(compareBugs).map((b) => b.id)).toEqual(["newer", "older"]);
  });
});

describe("isBugOpen", () => {
  test("in_progress still counts as open — it is nobody's 'done'", () => {
    expect(isBugOpen("open")).toBe(true);
    expect(isBugOpen("in_progress")).toBe(true);
    expect(isBugOpen("fixed")).toBe(false);
    expect(isBugOpen("wont_fix")).toBe(false);
  });
});

describe("bugDateStr", () => {
  test("uses the reporter's local day, not UTC", () => {
    // 23:30 local on the 21st is already the 22nd in UTC east of Greenwich;
    // the report belongs to the day the person was working.
    const local = new Date(2026, 8, 21, 23, 30, 0);
    expect(bugDateStr(local)).toBe("2026-09-21");
  });

  test("pads month and day so the column sorts as a string", () => {
    expect(bugDateStr(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
