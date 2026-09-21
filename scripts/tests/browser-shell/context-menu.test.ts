import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  installContextMenuInterceptor,
  registerContextMenuTarget,
  resolveContextHit,
  type ShellContextHit,
  type ShellContextMenuItem,
} from "@/lib/browser-shell/context-menu";
import { buildContextMenu, snippet, type ContextMenuDeps, type ContextMenuHandlers } from "@/lib/browser-shell/context-menu-items";

/*
 * The shell context menu. There is no jsdom in this suite, so the DOM classes `resolveContextHit`
 * narrows on are installed as globals and the fakes extend them — `node instanceof HTMLInputElement`
 * then behaves exactly as it does in a browser.
 */

// ─── Fake DOM ────────────────────────────────────────────────────────────────

class FakeElement {
  parentElement: FakeElement | null = null;
  optOut = false;
  textContent = "";

  appendTo(parent: FakeElement): this {
    this.parentElement = parent;
    return this;
  }

  closest(selector: string): FakeElement | null {
    for (let node: FakeElement | null = this; node; node = node.parentElement) {
      if (selector === "[data-shell-context-menu='off']" && node.optOut) return node;
    }
    return null;
  }
}

class FakeAnchor extends FakeElement {
  href = "";
}

class FakeImage extends FakeElement {
  src = "";
  currentSrc = "";
  alt = "";
}

class FakeInput extends FakeElement {
  type = "text";
  value = "";
  readOnly = false;
  disabled = false;
  selectionStart: number | null = 0;
  selectionEnd: number | null = 0;
}

class FakeTextArea extends FakeInput {}

const globals = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};
const DOM_GLOBALS = [
  "Element", "HTMLElement", "HTMLAnchorElement", "SVGAElement",
  "HTMLImageElement", "HTMLInputElement", "HTMLTextAreaElement", "window",
];

let listeners: Array<(event: unknown) => void> = [];

beforeEach(() => {
  for (const key of DOM_GLOBALS) saved[key] = globals[key];
  listeners = [];
  Object.assign(globals, {
    Element: FakeElement,
    HTMLElement: FakeElement,
    HTMLAnchorElement: FakeAnchor,
    HTMLImageElement: FakeImage,
    HTMLInputElement: FakeInput,
    HTMLTextAreaElement: FakeTextArea,
    // No SVG links in these cases; keep the branch reachable but never matching.
    SVGAElement: class FakeSvgAnchor {},
    window: {
      // canonicalizeUrl resolves hrefs against window.location, so in-app links must share this host.
      location: { href: "https://app.test/manager/inventory" },
      getSelection: () => null,
      addEventListener: (_type: string, fn: (event: unknown) => void) => listeners.push(fn),
      removeEventListener: (_type: string, fn: (event: unknown) => void) => {
        listeners = listeners.filter((entry) => entry !== fn);
      },
    },
  });
});

afterEach(() => {
  for (const key of DOM_GLOBALS) globals[key] = saved[key];
});

function contextEvent(target: FakeElement, opts: { defaultPrevented?: boolean } = {}) {
  return {
    target,
    clientX: 120,
    clientY: 240,
    defaultPrevented: opts.defaultPrevented ?? false,
    preventDefault() {
      (this as { defaultPrevented: boolean }).defaultPrevented = true;
    },
  };
}

function hitFor(target: FakeElement, opts?: { defaultPrevented?: boolean }): ShellContextHit | null {
  return resolveContextHit(contextEvent(target, opts) as unknown as MouseEvent);
}

// ─── Deps for buildContextMenu ───────────────────────────────────────────────

const noopHandlers: ContextMenuHandlers = {
  openInNewTab: () => {}, openExternal: () => {}, copy: () => {}, copyUrl: () => {},
  bookmark: () => {}, unbookmarkPage: () => {}, search: () => {}, cut: () => {},
  copySelectionInField: () => {}, paste: () => {}, selectAll: () => {},
  back: () => {}, forward: () => {}, reload: () => {}, newTab: () => {},
};

function deps(overrides: Partial<ContextMenuDeps> = {}): ContextMenuDeps {
  return {
    t: (key) => key,
    inShell: true,
    canGoBack: true,
    canGoForward: false,
    pageUrl: "/manager/inventory",
    pageTitle: "Inventory",
    pageBookmarked: false,
    pageActions: [],
    shortcuts: { back: "⌘[", reload: "⌘R" },
    on: noopHandlers,
    ...overrides,
  };
}

const EMPTY_HIT: ShellContextHit = {
  x: 0, y: 0, custom: [], link: null, image: null, editable: null, selection: null,
};

