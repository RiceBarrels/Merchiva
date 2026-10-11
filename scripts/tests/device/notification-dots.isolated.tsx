// Isolated fixture for scripts/tests/device/notification-dots.test.ts — NOT auto-discovered by
// `bun test`. The device placements of the notification dot (tile icons in the grid and the dock,
// the channel chip, the pager's page indicator) and the device clearing hooks (an open tile, the
// walkie's conversation), against a fake dot context built from the real dot state
// (lib/notifications/dots.ts). Placements render to static markup; the hooks run through Ink's
// reconciler (no DOM). Module mocks leak into other files of the same process, so this runs in its own.

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { render } from "ink-testing-library";
import { EMPTY_DOT_STATE, buildDotState, hasDot, type DotFilter, type DotQuery, type DotRow, type DotState } from "@/lib/notifications/dots";
import type { DeviceSurface } from "@/lib/notifications/device-tiles";

// ── Fake dot context ────────────────────────────────────────────────────────

interface Fake {
  state: DotState;
  dotsVisible: boolean;
  /** Someone is at the page (useDocumentAttended). */
  attended: boolean;
}
let fake: Fake = { state: EMPTY_DOT_STATE, dotsVisible: true, attended: true };
const listeners = new Set<() => void>();
function setFake(next: Partial<Fake>) {
  fake = { ...fake, ...next };
  for (const l of listeners) l();
}
function useFake(): Fake {
  return React.useSyncExternalStore(
    (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => fake,
    () => fake,
  );
}

const markDotReadCalls: DotQuery[] = [];
const markReadCalls: string[][] = [];
const markConversationCalls: string[] = [];
const markDotRead = (query: DotQuery) => void markDotReadCalls.push(query);
const markRead = (ids: readonly string[]) => void markReadCalls.push([...ids]);
/** Stable, like the provider's: useMarkConversationRead returns the same function every render. */
const markConversationRead = (id: string) => void markConversationCalls.push(id);

mock.module("@/lib/notifications/dots-context", () => ({
  useDot: (query: DotQuery) => hasDot(useFake().state, query),
  useAnyDot: (filter?: DotFilter) => useFake().state.entries.some((e) => e.counted && (!filter || filter(e))),
  useConversationDot: (id: string | null | undefined) => {
    const { state } = useFake();
    return !!id && state.entries.some((e) => e.counted && e.feature.kind === "chat" && e.feature.conversationId === id);
  },
  useMarkDotRead: () => markDotRead,
  useMarkConversationRead: () => markConversationRead,
  useDocumentAttended: () => useFake().attended,
  useNotificationDots: () => {
    const f = useFake();
    return { state: f.state, sections: [], viewer: { dotsVisible: f.dotsVisible }, markRead };
  },
}));
// The notify.dot.* and device.pager.* copy, until the notification fragments are merged into messages/*.json.
const COPY: Record<string, string> = {
  "notify.dot.withName": "{name}, new activity",
  "notify.dot.label": "New activity",
  "device.pager.page": "Page {n}",
};
const t = (key: string) => COPY[key] ?? key;
mock.module("@/lib/i18n/context", () => ({ useT: () => t, useI18n: () => ({ locale: "en", dir: "ltr", t }) }));

const { AppsGrid } = await import("@/components/device/apps-grid");
const { PagesTrack } = await import("@/components/device/pages-track");
const { ChannelHeader } = await import("@/components/device/channel-header");
const { useDeviceChatDots, useDevicePagerDots, useDeviceTileDots, useOpenAppDotClearing, useWalkieChatRead } = await import(
  "@/components/device/use-device-dots"
);

// ── Rows ────────────────────────────────────────────────────────────────────

const NOW = 1_800_000_000_000;
const ME = "aa".repeat(32);
const ORG = "org-1";
const CONV = "c0ffee00-0000-4000-8000-000000000001";
const CONV2 = "c0ffee00-0000-4000-8000-000000000002";

let seq = 0;
function row(type: string, link: string | null, ageMs = 0): DotRow {
  seq += 1;
  return { id: `n${seq}`, organizationId: ORG, targetHex: ME, type, link, read: false, createdAtMs: NOW - 60_000 + seq - ageMs };
}
const driveRow = () => row("doc_share", "/manager/docs/edit?id=d1");
const chatRow = (conversation: string | null) => row("team", conversation ? `/manager/channel?c=${conversation}` : "/manager/channel");

function stateOf(rows: DotRow[], surface: DeviceSurface = "personal"): DotState {
  return buildDotState({
    rows,
    nowMs: NOW,
    organizationId: ORG,
    selfHex: ME,
    surface,
    canViewTeam: true,
    sections: [],
    deviceTileVisible: () => true,
    merchivaRail: false,
  });
}

/** Lets React commit and run passive effects. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

let app: ReturnType<typeof render> | null = null;

beforeEach(() => {
  fake = { state: EMPTY_DOT_STATE, dotsVisible: true, attended: true };
  markDotReadCalls.length = 0;
  markReadCalls.length = 0;
  markConversationCalls.length = 0;
});

afterEach(() => {
  app?.unmount();
  app = null;
});

/** Every `<button …data-app-tile="id"…>…</button>` in the markup (grid copy first, then the dock's). */
function tiles(html: string, id: string): string[] {
  return [...html.matchAll(new RegExp(`<button[^>]*data-app-tile="${id}"[^>]*>[\\s\\S]*?</button>`, "g"))].map((m) => m[0]);
}

const APPS = [
  { id: "drive", label: "Drive", color: "violet" as const, dock: true },
  { id: "schedule", label: "Schedule", color: "indigo" as const, dock: true },
  { id: "directory", label: "Directory", color: "teal" as const },
];

/** The grid as the device screens wire it. */
function Grid() {
  return <AppsGrid apps={APPS} onOpen={() => {}} dots={useDeviceTileDots()} />;
}

const CHANNELS = [
  { id: CONV, name: "Front desk", type: "group" as const, memberCount: 3 },
  { id: CONV2, name: "Kitchen", type: "group" as const, memberCount: 2 },
];

/** The channel header as the device screens wire it. */
function Header({ readOnly = false }: { readOnly?: boolean }) {
  return <ChannelHeader channels={CHANNELS} activeIndex={0} onSelect={() => {}} dots={useDeviceChatDots()} readOnly={readOnly} />;
}

// ── Placements ──────────────────────────────────────────────────────────────

describe("device tiles", () => {
  test("a tile with something new carries the md dot on its icon corner, in the grid and the dock", () => {
    fake.state = stateOf([driveRow()]);
    const html = renderToStaticMarkup(<Grid />);
    const drive = tiles(html, "drive");
    expect(drive.length).toBe(2);
    for (const tile of drive) {
      expect(tile).toContain('aria-label="Drive, new activity"');
      // The dot sits inside the icon, which is the positioning parent.
      expect(tile).toMatch(/<span[^>]*data-app-icon="[^"]*"[^>]*class="relative [^"]*"[^>]*>[\s\S]*data-notification-dot=""[^>]*class="[^"]*size-3[^"]*-top-0\.5 -end-0\.5/);
    }
    for (const id of ["schedule", "directory"]) for (const tile of tiles(html, id)) expect(tile).not.toContain("data-notification-dot");
  });

  test("dock copies are named without a dot; grid copies keep their visible label", () => {
    const html = renderToStaticMarkup(<Grid />);
    const [gridSchedule, dockSchedule] = tiles(html, "schedule");
    expect(gridSchedule).not.toContain("aria-label");
    expect(dockSchedule).toContain('aria-label="Schedule"');
    expect(html).not.toContain("data-notification-dot");
  });

  test("a team join lights Directory; rows no device shows light nothing", () => {
    fake.state = stateOf([
      row("team", "/manager/personnel/team"),
      row("security", "/manager/personnel/team"),
      row("form_response", "/manager/forms/edit?id=f1"),
      row("time_off", "/manager/personnel"),
    ]);
    const html = renderToStaticMarkup(<Grid />);
    expect(tiles(html, "directory")[0]).toContain("data-notification-dot");
    expect(html.match(/data-notification-dot/g)?.length).toBe(1);
  });
});

describe("pager page indicator", () => {
  const pages = [<div key="a">A</div>, <div key="b">B</div>];

  test("the off-screen page with a dot shows the notification dot instead of its page dot, and says so in its name", () => {
    const onApps = renderToStaticMarkup(<PagesTrack page={1} onPageChange={() => {}} pages={pages} dots={[true, true]} />);
    expect(onApps.match(/data-notification-dot/g)?.length).toBe(1);
    expect(onApps).toMatch(/aria-label="Page 1, new activity"[^>]*>(?:(?!<\/button>)[\s\S])*data-notification-dot/);
    expect(onApps).toMatch(/aria-label="Page 2" aria-current="true"/);
    const onChannel = renderToStaticMarkup(<PagesTrack page={0} onPageChange={() => {}} pages={pages} dots={[true, true]} />);
    expect(onChannel).toMatch(/aria-label="Page 2, new activity"[^>]*>(?:(?!<\/button>)[\s\S])*data-notification-dot/);
    expect(onChannel).toMatch(/aria-label="Page 1" aria-current="true"/);
    expect(onChannel).not.toMatch(/aria-label="Page 1[^"]*"[^>]*>(?:(?!<\/button>)[\s\S])*data-notification-dot/);
  });

  test("no dots, no notification dot", () => {
    const plain = renderToStaticMarkup(<PagesTrack page={0} onPageChange={() => {}} pages={pages} dots={[false, false]} />);
    expect(plain).not.toContain("data-notification-dot");
    expect(plain).not.toContain("new activity");
    expect(renderToStaticMarkup(<PagesTrack page={0} onPageChange={() => {}} pages={pages} />)).not.toContain("data-notification-dot");
  });
});

describe("channel chip", () => {
  test("any conversation with something new puts the dot on the chip's top-end corner, with a screen-reader label", () => {
    fake.state = stateOf([chatRow(CONV2)]);
    const html = renderToStaticMarkup(<Header />);
    expect(html).toMatch(/<button[^>]*class="relative inline-flex[^"]*"[^>]*>[\s\S]*Front desk[\s\S]*data-notification-dot=""[^>]*-top-0\.5 -end-0\.5[\s\S]*<span class="sr-only">New activity<\/span>[\s\S]*<\/button>/);
  });

  test("nothing new, or the read-only lock-screen chip: no dot", () => {
    expect(renderToStaticMarkup(<Header />)).not.toContain("data-notification-dot");
    fake.state = stateOf([chatRow(CONV)]);
    expect(renderToStaticMarkup(<Header readOnly />)).not.toContain("data-notification-dot");
  });
});

// ── Hooks ───────────────────────────────────────────────────────────────────

function TileDotsProbe({ onDots }: { onDots: (ids: ReadonlySet<string>) => void }) {
  onDots(useDeviceTileDots());
  return null;
}

function ChatDotsProbe({ onDots }: { onDots: (dots: { any: boolean; conversations: ReadonlySet<string> }) => void }) {
  onDots(useDeviceChatDots());
  return null;
}

describe("useDeviceChatDots / useDeviceTileDots", () => {
  test("conversations with something new, and the chip's aggregate (rows with no conversation count)", () => {
    let dots = { any: false, conversations: new Set<string>() as ReadonlySet<string> };
    fake.state = stateOf([chatRow(CONV2), chatRow(null), driveRow()]);
    renderToStaticMarkup(<ChatDotsProbe onDots={(d) => { dots = d; }} />);
    expect(dots.any).toBe(true);
    expect([...dots.conversations]).toEqual([CONV2]);
    fake.state = stateOf([driveRow()]);
    renderToStaticMarkup(<ChatDotsProbe onDots={(d) => { dots = d; }} />);
    expect(dots.any).toBe(false);
  });

  test("tiles: only Drive, Inventory and Directory, never a row no device shows", () => {
    let ids: ReadonlySet<string> = new Set();
    fake.state = stateOf([
      driveRow(),
      row("inventory_low", "/manager/inventory"),
      row("team", "/manager/personnel/team"),
      row("security", "/manager/personnel/team"),
      row("form_response", "/manager/forms/edit?id=f1"),
      row("shift_trade", "/manager/personnel"),
      chatRow(CONV),
    ]);
    renderToStaticMarkup(<TileDotsProbe onDots={(d) => { ids = d; }} />);
    expect([...ids].sort()).toEqual(["directory", "drive", "inventory"]);
  });
});

function PagerProbe({ onDots }: { onDots: (dots: readonly boolean[]) => void }) {
  onDots(useDevicePagerDots());
  return null;
}

describe("useDevicePagerDots", () => {
  test("channel page for chats, apps page for tiles", () => {
    let dots: readonly boolean[] = [];
    fake.state = stateOf([chatRow(CONV)]);
    renderToStaticMarkup(<PagerProbe onDots={(d) => { dots = d; }} />);
    expect(dots).toEqual([true, false]);
    fake.state = stateOf([driveRow(), row("time_off", "/manager/personnel")]);
    renderToStaticMarkup(<PagerProbe onDots={(d) => { dots = d; }} />);
    expect(dots).toEqual([false, true]);
  });
});

function OpenApp({ appId }: { appId: string | null }) {
  useOpenAppDotClearing(appId);
  return null;
}

describe("useOpenAppDotClearing", () => {
  test("opening a tile a notification lights marks its rows read", async () => {
    fake.state = stateOf([driveRow()]);
    app = render(<OpenApp appId="drive" />);
    await settle();
    expect(markDotReadCalls).toEqual([{ app: "drive" }]);
  });

  test("any other app, or none, marks nothing", async () => {
    fake.state = stateOf([driveRow(), chatRow(CONV), row("time_off", "/manager/personnel")]);
    app = render(<OpenApp appId={null} />);
    await settle();
    for (const id of ["schedule", "forms", "channel", "requests", "settings"]) {
      app.rerender(<OpenApp appId={id} />);
      await settle();
    }
    expect(markDotReadCalls).toEqual([]);
  });

  test("a page nobody is at waits until someone is", async () => {
    fake.state = stateOf([driveRow()]);
    fake.attended = false;
    app = render(<OpenApp appId="inventory" />);
    await settle();
    expect(markDotReadCalls).toEqual([]);
    setFake({ attended: true });
    await settle();
    expect(markDotReadCalls).toEqual([{ app: "inventory" }]);
  });

  test("once per open: a row that lands while the app is open keeps its dot until the tile opens again", async () => {
    fake.state = stateOf([driveRow()]);
    app = render(<OpenApp appId="drive" />);
    await settle();
    expect(markDotReadCalls).toEqual([{ app: "drive" }]);
    setFake({ state: stateOf([driveRow()]) });
    await settle();
    // Someone coming back to the page does not read it either.
    setFake({ attended: false });
    await settle();
    setFake({ attended: true });
    await settle();
    expect(markDotReadCalls).toEqual([{ app: "drive" }]);
    app.rerender(<OpenApp appId={null} />);
    await settle();
    app.rerender(<OpenApp appId="drive" />);
    await settle();
    expect(markDotReadCalls).toEqual([{ app: "drive" }, { app: "drive" }]);
  });
});

function Walkie({ conversationId, onScreen }: { conversationId: string | null; onScreen: boolean }) {
  useWalkieChatRead(conversationId, onScreen);
  return null;
}

describe("useWalkieChatRead", () => {
  test("the conversation on screen is marked read, again for every newer row", async () => {
    fake.state = stateOf([chatRow(CONV)]);
    app = render(<Walkie conversationId={CONV} onScreen />);
    await settle();
    expect(markConversationCalls).toEqual([CONV]);
    setFake({ state: stateOf([chatRow(CONV), chatRow(CONV)]) });
    await settle();
    expect(markConversationCalls).toEqual([CONV, CONV]);
    // Another conversation's row is not this one's business.
    setFake({ state: stateOf([chatRow(CONV2)]) });
    await settle();
    expect(markConversationCalls).toEqual([CONV, CONV]);
  });

  test("nothing new, off screen, nobody at the page or a shared tablet: no call", async () => {
    app = render(<Walkie conversationId={CONV} onScreen />);
    await settle();
    expect(markConversationCalls).toEqual([]);
    setFake({ state: stateOf([chatRow(CONV)], "store"), dotsVisible: false });
    await settle();
    app.rerender(<Walkie conversationId={CONV} onScreen={false} />);
    setFake({ dotsVisible: true, attended: false });
    await settle();
    expect(markConversationCalls).toEqual([]);
    app.rerender(<Walkie conversationId={CONV} onScreen />);
    await settle();
    expect(markConversationCalls).toEqual([]);
    setFake({ attended: true });
    await settle();
    expect(markConversationCalls).toEqual([CONV]);
  });

  test("chat rows that name no conversation are read while the walkie is on screen", async () => {
    const loose = chatRow(null);
    fake.state = stateOf([loose, chatRow(CONV2)]);
    app = render(<Walkie conversationId={CONV} onScreen={false} />);
    await settle();
    expect(markReadCalls).toEqual([]);
    app.rerender(<Walkie conversationId={CONV} onScreen />);
    await settle();
    expect(markReadCalls).toEqual([[loose.id]]);
    expect(markConversationCalls).toEqual([]);
  });
});
