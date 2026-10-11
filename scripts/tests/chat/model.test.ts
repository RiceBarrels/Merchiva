// lib/chat/model.ts (sidebar channels, unread / mention counts, threads, pins,
// reactions, search) and the mention parser it shares with the module
// (spacetimedb/src/chat/logic.ts).

import { describe, expect, test } from "bun:test";
import { badgeCount, buildChatModel, searchChat, sidebarSections, type ChatRowsIn, type MessageIn } from "@/lib/chat/model";
import { chatMentions, shouldNotifyChatMember } from "@/spacetimedb/src/chat/logic";
import { isCompactFollowUp } from "@/components/channel/message-list";

const ME = "aa";
const ANN = "bb";
const BOB = "cc";
const ORG = "org-1";

function msg(id: string, conversationId: string, senderHex: string, createdAt: number, content = "hi"): MessageIn {
  return {
    id, conversationId, senderHex, content, createdAt, replyToId: null,
    attachmentUrl: null, attachmentType: null, attachmentName: null, isMerchiva: false,
  };
}

function rows(over: Partial<ChatRowsIn> = {}): ChatRowsIn {
  return {
    meHex: ME,
    organizationId: ORG,
    conversations: [
      { id: "g1", organizationId: ORG, type: "group", name: "floor", updatedAt: 0 },
      { id: "d1", organizationId: ORG, type: "direct", name: null, updatedAt: 0 },
      { id: "other", organizationId: "org-2", type: "group", name: "elsewhere", updatedAt: 0 },
    ],
    members: [
      { conversationId: "g1", userHex: ME, joinedAt: 0 },
      { conversationId: "g1", userHex: ANN, joinedAt: 0 },
      { conversationId: "g1", userHex: BOB, joinedAt: 0 },
      { conversationId: "d1", userHex: ME, joinedAt: 0 },
      { conversationId: "d1", userHex: ANN, joinedAt: 0 },
      { conversationId: "other", userHex: ME, joinedAt: 0 },
    ],
    messages: [],
    exts: [],
    reactions: [],
    topics: new Map(),
    states: [],
    people: new Map([
      [ME, { hex: ME, name: "Mia", role: "manager", avatarUrl: null }],
      [ANN, { hex: ANN, name: "Ann Lee", role: "staff", avatarUrl: null }],
      [BOB, { hex: BOB, name: "Bob", role: "staff", avatarUrl: null }],
    ]),
    ...over,
  };
}