function ids(hit: ShellContextHit, overrides?: Partial<ContextMenuDeps>): string[] {
  return buildContextMenu(hit, deps(overrides)).flatMap((group) => group.items.map((item) => item.id));
}

function itemById(hit: ShellContextHit, id: string, overrides?: Partial<ContextMenuDeps>): ShellContextMenuItem | undefined {
  return buildContextMenu(hit, deps(overrides))
    .flatMap((group) => group.items)
    .find((item) => item.id === id);
}

// ─── snippet ─────────────────────────────────────────────────────────────────

test("snippet collapses whitespace and ellipsizes long text", () => {
  expect(snippet("  hello \n  world  ")).toBe("hello world");
  expect(snippet("abcdefghij", 5)).toBe("abcd…");
  expect(snippet("abcde", 5)).toBe("abcde");
});

// ─── buildContextMenu ────────────────────────────────────────────────────────

test("a click on blank space is just the page group", () => {
  const groups = buildContextMenu(EMPTY_HIT, deps());
  expect(groups.map((group) => group.id)).toEqual(["page"]);
  expect(groups[0].items.map((item) => item.id)).toEqual([
    "page-back", "page-forward", "page-reload", "page-new-tab", "page-bookmark", "page-copy-link",
  ]);
});

test("back and forward are disabled from the nav state, and carry their shortcuts", () => {
  expect(itemById(EMPTY_HIT, "page-back")?.disabled).toBe(false);
  expect(itemById(EMPTY_HIT, "page-forward")?.disabled).toBe(true);
  expect(itemById(EMPTY_HIT, "page-back")?.shortcut).toBe("⌘[");
  // A command with no binding in this environment shows no shortcut at all.
  expect(itemById(EMPTY_HIT, "page-new-tab")?.shortcut).toBeUndefined();
});

test("a bookmarked page offers to remove the bookmark instead of adding one", () => {
  const menu = ids(EMPTY_HIT, { pageBookmarked: true });
  expect(menu).toContain("page-unbookmark");
  expect(menu).not.toContain("page-bookmark");
});

test("groups run specific to general: custom, link, image, selection, field, page actions, page", () => {
  const hit: ShellContextHit = {
    ...EMPTY_HIT,
    custom: [{ id: "row-edit", label: "Edit", onSelect: () => {} }],
    link: { href: "https://app.test/manager/sales", text: "Sales", inApp: "/manager/sales" },
    image: { src: "https://cdn.test/a.png", alt: "" },
    selection: "12 units",
  };
  const withActions = deps({ pageActions: [{ id: "page-action-docs-share", label: "Share", onSelect: () => {} }] });
  expect(buildContextMenu(hit, withActions).map((group) => group.id)).toEqual([
    "custom", "link", "image", "selection", "page-actions", "page",
  ]);
});

test("a page's registered actions sit just above the page group, and vanish when none are registered", () => {
  const withActions = ids(EMPTY_HIT, {
    pageActions: [{ id: "page-action-docs-outline", label: "Outline", onSelect: () => {} }],
  });
  expect(withActions.indexOf("page-action-docs-outline")).toBe(withActions.indexOf("page-back") - 1);
  expect(buildContextMenu(EMPTY_HIT, deps()).map((group) => group.id)).not.toContain("page-actions");
});

test("an in-app link opens in a tab, an external one opens in the browser", () => {
  const inApp: ShellContextHit = {
    ...EMPTY_HIT,
    link: { href: "https://app.test/manager/sales", text: "Sales", inApp: "/manager/sales" },
  };
  expect(ids(inApp)).toContain("link-new-tab");
  expect(ids(inApp)).toContain("link-background-tab");
  expect(ids(inApp)).toContain("link-bookmark");
  expect(ids(inApp)).not.toContain("link-external");

  const external: ShellContextHit = {
    ...EMPTY_HIT,
    link: { href: "https://squareup.com/dashboard", text: "Square", inApp: null },
  };
  expect(ids(external)).toContain("link-external");
  expect(ids(external)).toContain("link-copy");
  expect(ids(external)).not.toContain("link-new-tab");
  expect(ids(external)).not.toContain("link-bookmark");
});

test("outside the browser shell every tab and bookmark item is dropped", () => {
  const hit: ShellContextHit = {
    ...EMPTY_HIT,
    link: { href: "https://app.test/manager/sales", text: "Sales", inApp: "/manager/sales" },
    selection: "12 units",
  };
  const menu = ids(hit, { inShell: false });
  expect(menu).toEqual(["link-copy", "selection-copy", "page-back", "page-forward", "page-reload", "page-copy-link"]);
});

