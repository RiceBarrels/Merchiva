import { afterEach, describe, expect, jest, test } from "bun:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { encodeToolEvent, splitToolEvents, type ToolEvent } from "@/lib/merchiva/tool-events";
import {
  MAX_TOOL_STEPS,
  applyToolEvents,
  restoreSteps,
  settleSteps,
  takeNewStarts,
  withSettledSteps,
  withToolEvents,
  type ToolStep,
} from "@/lib/merchiva/tool-steps";
import { AI_FOCUS_LINGER_MS, AI_FOCUS_WATCHDOG_MS, clearAiFocus, getAiFocusSnapshot } from "@/lib/merchiva/ai-focus";
import {
  STALE_JOB_MS,
  aiFocusScope,
  finishReplyFocus,
  focusAction,
  focusToolStarts,
  followJobFrames,
  jobStaleInMs,
  releaseJobs,
} from "@/lib/merchiva/tool-focus";
import { toolTarget } from "@/lib/merchiva/tool-targets";
import {
  ToolSteps,
  ToolStepsAnnouncer,
  announcedStep,
  followedReply,
  type AnnouncedMessage,
} from "@/components/merchiva-dock/tool-steps";

const start = (id: string, tool: string, extra: Partial<ToolEvent> = {}): ToolEvent => ({ id, tool, phase: "start", ...extra });
const done = (id: string, tool: string, extra: Partial<ToolEvent> = {}): ToolEvent => ({ id, tool, phase: "done", ...extra });

describe("applyToolEvents", () => {
  test("a start adds a running step and its finish completes it", () => {
    const running = applyToolEvents(undefined, [start("c1", "viewInventory", { args: { lowOnly: true } })]);
    expect(running).toEqual([{ id: "c1", tool: "viewInventory", status: "running", args: { lowOnly: true } }]);
    const finished = applyToolEvents(running, [done("c1", "viewInventory", { count: 12, ms: 85 })]);
    expect(finished).toEqual([{ id: "c1", tool: "viewInventory", status: "done", args: { lowOnly: true }, count: 12, ms: 85 }]);
  });

  test("steps keep the order their calls first appeared in", () => {
    const steps = applyToolEvents(undefined, [
      start("a", "viewSales"),
      start("b", "viewTeam"),
      done("b", "viewTeam"),
      done("a", "viewSales"),
      start("c", "viewRoles"),
    ]);
    expect(steps?.map((s) => [s.id, s.status])).toEqual([["a", "done"], ["b", "done"], ["c", "running"]]);
  });

  test("re-delivering the same frames changes nothing and returns the same array", () => {
    const events = [start("a", "viewSales", { args: { days: 30 } }), done("a", "viewSales", { count: 30 }), start("b", "viewTeam")];
    const once = applyToolEvents(undefined, events);
    expect(applyToolEvents(once, events)).toBe(once);
    expect(applyToolEvents(once, [])).toBe(once);
  });

  test("a finish without its start still becomes a step", () => {
    expect(applyToolEvents(undefined, [{ id: "x", tool: "viewProducts", phase: "error", ms: 12 }])).toEqual([
      { id: "x", tool: "viewProducts", status: "error", ms: 12 },
    ]);
  });

  test("a late start never moves a finished call back to running", () => {
    const finished = applyToolEvents(undefined, [done("a", "viewSales", { count: 3 })]);
    const after = applyToolEvents(finished, [start("a", "viewSales", { args: { days: 7 } })]);
    expect(after).toEqual([{ id: "a", tool: "viewSales", status: "done", args: { days: 7 }, count: 3 }]);
  });

  test("a start revives a step settled on reload while its job kept streaming", () => {
    const settled = settleSteps(applyToolEvents(undefined, [start("a", "viewSales")]));
    expect(settled?.[0].status).toBe("interrupted");
    expect(applyToolEvents(settled, [start("a", "viewSales")])?.[0].status).toBe("running");
  });

  test("keeps MCP server labels", () => {
    const steps = applyToolEvents(undefined, [start("m", "mcp_github_search_issues", { server: "GitHub" })]);
    expect(steps?.[0].server).toBe("GitHub");
  });

  test("caps the steps kept on one message", () => {
    const events = Array.from({ length: MAX_TOOL_STEPS + 5 }, (_, i) => start(`c${i}`, "viewTeam"));
    expect(applyToolEvents(undefined, events)).toHaveLength(MAX_TOOL_STEPS);
  });
});

