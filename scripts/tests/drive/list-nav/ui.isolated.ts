// The Drive manager list, nav and toolbar pieces with React (drive-ui §6.4, §7.2–§7.5, §11), run in a
// child process by ui.test.ts: `mock.module` replaces next/link, next/dynamic, the signed-URL hook and the
// i18n context (en messages overlaid with every Drive fragment's en leaves), and a fake `Element` stands in
// for the DOM the results keyboard reads.

import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import type { DriveSelection } from "@/components/drive/list/use-selection";

/** Just enough of an element for onDriveResultsKeyDown: attributes, a parent, closest() and contains(). */
class FakeElement {
  constructor(
    readonly tag: string,
    readonly attrs: Record<string, string> = {},
    readonly parent: FakeElement | null = null,
  ) {}
  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }
  contains(other: FakeElement | null): boolean {
    for (let node = other; node; node = node.parent) if (node === this) return true;
    return false;
  }
  /** Tag, `[attr]`, `[attr=value]`, `[attr='value']` and `:not([...])` parts: what use-selection.ts asks. */
  matches(selector: string): boolean {
    return selector.split(",").some((one) => {
      const parts = /^([a-z]*)((?:\[[^\]]+\]|:not\(\[[^\]]+\]\))*)$/.exec(one.trim());
      if (!parts) throw new Error(`unsupported selector ${one}`);
      if (parts[1] && parts[1] !== this.tag) return false;
      for (const [, not, name, quoted, bare] of parts[2].matchAll(/(:not\()?\[([\w-]+)(?:=(?:'([^']*)'|([^\]]*)))?\]\)?/g)) {
        const want = quoted ?? bare;
        const has = name in this.attrs && (want === undefined || this.attrs[name] === want);
        if (not ? has : !has) return false;
      }
      return true;
    });
  }
  closest(selector: string): FakeElement | null {
    return this.matches(selector) ? this : (this.parent?.closest(selector) ?? null);
  }
}

Object.assign(globalThis, {
  Element: FakeElement,
  window: {
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
  },
});

mock.module("next/link", () => ({
  default: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean; children?: ReactNode } & Record<string, unknown>) => {
    void prefetch;
    return h("a", { href, ...rest }, children);
  },
}));
mock.module("next/dynamic", () => ({ default: () => () => null }));
mock.module("@/lib/drive/use-drive-url", () => ({
  useDriveUrl: (id: string | null, variant: string) => ({ url: id ? `https://blob.test/${variant}/${id}` : null, loading: false, error: null }),
}));

const { flattenMessages, leavesOf, loadFragments } = await import("@/scripts/i18n/drive/fragment");
const ROOT = join(import.meta.dir, "..", "..", "..", "..");
const EN = flattenMessages(JSON.parse(readFileSync(join(ROOT, "messages", "en.json"), "utf8")));
for (const fragment of loadFragments()) for (const [key, value] of leavesOf(fragment, "en")) EN.set(key, value);
const tr = (key: string) => EN.get(key) ?? `!${key}`;
mock.module("@/lib/i18n/context", () => ({ useT: () => tr, useI18n: () => ({ locale: "en", dir: "ltr", setLocale() {}, t: tr }) }));

const { createElement: h } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { render } = await import("ink-testing-library");
const { onDriveResultsKeyDown } = await import("@/components/drive/list/use-selection");
const { parseDragKeys } = await import("@/components/drive/list/use-entry-dnd");
const { spaceHintText, useEntryItem } = await import("@/components/drive/list/entry-card");
const { EntryGrid } = await import("@/components/drive/list/entry-grid");
const { crumbLabel, foldCrumbs } = await import("@/components/drive/toolbar/breadcrumbs");
const { SelectionBar } = await import("@/components/drive/toolbar/selection-bar");
const { storageFigures } = await import("@/components/drive/nav/storage-meter");
const { driveHref } = await import("@/lib/drive/hrefs");
const { ANA, GONE, OWNER, item, world } = await import("./fixture");

type Entry = NonNullable<ReturnType<ReturnType<typeof world>["byKey"]["get"]>>;
type Selection = DriveSelection;
type KeyEvent = Parameters<typeof onDriveResultsKeyDown>[0];
type ItemProps = Parameters<typeof useEntryItem>[0];

const noop = () => {};
const own = item({ name: "shelf.pdf" });
const anas = world(ANA, [own]);
const ownEntry = anas.byKey.get(`item:${own.id}`) as Entry;
const ctx = { surface: "manager" as const, docsInstalled: true, section: "my" as const, offline: false };