test("a password field never offers copy or cut, whatever is selected", () => {
  const hit: ShellContextHit = {
    ...EMPTY_HIT,
    editable: { element: {} as HTMLElement, writable: true, hasSelection: true, hasContent: true, masked: true },
  };
  expect(itemById(hit, "field-copy")?.disabled).toBe(true);
  expect(itemById(hit, "field-cut")?.disabled).toBe(true);
  expect(itemById(hit, "field-paste")?.disabled).toBe(false);
});

test("a readonly field keeps copy but loses cut and paste", () => {
  const hit: ShellContextHit = {
    ...EMPTY_HIT,
    editable: { element: {} as HTMLElement, writable: false, hasSelection: true, hasContent: true, masked: false },
  };
  expect(itemById(hit, "field-copy")?.disabled).toBe(false);
  expect(itemById(hit, "field-cut")?.disabled).toBe(true);
  expect(itemById(hit, "field-paste")?.disabled).toBe(true);
  expect(itemById(hit, "field-select-all")?.disabled).toBe(false);
});

test("an empty field cannot select all, and with nothing selected cannot copy", () => {
  const hit: ShellContextHit = {
    ...EMPTY_HIT,
    editable: { element: {} as HTMLElement, writable: true, hasSelection: false, hasContent: false, masked: false },
  };
  expect(itemById(hit, "field-select-all")?.disabled).toBe(true);
  expect(itemById(hit, "field-copy")?.disabled).toBe(true);
  expect(itemById(hit, "field-paste")?.disabled).toBe(false);
});

test("the search item quotes an ellipsized snippet of the selection", () => {
  const hit: ShellContextHit = { ...EMPTY_HIT, selection: "a very long selected sentence that will not fit" };
  expect(itemById(hit, "selection-search")?.label).toBe("browser.contextMenu.searchFor");
  // {text} is substituted before the label reaches the menu.
  const label = buildContextMenu(hit, deps({ t: () => "Search for “{text}”" }))
    .flatMap((group) => group.items)
    .find((item) => item.id === "selection-search")?.label;
  expect(label).toBe("Search for “a very long selected se…”");
});

// ─── resolveContextHit ───────────────────────────────────────────────────────

test("an event another menu already handled is left alone", () => {
  expect(hitFor(new FakeElement(), { defaultPrevented: true })).toBeNull();
});

test("data-shell-context-menu=off hands the native menu back for the subtree", () => {
  const optedOut = new FakeElement();
  optedOut.optOut = true;
  const child = new FakeElement().appendTo(optedOut);
  expect(hitFor(child)).toBeNull();
  expect(hitFor(new FakeElement())).not.toBeNull();
});

test("the pointer position is carried through to the menu", () => {
  const hit = hitFor(new FakeElement());
  expect(hit?.x).toBe(120);
  expect(hit?.y).toBe(240);
});