describe("settleSteps / restoreSteps", () => {
  test("running calls become interrupted; finished ones stay", () => {
    const steps: ToolStep[] = [
      { id: "a", tool: "viewSales", status: "done", count: 2 },
      { id: "b", tool: "viewTeam", status: "running" },
    ];
    expect(settleSteps(steps)?.map((s) => s.status)).toEqual(["done", "interrupted"]);
  });

  test("returns the same array when nothing was running", () => {
    const steps: ToolStep[] = [{ id: "a", tool: "viewSales", status: "done" }];
    expect(settleSteps(steps)).toBe(steps);
    expect(settleSteps(undefined)).toBeUndefined();
  });

  test("a saved session drops malformed steps and settles running ones", () => {
    const raw: unknown = [
      { id: "a", tool: "viewSales", status: "running", args: { days: 14, nested: { no: 1 } } },
      { id: "b", tool: "viewTeam", status: "weird" },
      { tool: "viewRoles", status: "done" },
      "junk",
      { id: "c", tool: "viewRoles", status: "done", count: 4, ms: 20 },
    ];
    expect(restoreSteps(raw)).toEqual([
      { id: "a", tool: "viewSales", status: "interrupted", args: { days: 14 } },
      { id: "c", tool: "viewRoles", status: "done", count: 4, ms: 20 },
    ]);
    expect(restoreSteps(undefined)).toBeUndefined();
    expect(restoreSteps([])).toBeUndefined();
    expect(restoreSteps("nope")).toBeUndefined();
  });
});

describe("takeNewStarts", () => {
  test("hands each start over once, however often the frames arrive", () => {
    const seen = new Set<string>();
    const first = [start("a", "viewSales"), done("a", "viewSales")];
    expect(takeNewStarts(seen, first).map((e) => e.id)).toEqual(["a"]);
    expect(takeNewStarts(seen, first)).toEqual([]);
    expect(takeNewStarts(seen, [...first, start("b", "viewTeam")]).map((e) => e.id)).toEqual(["b"]);
  });
});

describe("message helpers", () => {
  type Msg = { id: string; text: string; steps?: ToolStep[] };
  const msgs: Msg[] = [{ id: "u", text: "hi" }, { id: "a", text: "" }];

  test("withToolEvents touches only the target message and is a no-op when nothing changes", () => {
    const events = [start("c1", "viewInventory")];
    const next = withToolEvents(msgs, "a", events);
    expect(next[0]).toBe(msgs[0]);
    expect(next[1].steps).toEqual([{ id: "c1", tool: "viewInventory", status: "running" }]);
    expect(withToolEvents(next, "a", events)).toBe(next);
    expect(withToolEvents(msgs, "a", [])).toBe(msgs);
  });

  test("withSettledSteps interrupts what is still running", () => {
    const next = withToolEvents(msgs, "a", [start("c1", "viewInventory")]);
    const settled = withSettledSteps(next, "a");
    expect(settled[1].steps?.[0].status).toBe("interrupted");
    expect(withSettledSteps(settled, "a")).toBe(settled);
  });

  test("a growing job reply builds the same steps as the finished one", () => {
    const frames = [
      encodeToolEvent({ id: "c1", tool: "viewSales", phase: "start", args: { days: 30 } }),
      encodeToolEvent({ id: "c1", tool: "viewSales", phase: "done", count: 30, ms: 40 }),
      encodeToolEvent({ id: "c2", tool: "viewForecast", phase: "start", args: { days: 7 } }),
      encodeToolEvent({ id: "c2", tool: "viewForecast", phase: "done", count: 7, ms: 90 }),
    ];
    const full = `Let me look. ${frames.join("")}Sales are up.`;
    let steps: ToolStep[] | undefined;
    // Every partial update carries the whole reply so far, cut at arbitrary points.
    for (let cut = 1; cut <= full.length; cut += 17) {
      steps = applyToolEvents(steps, splitToolEvents(full.slice(0, cut)).events);
    }
    steps = settleSteps(applyToolEvents(steps, splitToolEvents(full).events));
    expect(steps).toEqual(applyToolEvents(undefined, splitToolEvents(full).events));
    expect(steps?.map((s) => s.status)).toEqual(["done", "done"]);
    expect(splitToolEvents(full).text).toBe("Let me look. Sales are up.");
  });
});