describe("buildChatModel", () => {
  test("a message a store tablet sent for its operator is marked, and never runs on from their own device's", () => {
    const m = buildChatModel(rows({
      messages: [
        msg("p1", "g1", ANN, 10, "from my phone"),
        { ...msg("s1", "g1", ANN, 20, "from the store"), fromStore: true },
        { ...msg("s2", "g1", ANN, 30, "still the store"), fromStore: true },
        msg("p2", "g1", ANN, 40, "phone again"),
      ],
    }));
    const [p1, s1, s2, p2] = m.messagesOf("g1");
    expect([p1.fromStore, s1.fromStore, s2.fromStore, p2.fromStore]).toEqual([false, true, true, false]);
    expect(isCompactFollowUp(p1, s1)).toBe(false);
    expect(isCompactFollowUp(s1, s2)).toBe(true);
    expect(isCompactFollowUp(s2, p2)).toBe(false);
  });

  test("a walkie voice note keeps its raw transcript beside the AI summary, until it is deleted", () => {
    const m = buildChatModel(rows({
      messages: [
        { ...msg("v", "g1", ANN, 10, "Restock cups"), voiceTranscript: "um we are out of cups again" },
        { ...msg("w", "g1", ANN, 11, "Gone"), voiceTranscript: "never mind" },
        msg("t", "g1", BOB, 12, "typed"),
      ],
      exts: [{ messageId: "w", threadParentId: "", editedAt: null, pinnedBy: "", pinnedAt: null, deletedAt: 20 }],
    }));
    expect(m.entryById.get("v")?.voiceTranscript).toBe("um we are out of cups again");
    expect(m.entryById.get("w")?.voiceTranscript).toBeNull();
    expect(m.entryById.get("t")?.voiceTranscript).toBeNull();
  });

  test("only this org's conversations; a DM is named after the other person", () => {
    const m = buildChatModel(rows());
    expect(m.channels.map((c) => c.id).sort()).toEqual(["d1", "g1"]);
    expect(m.channelById.get("d1")?.name).toBe("Ann Lee");
    expect(m.channelById.get("d1")?.peerHex).toBe(ANN);
  });

  test("a channel with only its creator in it is listed, with no unread", () => {
    const m = buildChatModel(rows({
      conversations: [{ id: "solo", organizationId: ORG, type: "group", name: "notes", updatedAt: 5 }],
      members: [{ conversationId: "solo", userHex: ME, joinedAt: 5 }],
      messages: [msg("x", "solo", ME, 6, "buy milk")],
    }));
    const solo = m.channelById.get("solo")!;
    expect(solo.memberHexes).toEqual([ME]);
    expect(solo.unread).toBe(0);
    expect(solo.mentions).toBe(0);
    expect(sidebarSections(m.channels).groups.map((c) => c.id)).toEqual(["solo"]);
  });

  test("thread replies leave the main list and add up under the parent", () => {
    const m = buildChatModel(rows({
      messages: [msg("p", "g1", ANN, 10), msg("r1", "g1", BOB, 20), msg("r2", "g1", ANN, 30), msg("n", "g1", BOB, 40)],
      exts: [
        { messageId: "r1", threadParentId: "p", editedAt: null, pinnedBy: "", pinnedAt: null, deletedAt: null },
        { messageId: "r2", threadParentId: "p", editedAt: null, pinnedBy: "", pinnedAt: null, deletedAt: null },
      ],
    }));
    expect(m.messagesOf("g1").map((e) => e.id)).toEqual(["p", "n"]);
    expect(m.repliesOf("p").map((e) => e.id)).toEqual(["r1", "r2"]);
    expect(m.entryById.get("p")?.thread).toEqual({ count: 2, lastReplyAt: 30, participantHexes: [BOB, ANN] });
  });

  test("unread counts main-list messages after the read mark, never my own; DMs count as mentions", () => {
    const m = buildChatModel(rows({
      messages: [
        msg("a", "g1", ANN, 10), msg("b", "g1", ME, 20), msg("c", "g1", BOB, 30, "@Mia look"),
        msg("d", "d1", ANN, 5), msg("e", "d1", ANN, 6),
      ],
      states: [{ conversationId: "g1", lastReadAt: 10, muted: false, starred: false }],
    }));
    const g = m.channelById.get("g1")!;
    expect(g.unread).toBe(1);
    expect(g.mentions).toBe(1);
    const d = m.channelById.get("d1")!;
    // Never opened: everything since joining is unread.
    expect(d.unread).toBe(2);
    expect(d.mentions).toBe(2);
  });

  test("a deleted parent shows as a tombstone with no text, reactions or pin", () => {
    const m = buildChatModel(rows({
      messages: [msg("p", "g1", ANN, 10, "")],
      exts: [{ messageId: "p", threadParentId: "", editedAt: null, pinnedBy: "", pinnedAt: null, deletedAt: 11 }],
      reactions: [{ messageId: "p", userHex: ME, emoji: "👍", createdAt: 1 }],
    }));
    const p = m.entryById.get("p")!;
    expect(p.deleted).toBe(true);
    expect(p.reactions).toEqual([]);
    expect(m.channelById.get("g1")?.lastMessage).toBeNull();
  });

  test("reactions group by emoji in first-use order, marking mine", () => {
    const m = buildChatModel(rows({
      messages: [msg("p", "g1", ANN, 10)],
      reactions: [
        { messageId: "p", userHex: ANN, emoji: "✅", createdAt: 5 },
        { messageId: "p", userHex: ME, emoji: "👍", createdAt: 1 },
        { messageId: "p", userHex: BOB, emoji: "👍", createdAt: 2 },
      ],
    }));
    expect(m.entryById.get("p")?.reactions).toEqual([
      { emoji: "👍", count: 2, mine: true, userHexes: [ME, BOB] },
      { emoji: "✅", count: 1, mine: false, userHexes: [ANN] },
    ]);
  });

  test("pins, newest pin first, thread replies included", () => {
    const m = buildChatModel(rows({
      messages: [msg("a", "g1", ANN, 10), msg("b", "g1", BOB, 20), msg("r", "g1", BOB, 30)],
      exts: [
        { messageId: "a", threadParentId: "", editedAt: null, pinnedBy: ME, pinnedAt: 100, deletedAt: null },
        { messageId: "r", threadParentId: "b", editedAt: null, pinnedBy: ANN, pinnedAt: 200, deletedAt: null },
      ],
    }));
    expect(m.pinsOf("g1").map((e) => e.id)).toEqual(["r", "a"]);
  });
});

describe("sidebarSections / searchChat / badgeCount", () => {
  test("starred channels move to their own section", () => {
    const m = buildChatModel(rows({ states: [{ conversationId: "d1", lastReadAt: 0, muted: false, starred: true }] }));
    const s = sidebarSections(m.channels);
    expect(s.starred.map((c) => c.id)).toEqual(["d1"]);
    expect(s.groups.map((c) => c.id)).toEqual(["g1"]);
    expect(s.direct).toEqual([]);
  });

  test("search is case-insensitive, newest first, scoped on request, skips deleted", () => {
    const m = buildChatModel(rows({
      messages: [msg("a", "g1", ANN, 10, "Milk delivery late"), msg("b", "d1", ANN, 20, "more MILK please"), msg("c", "g1", BOB, 30, "milk")],
      exts: [{ messageId: "c", threadParentId: "", editedAt: null, pinnedBy: "", pinnedAt: null, deletedAt: 31 }],
    }));
    expect(searchChat(m, "milk").map((h) => h.entry.id)).toEqual(["b", "a"]);
    expect(searchChat(m, "milk", "g1").map((h) => h.entry.id)).toEqual(["a"]);
    expect(searchChat(m, "  ")).toEqual([]);
  });

  test("badgeCount caps at 99+", () => {
    expect(badgeCount(7)).toBe("7");
    expect(badgeCount(120)).toBe("99+");
  });
});

describe("chatMentions", () => {
  const people = [{ hex: ANN, name: "Ann Lee" }, { hex: BOB, name: "Ann" }];
  test("names with spaces, case-insensitive, whole names only", () => {
    expect([...chatMentions("hi @ann lee, ok?", people).users]).toEqual([ANN]);
    expect([...chatMentions("@Annabel hi", people).users]).toEqual([]);
    expect(chatMentions("@everyone close up", people).everyone).toBe(true);
    expect(chatMentions("mail@everyone.com", people).everyone).toBe(false);
    expect([...chatMentions("@Ann。收到", people).users]).toEqual([BOB]);
  });
  test("mute keeps quiet except for a named mention", () => {
    expect(shouldNotifyChatMember(false, false)).toBe(true);
    expect(shouldNotifyChatMember(true, false)).toBe(false);
    expect(shouldNotifyChatMember(true, true)).toBe(true);
  });
});
