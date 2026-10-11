// Isolated fixture for scripts/tests/notify/channel-dots.test.ts — NOT auto-discovered by
// `bun test`. Server-renders the /manager channel sidebar with the dot selectors mocked: each
// conversation with a counted chat row carries a dot on its leading glyph, so the Channel nav
// row's dot can be traced to the conversation behind it. The module mock would leak into other
// test files sharing this process, so it runs in its own.

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement } from "react";
import type { DotEntry, DotFilter } from "@/lib/notifications/dots";
import type { ChatChannel, ChatModel } from "@/lib/chat/model";
import type { ChannelWorkspaceValue } from "@/components/channel/context";

let dotted = new Set<string>();
let anyDot = false;
const filters: DotFilter[] = [];

mock.module("@/lib/notifications/dots-context", () => ({
  useConversationDot: (id: string | null | undefined) => !!id && dotted.has(id),
  useAnyDot: (filter?: DotFilter) => {
    if (filter) filters.push(filter);
    return anyDot;
  },
}));

const { renderToStaticMarkup } = await import("react-dom/server");
const { ChannelWorkspaceProvider } = await import("@/components/channel/context");
const { ChannelSidebar } = await import("@/components/channel/sidebar");

const DOT = "data-notification-dot";
const PEER = "c".repeat(64);

function channel(id: string, name: string, over: Partial<ChatChannel> = {}): ChatChannel {
  return {
    id, type: "group", name, peerHex: null, topic: "", memberHexes: [], muted: false, starred: false,
    readUpTo: 0, unread: 0, mentions: 0, lastActivity: 0, lastMessage: null, ...over,
  };
}

const CHANNELS = [
  channel("g1", "general"),
  channel("g2", "kitchen"),
  channel("d1", "Priya", { type: "direct", peerHex: PEER }),
];

function render(activeId: string | null = null): string {
  const model = {
    channels: CHANNELS,
    channelById: new Map(CHANNELS.map((c) => [c.id, c])),
  } as unknown as ChatModel;
  const value = {
    model, canManage: true, nameOf: (hex: string) => (hex === PEER ? "Priya" : "?"), avatarOf: () => null, openChannel: () => {},
  } as unknown as ChannelWorkspaceValue;
  const sidebar = createElement(ChannelSidebar, { activeId, onNewChannel: () => {}, onNewDm: () => {}, onSearchAll: () => {} });
  return renderToStaticMarkup(createElement(ChannelWorkspaceProvider, { value }, sidebar));
}

/** The <button …>…</button> whose text holds `name` (a conversation row). */
function row(html: string, name: string): string {
  const at = html.indexOf(`>${name}</span>`);
  expect(at, `no row for ${name}`).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<button", at);
  return html.slice(start, html.indexOf("</button>", at) + "</button>".length);
}

function chatEntry(conversationId?: string, kind = "chat"): DotEntry {
  return { feature: { kind, ...(conversationId ? { conversationId } : {}) } } as unknown as DotEntry;
}

beforeEach(() => {
  dotted = new Set();
  anyDot = false;
  filters.length = 0;
});

describe("channel sidebar dots", () => {
  test("no dot anywhere when no conversation has a counted row", () => {
    expect(render()).not.toContain(DOT);
  });

  test("a conversation with a counted row carries the dot on its glyph, and only that one", () => {
    dotted = new Set(["g2"]);
    const html = render();
    const kitchen = row(html, "kitchen");
    expect(kitchen).toContain(DOT);
    expect(kitchen).toMatch(/<span class="relative inline-flex shrink-0">.*data-notification-dot/);
    expect(kitchen).toContain("-top-0.5 -end-0.5");
    expect(row(html, "general")).not.toContain(DOT);
    expect(row(html, "Priya")).not.toContain(DOT);
  });

  test("the dot also bolds the row (a pin or thread reply raises no unread count)", () => {
    dotted = new Set(["d1"]);
    const html = render();
    expect(row(html, "Priya")).toContain("font-semibold");
    expect(row(html, "general")).not.toContain("font-semibold");
  });

  test("the row names the state for a screen reader", () => {
    dotted = new Set(["g1"]);
    expect(row(render(), "general")).toContain('class="sr-only"');
  });

  test("the open (inverted) row swaps the dot's ring", () => {
    dotted = new Set(["g1"]);
    expect(row(render("g1"), "general")).toContain("ring-foreground");
    expect(row(render(), "general")).not.toContain("ring-foreground");
  });

  test("an open section shows the dots on its rows, not on its header", () => {
    anyDot = true;
    dotted = new Set(["g1"]);
    const html = render();
    expect(html.split(DOT).length - 1).toBe(1);
  });

  test("each section rolls up only its own conversations' chat rows", () => {
    render();
    // Channels, then direct messages (no starred section here).
    expect(filters.length).toBe(2);
    const [groups, direct] = filters;
    expect(groups(chatEntry("g1"))).toBe(true);
    expect(groups(chatEntry("d1"))).toBe(false);
    expect(groups(chatEntry())).toBe(false);
    expect(groups(chatEntry("g1", "drive"))).toBe(false);
    expect(direct(chatEntry("d1"))).toBe(true);
    expect(direct(chatEntry("g2"))).toBe(false);
  });
});