describe("Mr. Merchiva focus", () => {
  const scope = "tab-test";
  afterEach(() => clearAiFocus(scope));

  test("the window scope is used outside the browser shell", () => {
    expect(aiFocusScope(undefined)).toBe("__window__");
    expect(aiFocusScope("tab-1")).toBe("tab-1");
  });

  test("moves to a tool's page once per call, and ignores tools with no page", () => {
    const seen = new Set<string>();
    focusToolStarts(scope, seen, [start("a", "viewInventory")]);
    const first = getAiFocusSnapshot().find((f) => f.scope === scope);
    expect(first).toMatchObject({ route: "/manager/inventory", anchor: "nav:/manager/inventory", tool: "viewInventory", kind: "tool", working: true });
    focusToolStarts(scope, seen, [start("a", "viewInventory"), done("a", "viewInventory")]);
    expect(getAiFocusSnapshot().find((f) => f.scope === scope)?.seq).toBe(first?.seq);
    focusToolStarts(scope, seen, [start("m", "mcp_github_search", { server: "GitHub" })]);
    expect(getAiFocusSnapshot().find((f) => f.scope === scope)?.tool).toBe("viewInventory");
  });

  test("an action points at the page it changes", () => {
    focusAction(scope, "addShift");
    expect(getAiFocusSnapshot().find((f) => f.scope === scope)).toMatchObject({ route: "/manager/personnel/schedule", tool: "addShift", kind: "action" });
    focusAction(scope, "notARealAction");
    expect(getAiFocusSnapshot().find((f) => f.scope === scope)?.tool).toBe("addShift");
  });

  test("a finished reply with role commands lingers on the Roles page", () => {
    focusAction(scope, "addShift");
    finishReplyFocus(scope, { rolesAdd: [{}], tasksAdd: [], tasksDelete: [] });
    expect(getAiFocusSnapshot().find((f) => f.scope === scope)).toMatchObject({ route: "/manager/personnel/roles", working: false });
  });

  test("a finished reply without commands just stops working", () => {
    focusAction(scope, "addShift");
    finishReplyFocus(scope, { rolesAdd: [], tasksAdd: [], tasksDelete: [] });
    expect(getAiFocusSnapshot().find((f) => f.scope === scope)).toMatchObject({ route: "/manager/personnel/schedule", working: false });
  });
});