function selectionOf(keys: string[], mode = false): Selection {
  const set = new Set(keys);
  return { keys: set, anchor: null, mode, isSelected: (k) => set.has(k), toggle: noop, extendTo: noop, set: noop, clear: noop, enterMode: noop };
}

describe("results keyboard", () => {
  const region = new FakeElement("div");
  const card = new FakeElement("div", { "data-drive-entry": ownEntry.key }, region);
  const link = new FakeElement("a", { href: "/manager/drive" }, card);
  const menu = new FakeElement("div", { role: "menu" }); // portaled to <body>: not inside the region
  const menuItem = new FakeElement("div", { role: "menuitem" }, menu);

  function press(key: string, target: FakeElement, opts: { offline?: boolean; defaultPrevented?: boolean; selected?: string[] } = {}) {
    const calls: string[] = [];
    let prevented = false;
    const event = {
      key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, defaultPrevented: opts.defaultPrevented ?? false,
      target, currentTarget: region, nativeEvent: { isComposing: false }, preventDefault: () => void (prevented = true),
    } as unknown as KeyEvent;
    onDriveResultsKeyDown(event, {
      entries: [ownEntry],
      selection: selectionOf(opts.selected ?? []),
      ctx: { ...ctx, offline: opts.offline ?? false },
      onAction: (entry, action) => calls.push(`${action} ${entry.key}`),
      onBulkAction: (entries, action) => calls.push(`bulk ${action} ${entries.length}`),
    });
    return { calls, prevented };
  }

  test("keys inside the results region act on the focused or selected entries", () => {
    expect(press("Delete", link, { selected: [ownEntry.key] })).toEqual({ calls: ["bulk trash 1"], prevented: true });
    expect(press(" ", link)).toEqual({ calls: [`preview ${ownEntry.key}`], prevented: true });
    expect(press("Delete", link)).toEqual({ calls: [`trash ${ownEntry.key}`], prevented: true });
  });

  test("keys from a portaled menu or dialog, or already handled, are ignored", () => {
    expect(press("Delete", menuItem, { selected: [ownEntry.key] })).toEqual({ calls: [], prevented: false });
    expect(press(" ", menuItem)).toEqual({ calls: [], prevented: false });
    expect(press("Delete", link, { selected: [ownEntry.key], defaultPrevented: true })).toEqual({ calls: [], prevented: false });
  });

  test("offline, Delete trashes nothing (the selection bar and menus offer no writes either)", () => {
    expect(press("Delete", link, { selected: [ownEntry.key], offline: true })).toEqual({ calls: [], prevented: false });
    expect(press("Delete", link, { offline: true })).toEqual({ calls: [], prevented: false });
  });
});

describe("entry links", () => {
  function ItemProbe({ report, ...props }: ItemProps & { report(item: ReturnType<typeof useEntryItem>): void }) {
    report(useEntryItem(props));
    return null;
  }
  const opened: string[] = [];
  function itemFor(selection: Selection, openInPlace: ItemProps["openInPlace"]) {
    const box: { item: ReturnType<typeof useEntryItem> | null } = { item: null };
    const props: ItemProps = {
      section: "my", sort: "name", now: Date.now(), ctx, selection, entry: ownEntry, orderedKeys: [ownEntry.key], selectedEntries: [],
      hrefFor: (entry) => driveHref({ preview: entry.key }), onAction: noop, onBulkAction: noop, openInPlace,
    };
    const app = render(h(ItemProbe, { ...props, report: (value) => void (box.item = value) }));
    app.unmount();
    if (!box.item) throw new Error("not rendered");
    return box.item;
  }
  function click(target: ReturnType<typeof useEntryItem>, mods: Partial<{ button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) {
    let prevented = false;
    const event = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, preventDefault: () => void (prevented = true), ...mods };
    target.onLinkClick(event as unknown as Parameters<ReturnType<typeof useEntryItem>["onLinkClick"]>[0]);
    return prevented;
  }

  test("a plain click the page opens in place skips the link; modified and middle clicks stay links", () => {
    const entryItem = itemFor(selectionOf([]), (entry) => (opened.push(entry.key), true));
    expect(entryItem.href).toBe(`/manager/drive?preview=${encodeURIComponent(ownEntry.key)}`);
    expect(click(entryItem)).toBe(true);
    expect(opened).toEqual([ownEntry.key]);
    expect(click(entryItem, { metaKey: true })).toBe(false);
    expect(click(entryItem, { ctrlKey: true })).toBe(false);
    expect(click(entryItem, { button: 1 })).toBe(false);
    expect(opened).toEqual([ownEntry.key]);
  });

  test("declined or absent openInPlace lets the link navigate; touch selection mode toggles instead", () => {
    expect(click(itemFor(selectionOf([]), () => false))).toBe(false);
    expect(click(itemFor(selectionOf([]), undefined))).toBe(false);
    opened.length = 0;
    expect(click(itemFor(selectionOf([], true), (entry) => (opened.push(entry.key), true)))).toBe(true);
    expect(opened).toEqual([]);
  });
});