test("a keyboard-fired menu anchors to the focused element, not the window corner", () => {
  const focused = new FakeElement();
  (focused as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
    ({ left: 64, bottom: 180, width: 120, height: 32 }) as DOMRect;
  const event = { ...contextEvent(focused), clientX: 0, clientY: 0 };
  const hit = resolveContextHit(event as unknown as MouseEvent);
  expect(hit?.x).toBe(64);
  expect(hit?.y).toBe(180);
});

test("a zero-size element falls back to the reported coordinates", () => {
  const collapsed = new FakeElement();
  (collapsed as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () =>
    ({ left: 0, bottom: 0, width: 0, height: 0 }) as DOMRect;
  const event = { ...contextEvent(collapsed), clientX: 0, clientY: 0 };
  expect(resolveContextHit(event as unknown as MouseEvent)?.x).toBe(0);
});

test("registered items stack nearest-ancestor first and de-duplicate by id", () => {
  const table = new FakeElement();
  const row = new FakeElement().appendTo(table);
  const cell = new FakeElement().appendTo(row);
  const unregisterTable = registerContextMenuTarget(table as unknown as Element, () => [
    { id: "export", label: "Export table", onSelect: () => {} },
    { id: "edit", label: "Table edit", onSelect: () => {} },
  ]);
  const unregisterRow = registerContextMenuTarget(row as unknown as Element, () => [
    { id: "edit", label: "Edit row", onSelect: () => {} },
  ]);

  const hit = hitFor(cell);
  expect(hit?.custom.map((item) => item.id)).toEqual(["edit", "export"]);
  // The nearest registration wins the shared id.
  expect(hit?.custom[0].label).toBe("Edit row");

  unregisterRow();
  expect(hitFor(cell)?.custom.map((item) => item.label)).toEqual(["Export table", "Table edit"]);
  unregisterTable();
  expect(hitFor(cell)?.custom).toEqual([]);
});

test("contributed items are capped so a deep tree cannot grow an endless menu", () => {
  let node = new FakeElement();
  for (let depth = 0; depth < 10; depth++) {
    const parent = new FakeElement();
    node.parentElement = parent;
    registerContextMenuTarget(node as unknown as Element, () => [
      { id: `item-${depth}-a`, label: "a", onSelect: () => {} },
      { id: `item-${depth}-b`, label: "b", onSelect: () => {} },
    ]);
    node = parent;
  }
  const leaf = new FakeElement();
  leaf.parentElement = null;
  // Walk from the deepest registered node.
  const hit = hitFor(node);
  expect(hit?.custom.length).toBeLessThanOrEqual(12);
});

test("a builder that throws costs only its own items", () => {
  const outer = new FakeElement();
  const inner = new FakeElement().appendTo(outer);
  registerContextMenuTarget(inner as unknown as Element, () => {
    throw new Error("stale row");
  });
  registerContextMenuTarget(outer as unknown as Element, () => [{ id: "ok", label: "Still here", onSelect: () => {} }]);
  expect(hitFor(inner)?.custom.map((item) => item.id)).toEqual(["ok"]);
});

test("a builder returning null contributes nothing", () => {
  const el = new FakeElement();
  registerContextMenuTarget(el as unknown as Element, () => null);
  expect(hitFor(el)?.custom).toEqual([]);
});

test("an in-app anchor resolves to a tab URL, an external one does not", () => {
  const inApp = new FakeAnchor();
  inApp.href = "https://app.test/manager/inventory?tab=low";
  inApp.textContent = "  Low stock  ";
  const hit = hitFor(inApp);
  expect(hit?.link?.inApp).toBe("/manager/inventory?tab=low");
  expect(hit?.link?.text).toBe("Low stock");

  const external = new FakeAnchor();
  external.href = "https://squareup.com/dashboard";
  expect(hitFor(external)?.link?.inApp).toBeNull();
  expect(hitFor(external)?.link?.href).toBe("https://squareup.com/dashboard");
});

test("a javascript: href is not offered as a link", () => {
  const link = new FakeAnchor();
  link.href = "javascript:void(0)";
  expect(hitFor(link)?.link).toBeNull();
});

test("an image resolves to the source the browser actually painted", () => {
  const image = new FakeImage();
  image.src = "https://cdn.test/small.png";
  image.currentSrc = "https://cdn.test/large.png";
  image.alt = "Shelf";
  expect(hitFor(image)?.image).toEqual({ src: "https://cdn.test/large.png", alt: "Shelf" });
});

test("a text field reports what the edit items may do to it", () => {
  const input = new FakeInput();
  input.value = "SKU-1180";
  input.selectionStart = 0;
  input.selectionEnd = 3;
  const field = hitFor(input)?.editable;
  expect(field?.writable).toBe(true);
  expect(field?.hasSelection).toBe(true);
  expect(field?.hasContent).toBe(true);
  expect(field?.masked).toBe(false);

  const password = new FakeInput();
  password.type = "password";
  password.value = "hunter2";
  expect(hitFor(password)?.editable?.masked).toBe(true);

  const readonly = new FakeInput();
  readonly.readOnly = true;
  expect(hitFor(readonly)?.editable?.writable).toBe(false);
});

test("a checkbox is not a text field", () => {
  const checkbox = new FakeInput();
  checkbox.type = "checkbox";
  expect(hitFor(checkbox)?.editable).toBeNull();
});

test("a click inside a text field leaves the selection group to the field", () => {
  const input = new FakeInput();
  input.value = "SKU-1180";
  input.selectionStart = 0;
  input.selectionEnd = 3;
  const hit = hitFor(input);
  expect(hit?.editable).not.toBeNull();
  expect(hit?.selection).toBeNull();
});

// ─── installContextMenuInterceptor ───────────────────────────────────────────

test("the interceptor prevents the native menu and reports the hit", () => {
  const seen: ShellContextHit[] = [];
  const uninstall = installContextMenuInterceptor((hit) => seen.push(hit));
  expect(listeners.length).toBe(1);

  const event = contextEvent(new FakeElement());
  listeners[0](event);
  expect(event.defaultPrevented).toBe(true);
  expect(seen.length).toBe(1);

  // An event a nearer menu already claimed passes straight through.
  const claimed = contextEvent(new FakeElement(), { defaultPrevented: true });
  listeners[0](claimed);
  expect(seen.length).toBe(1);

  uninstall();
  expect(listeners.length).toBe(0);
});