describe("Mr. Merchiva focus that nobody finishes", () => {
  const scope = "tab-watchdog";
  const current = () => getAiFocusSnapshot().find((f) => f.scope === scope);
  afterEach(() => {
    clearAiFocus(scope);
    jest.useRealTimers();
  });

  test("a working cursor that hears nothing finishes, lingers and leaves on its own", () => {
    jest.useFakeTimers();
    focusToolStarts(scope, new Set(), [start("a", "viewSales")]);
    jest.advanceTimersByTime(AI_FOCUS_WATCHDOG_MS - 1);
    expect(current()?.working).toBe(true);
    jest.advanceTimersByTime(1);
    expect(current()?.working).toBe(false);
    jest.advanceTimersByTime(AI_FOCUS_LINGER_MS);
    expect(current()).toBeUndefined();
  });

  test("every update of a reply still coming in keeps it working", () => {
    jest.useFakeTimers();
    const seen = new Set<string>();
    const events = [start("a", "viewSales")];
    focusToolStarts(scope, seen, events);
    for (let i = 0; i < 3; i++) {
      jest.advanceTimersByTime(AI_FOCUS_WATCHDOG_MS - 1000);
      focusToolStarts(scope, seen, events); // the same frames again: no move, but a sign of life
    }
    expect(current()).toMatchObject({ working: true, seq: 1 });
  });

  test("an update never revives a cursor that already finished", () => {
    jest.useFakeTimers();
    focusToolStarts(scope, new Set(), [start("a", "viewSales")]);
    finishReplyFocus(scope);
    focusToolStarts(scope, new Set(["a"]), [start("a", "viewSales")]);
    expect(current()?.working).toBe(false);
    jest.advanceTimersByTime(AI_FOCUS_LINGER_MS);
    expect(current()).toBeUndefined();
  });

  test("a job that ends without the chat finalizing it lets the cursor go once none is left", () => {
    const followed = new Set<string>();
    const seen = new Set<string>();
    followJobFrames(scope, followed, seen, "j1", [start("a", "viewSales")]);
    followJobFrames(scope, followed, seen, "j2", [start("b", "viewInventory")]);
    expect(releaseJobs(scope, followed, ["j1"])).toEqual(["j1"]);
    expect(current()).toMatchObject({ tool: "viewInventory", working: true });
    expect(releaseJobs(scope, followed, ["j1", "nope"])).toEqual([]);
    expect(current()?.working).toBe(true);
    expect(releaseJobs(scope, followed, ["j2"])).toEqual(["j2"]);
    expect(current()?.working).toBe(false);
    expect(followed.size).toBe(0);
  });

  test("a job row silent for STALE_JOB_MS is dead; one without a stamp never is", () => {
    const now = 1_800_000_000_000;
    expect(jobStaleInMs(now - 1000, now)).toBe(STALE_JOB_MS - 1000);
    expect(jobStaleInMs(now - STALE_JOB_MS, now)).toBeLessThanOrEqual(0);
    expect(jobStaleInMs(now - 2 * STALE_JOB_MS, now)).toBeLessThan(0);
    expect(jobStaleInMs(0, now)).toBe(Number.POSITIVE_INFINITY);
    expect(jobStaleInMs(Number.NaN, now)).toBe(Number.POSITIVE_INFINITY);
  });

  test("a dead job's frames settle its steps instead of reviving them", () => {
    // Session saved mid-job: restoreSteps settles; a live job's next update revives, a dead one's must not.
    const restored = restoreSteps([{ id: "a", tool: "viewSales", status: "running" }]);
    const frames = [start("a", "viewSales")];
    expect(applyToolEvents(restored, frames)?.[0].status).toBe("running");
    expect(settleSteps(applyToolEvents(restored, frames))?.[0].status).toBe("interrupted");
  });
});

const TOOLS = [
  "viewTeam", "viewRoles", "viewScheduleHistory", "viewUpcomingShifts", "viewShiftPresets", "viewAvailability",
  "viewInventory", "viewSuppliers", "viewProducts", "viewSales", "viewFinance", "viewForecast",
  "viewRestockSuggestions", "proposeSchedule",
];

describe("labels", () => {
  const en = JSON.parse(readFileSync(join(import.meta.dir, "../../../messages/en.json"), "utf8")) as {
    merchiva: { tools: Record<string, Record<string, string>> };
  };

  test("every tool Mr. Merchiva can call has running, done and error labels and a page", () => {
    for (const tool of TOOLS) {
      expect({ tool, labels: Object.keys(en.merchiva.tools[tool] ?? {}).sort() }).toEqual({ tool, labels: ["done", "error", "running"] });
      expect(toolTarget(tool)).not.toBeNull();
    }
  });
});

