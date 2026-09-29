// Mr. Merchiva's chat history never saved: the chat keys a session by
// `toHexString()` (32 bare hex; tab bindings are stored that way too), while
// save_ai_chat_session / archive_ai_chat_session match
// `r.id.toString() === sessionId`, which is hyphenated only — every save
// failed with "Session not found". The wrappers now send the hyphenated form.

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Uuid } from "spacetimedb";
import { resolveSession } from "@/components/merchiva-dock/tab-sessions";
import { storedId } from "@/lib/merchiva/action-ids";
import { archiveAiChatSession, saveAiChatSession } from "@/lib/spacetimedb/actions";
import { clearConnection, setActiveOrgId, setConnection } from "@/lib/spacetimedb/client";

const ORG = "org-chat-sessions";

interface SessionRow {
  id: Uuid;
  organizationId: string;
  title: string;
  messages: string;
  archived: boolean;
}

// One session from before the fix (its row already holds messages), one created after.
const OLD_ID = Uuid.parse("01888d6e-5c00-7000-8000-00000000a1d0");
const NEW_ID = Uuid.parse("0199aa01-2b3c-4d5e-8f60-7182939a4b5c");

let rows: SessionRow[] = [];
const calls: Array<{ reducer: string; args: Record<string, unknown> }> = [];

/** The module's lookup (spacetimedb/src/index.ts saveAiChatSession / archiveAiChatSession). */
function findSession(args: Record<string, unknown>): SessionRow {
  const row = rows.find((r) => r.id.toString() === args.sessionId && r.organizationId === args.organizationId);
  if (!row) throw new Error("Session not found");
  return row;
}

const fakeConn = {
  reducers: {
    saveAiChatSession: async (args: Record<string, unknown>) => {
      calls.push({ reducer: "saveAiChatSession", args });
      const row = findSession(args);
      row.messages = String(args.messages);
      if (typeof args.title === "string") row.title = args.title;
    },
    archiveAiChatSession: async (args: Record<string, unknown>) => {
      calls.push({ reducer: "archiveAiChatSession", args });
      findSession(args).archived = true;
    },
  },
};

/** How the chat finds the row to show (merchiva-chat-dashboard.tsx: `rowIdString(s.id) === activeSessionId`). */
function loadMessages(activeSessionId: string): string | undefined {
  return rows.find((s) => s.id.toHexString() === activeSessionId)?.messages;
}

beforeAll(() => {
  setConnection(fakeConn as unknown as Parameters<typeof setConnection>[0]);
  setActiveOrgId(ORG);
});

afterAll(() => {
  clearConnection();
});

beforeEach(() => {
  calls.length = 0;
  rows = [
    { id: OLD_ID, organizationId: ORG, title: "Old", messages: JSON.stringify([{ id: "m1", from: "user", text: "hi" }]), archived: false },
    { id: NEW_ID, organizationId: ORG, title: "New", messages: "[]", archived: false },
  ];
});

describe("storedId: the session id the reducers accept", () => {
  test("a 32-hex id becomes the 8-4-4-4-12 lower-case form Uuid.toString() prints", () => {
    expect(storedId(NEW_ID.toHexString())).toBe(NEW_ID.toString());
    expect(storedId(NEW_ID.toHexString().toUpperCase())).toBe(NEW_ID.toString());
  });

  test("an already hyphenated id is left as it is; upper case is lowered", () => {
    expect(storedId(NEW_ID.toString())).toBe(NEW_ID.toString());
    expect(storedId(NEW_ID.toString().toUpperCase())).toBe(NEW_ID.toString());
  });

  test("a value that is not a uuid is left alone", () => {
    expect(storedId("session-1")).toBe("session-1");
    expect(storedId("abc123")).toBe("abc123");
    expect(storedId("")).toBe("");
  });
});

describe("saveAiChatSession / archiveAiChatSession send the hyphenated id", () => {
  test("the chat's 32-hex id reaches the reducer hyphenated, and the save lands", async () => {
    const chatId = NEW_ID.toHexString();
    const saved = JSON.stringify([{ id: "m2", from: "user", text: "order milk" }]);
    await saveAiChatSession(chatId, saved, "Milk");
    expect(calls).toEqual([
      {
        reducer: "saveAiChatSession",
        args: { organizationId: ORG, sessionId: NEW_ID.toString(), messages: saved, title: "Milk", summary: undefined, archived: undefined },
      },
    ]);
    expect(rows[1].messages).toBe(saved);
  });

  test("a hyphenated id passes through unchanged", async () => {
    await saveAiChatSession(NEW_ID.toString(), "[]");
    expect(calls[0].args.sessionId).toBe(NEW_ID.toString());
  });

  test("archiving by the chat's 32-hex id finds the row", async () => {
    await archiveAiChatSession(OLD_ID.toHexString());
    expect(calls).toEqual([{ reducer: "archiveAiChatSession", args: { organizationId: ORG, sessionId: OLD_ID.toString() } }]);
    expect(rows[0].archived).toBe(true);
  });

  test("an unknown session still fails the way the module does", async () => {
    await expect(saveAiChatSession("ffffffffffffffffffffffffffffffff", "[]")).rejects.toThrow("Session not found");
  });
});

describe("history loads for sessions from before and after the fix", () => {
  // Tab bindings keep the 32-hex id; nothing about them changes.
  const refs = () => rows.map((r, i) => ({ id: r.id.toHexString(), archived: r.archived, createdAt: i }));

  test("a session from before the fix: its tab binding still resolves and its messages load", () => {
    const decision = resolveSession("tab-a", refs(), { "tab-a": OLD_ID.toHexString() });
    expect(decision).toEqual({ kind: "use", id: OLD_ID.toHexString(), bind: false });
    expect(JSON.parse(loadMessages(OLD_ID.toHexString()) ?? "[]")).toHaveLength(1);
  });

  test("a session saved after the fix: the saved messages load by the same 32-hex id", async () => {
    const chatId = NEW_ID.toHexString();
    const saved = JSON.stringify([{ id: "m3", from: "user", text: "schedule" }]);
    await saveAiChatSession(chatId, saved);
    const decision = resolveSession("tab-b", refs(), { "tab-a": OLD_ID.toHexString(), "tab-b": chatId });
    expect(decision).toEqual({ kind: "use", id: chatId, bind: false });
    expect(loadMessages(chatId)).toBe(saved);
  });
});
