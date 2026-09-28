import { describe, expect, test } from "bun:test";
import { claimNewSessions, resolveSession, type SessionRef } from "@/components/merchiva-dock/tab-sessions";

function session(id: string, createdAt: number, archived = false): SessionRef {
  return { id, createdAt, archived };
}

describe("resolveSession", () => {
  // Most recently updated first, as the chat passes them.
  const sessions = [session("s2", 20), session("s1", 10)];

  test("a tab with its own session keeps it", () => {
    expect(resolveSession("tab-a", sessions, { "tab-a": "s1", "tab-b": "s2" })).toEqual({ kind: "use", id: "s1", bind: false });
  });

  test("the first tab after per-tab sessions adopts the user's existing conversation", () => {
    expect(resolveSession("tab-a", sessions, {})).toEqual({ kind: "use", id: "s2", bind: true });
  });

  test("every later tab starts a fresh Merchiva instead of sharing one", () => {
    expect(resolveSession("tab-b", sessions, { "tab-a": "s2" })).toEqual({ kind: "create" });
  });

  test("a binding whose session is gone gets a new one", () => {
    expect(resolveSession("tab-a", sessions, { "tab-a": "deleted", "tab-b": "s2" })).toEqual({ kind: "create" });
  });

  test("a user with no sessions at all gets one created", () => {
    expect(resolveSession("tab-a", [], {})).toEqual({ kind: "create" });
  });

  test("outside the browser shell there is one Merchiva on the latest open session", () => {
    const withArchived = [session("old-archived", 30, true), ...sessions];
    expect(resolveSession(null, withArchived, { "tab-a": "s1" })).toEqual({ kind: "use", id: "s2", bind: false });
    expect(resolveSession(null, [], {})).toEqual({ kind: "create" });
  });
});

describe("claimNewSessions", () => {
  test("a new row goes to the tab that asked for it", () => {
    const pending = [{ tabId: "tab-b", known: new Set(["s1"]) }];
    expect(claimNewSessions(pending, [session("s1", 10), session("s2", 20)], { "tab-a": "s1" })).toEqual([
      { tabId: "tab-b", sessionId: "s2" },
    ]);
  });

  test("two tabs asking at once get distinct sessions, in request order", () => {
    const known = new Set(["s1"]);
    const pending = [
      { tabId: "tab-b", known },
      { tabId: "tab-c", known },
    ];
    const rows = [session("s3", 30), session("s1", 10), session("s2", 20)];
    expect(claimNewSessions(pending, rows, { "tab-a": "s1" })).toEqual([
      { tabId: "tab-b", sessionId: "s2" },
      { tabId: "tab-c", sessionId: "s3" },
    ]);
  });

  test("nothing is claimed until the new row arrives, and a bound session is never taken", () => {
    const pending = [{ tabId: "tab-b", known: new Set(["s1"]) }];
    expect(claimNewSessions(pending, [session("s1", 10)], { "tab-a": "s1" })).toEqual([]);
    // s2 appeared but another tab already bound it.
    expect(claimNewSessions(pending, [session("s1", 10), session("s2", 20)], { "tab-a": "s1", "tab-x": "s2" })).toEqual([]);
  });
});