describe("<ToolSteps>", () => {
  const render = (steps: ToolStep[] | undefined) => renderToStaticMarkup(h(ToolSteps, { steps }));

  test("renders nothing without steps", () => {
    expect(render(undefined)).toBe("");
    expect(render([])).toBe("");
  });

  test("labels running and finished calls, their inputs and result counts", () => {
    const html = render([
      { id: "a", tool: "viewSales", status: "done", args: { days: 30 }, count: 30 },
      { id: "b", tool: "viewInventory", status: "running", args: { lowOnly: true } },
      { id: "c", tool: "viewForecast", status: "done", args: { days: 7 }, count: 1 },
      { id: "d", tool: "viewFinance", status: "error", args: { period: "last_month" } },
    ]);
    expect(html).toContain("Checked sales");
    expect(html).toContain("last 30 days");
    expect(html).toContain("30 results");
    expect(html).toContain("Checking inventory…");
    expect(html).toContain("low stock only");
    expect(html).toContain("next 7 days");
    expect(html).toContain("1 result");
    expect(html).toContain("Couldn&#x27;t calculate finances");
    expect(html).toContain("last month");
    // Not a live region: it would appear together with its first step (see ToolStepsAnnouncer).
    expect(html).not.toContain("aria-live");
  });

  test("a schedule draft's days count forward from its first day", () => {
    const html = render([
      { id: "p", tool: "proposeSchedule", status: "running", args: { weekStart: "2026-09-28", days: 7 } },
      { id: "q", tool: "proposeSchedule", status: "done", args: { days: 14 } },
    ]);
    expect(html).toContain("Drafting a schedule…");
    expect(html).toContain("next 7 days");
    expect(html).toContain("week of Sep 28");
    expect(html).toContain("next 14 days");
    expect(html).not.toContain("last 7 days");
    expect(html).not.toContain("last 14 days");
  });

  test("only history windows read as looking back", () => {
    const html = render([
      { id: "s", tool: "viewSales", status: "done", args: { days: 30 } },
      { id: "f", tool: "viewFinance", status: "done", args: { days: 90 } },
    ]);
    expect(html).toContain("last 30 days");
    expect(html).toContain("last 90 days");
    expect(html).not.toContain("next ");
  });

  test("names MCP tools by server and unknown tools generically", () => {
    const html = render([
      { id: "m", tool: "mcp_github_search_issues", status: "done", server: "GitHub" },
      { id: "u", tool: "someNewTool", status: "done" },
    ]);
    expect(html).toContain("GitHub · search_issues");
    expect(html).toContain("Used someNewTool");
  });

  test("collapses long runs behind a step count, keeping the latest call visible", () => {
    const steps: ToolStep[] = TOOLS.slice(0, 6).map((tool, i) => ({ id: `s${i}`, tool, status: "done" }));
    const html = render(steps);
    expect(html).toContain("6 steps");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Checked availability");
    expect(html).not.toContain("Checked the team");
  });
});

describe("<ToolStepsAnnouncer>", () => {
  const reply = (id: string, steps?: ToolStep[]): AnnouncedMessage => ({ id, from: "merchiva", steps });
  const render = (message: AnnouncedMessage | undefined) => renderToStaticMarkup(h(ToolStepsAnnouncer, { message }));
  const REGION = '<div role="status" aria-live="polite" aria-atomic="true" class="sr-only">';

  test("the live region is already there before the first step arrives", () => {
    expect(render(undefined)).toBe(`${REGION}</div>`);
    expect(render(reply("r"))).toBe(`${REGION}</div>`);
  });

  test("reads out the latest call of the reply being written, with what the label leaves unsaid", () => {
    expect(render(reply("r", [{ id: "a", tool: "viewInventory", status: "running", args: { lowOnly: true } }])))
      .toBe(`${REGION}Checking inventory… · low stock only</div>`);
    expect(render(reply("r", [
      { id: "a", tool: "viewInventory", status: "done", count: 3 },
      { id: "m", tool: "mcp_github_search_issues", status: "running", server: "GitHub" },
    ]))).toContain("GitHub · search_issues · In progress</div>");
  });

  test("follows a reply from its placeholder to its last result, and never a reply from history", () => {
    const history = reply("old", [{ id: "a", tool: "viewSales", status: "done", count: 30 }]);
    let followed = followedReply(null, history);
    expect(followed).toBeNull();
    expect(announcedStep(followed, history)).toBeUndefined();

    const user: AnnouncedMessage = { id: "u", from: "user" };
    followed = followedReply(followed, user);
    expect(followed).toBeNull();

    followed = followedReply(followed, reply("new"));
    expect(followed).toBe("new");
    expect(announcedStep(followed, reply("new"))).toBeUndefined();

    // Start and finish can land in the same update: the call is still read out.
    const finished = reply("new", [{ id: "b", tool: "viewSales", status: "done", count: 30 }]);
    followed = followedReply(followed, finished);
    expect(followed).toBe("new");
    expect(announcedStep(followed, finished)?.id).toBe("b");

    // The next question clears the region; the old reply is not read again.
    followed = followedReply(followed, user);
    expect(announcedStep(followed, user)).toBeUndefined();
    expect(announcedStep(followed, history)).toBeUndefined();
  });

  test("a restored conversation reads nothing out", () => {
    expect(render(reply("old", [{ id: "a", tool: "viewSales", status: "done", count: 30 }]))).toBe(`${REGION}</div>`);
    expect(render(reply("old", [{ id: "a", tool: "viewSales", status: "interrupted" }]))).toBe(`${REGION}</div>`);
  });
});