describe("space hint", () => {
  const anasFile = item({ name: "rota.pdf" });
  const gonesFile = item({ name: "old.pdf", ownerMemberId: GONE.id, createdByMemberId: GONE.id });
  const storeFile = item({ space: "store", name: "menu.pdf" });
  const owners = world(OWNER, [anasFile, gonesFile, storeFile]);
  const hint = (tree: ReturnType<typeof world>, id: string) => spaceHintText(tree.byKey.get(`item:${id}`) as Entry, tr);

  test("the viewer's own file, another member's, a former member's, and Store", () => {
    expect(hint(world(ANA, [anasFile]), anasFile.id)).toBe("In your files. Store management can see it.");
    expect(hint(owners, anasFile.id)).toBe("In Ana Ruiz's files. Store management can see it.");
    expect(hint(owners, gonesFile.id)).toBe("In a former member's files. Store management can see it.");
    expect(hint(owners, storeFile.id)).toBe("Everyone in the store");
  });

  test("the grid card says whose files an entry is in", () => {
    const entries = [owners.byKey.get(`item:${anasFile.id}`) as Entry];
    const html = renderToStaticMarkup(
      h(EntryGrid, {
        entries, section: "members", sort: "name", now: Date.now(), ctx: { ...ctx, section: "members" }, selection: selectionOf([]),
        hrefFor: (entry: Entry) => driveHref({ preview: entry.key }), onAction: noop, onBulkAction: noop,
      }),
    ).replace(/&#x27;/g, "'");
    expect(html).toContain("In Ana Ruiz's files. Store management can see it.");
    expect(html).not.toContain("In your files.");
    expect(html).not.toContain("!drive.");
  });
});

describe("selection bar", () => {
  test("the phone bar sticks inside the page's scroller instead of fixing to the viewport under the shell chrome", () => {
    const html = renderToStaticMarkup(h(SelectionBar, { entries: [ownEntry], section: "my", onAction: noop, onClear: noop, floating: true }));
    expect(html).toContain("1 selected");
    expect(html).toContain("sticky");
    expect(html).toContain("--shell-scroll-pad");
    expect(html).not.toMatch(/class="[^"]*\bfixed\b/);
  });

  test("offline it offers downloading only", () => {
    const html = renderToStaticMarkup(h(SelectionBar, { entries: [ownEntry], section: "my", onAction: noop, onClear: noop, offline: true }));
    expect(html).toContain('title="Download"');
    expect(html).not.toContain('title="Move to trash"');
  });
});

describe("drag payload, crumbs and storage", () => {
  test("drag keys parse only as a non-empty list of strings", () => {
    expect(parseDragKeys(JSON.stringify(["item:a", "doc:b"]))).toEqual(["item:a", "doc:b"]);
    for (const raw of ["", "{", "[]", JSON.stringify(["a", 1]), JSON.stringify({ a: 1 })]) expect(parseDragKeys(raw)).toBeNull();
  });

  test("a long path keeps its first and last crumbs; labels fall back to the untitled folder", () => {
    expect(foldCrumbs([1, 2, 3])).toEqual({ head: [1, 2, 3], folded: [], tail: [] });
    expect(foldCrumbs([1, 2, 3, 4, 5, 6], 3)).toEqual({ head: [1], folded: [2, 3, 4], tail: [5, 6] });
    const crumb = { key: "k", label: " ", labelKey: null, params: {}, dropTarget: null };
    expect(crumbLabel(crumb, tr)).toBe(tr("drive.list.untitled.folder"));
    expect(crumbLabel({ ...crumb, label: null, labelKey: "drive.nav.memberFiles", labelVars: { name: "Ana" } }, tr)).toBe("Ana's files");
  });

  test("storage counts reserved bytes and warns near the quota", () => {
    expect(storageFigures({ usedBytes: 50, reservedBytes: 10, quotaBytes: 100 })).toEqual({ used: 60, total: 100, percent: 60, level: "ok" });
    expect(storageFigures({ usedBytes: 85, reservedBytes: 5, quotaBytes: 100 }).level).toBe("warning");
    expect(storageFigures({ usedBytes: 100, reservedBytes: 30, quotaBytes: 100 })).toEqual({ used: 130, total: 100, percent: 100, level: "full" });
    expect(storageFigures({ usedBytes: 1, reservedBytes: 0, quotaBytes: 0 }).percent).toBeNull();
  });
});
