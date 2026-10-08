import { describe, expect, test } from "bun:test";
import {
  ANCHOR_MAX,
  PAGE_ANCHOR,
  anchorElementOf,
  decodeAnchor,
  describeAnchor,
  encodeAnchor,
  isPageAnchor,
  navPresenceId,
  resolveAnchor,
  type AnchorNode,
} from "@/lib/presence/anchor";
import { fnv1a } from "@/lib/presence/hash";
import { isPresenceAnchor } from "@/spacetimedb/src/presence/validate";

/** A minimal element: the AnchorNode surface, plus content getters the anchor code must never touch. */
class El implements AnchorNode {
  readonly tagName: string;
  parentElement: El | null = null;
  readonly children: El[];
  private readonly attrs: Record<string, string>;

  constructor(tag: string, attrs: Record<string, string>, children: El[]) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.children = children;
    for (const child of children) child.parentElement = this;
  }

  getAttribute(name: string): string | null {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  querySelectorAll(selector: string): El[] {
    const matches = matcher(selector);
    const out: El[] = [];
    const walk = (el: El) => {
      for (const child of el.children) {
        if (matches(child)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  get textContent(): string {
    throw new Error("textContent was read");
  }

  get value(): string {
    throw new Error("value was read");
  }
}

/** The selectors lib/presence/anchor.ts uses: `[attr]` and `tag[attr]`. */
function matcher(selector: string): (el: El) => boolean {
  const m = /^(\w*)\[([\w-]+)\]$/.exec(selector);
  if (!m) throw new Error(`unsupported selector ${selector}`);
  const [, tag, name] = m;
  return (el) => (!tag || el.tagName === tag.toUpperCase()) && el.getAttribute(name) !== null;
}

function h(tag: string, attrs: Record<string, string> = {}, ...children: El[]): El {
  return new El(tag, attrs, children);
}

/** One page as a client renders it; `presenceId: false` drops the opt-in id (an older client). */
function page(opts: { presenceId?: boolean; extraLinkFirst?: boolean } = {}) {
  const icon = h("path");
  const svg = h("svg", {}, icon);
  const iconHolder = h("div", {}, svg);
  const deleteAlice = h("button", { "aria-label": "Delete Alice" });
  const deleteBob = h("button", { "aria-label": "Delete Bob" });
  const listButton = h("button", {}, h("span"));
  const list = h(
    "section",
    opts.presenceId === false ? {} : { "data-presence-id": "inventory.list" },
    h("ul", {}, h("li", {}, listButton), h("li", {}, h("span"))),
  );
  const linkLabel = h("span");
  const secondInventoryLink = h("a", { href: "/manager/inventory?item=42" }, linkLabel);
  const links = h(
    "div",
    {},
    ...(opts.extraLinkFirst ? [h("a", { href: "/manager/inventory" })] : []),
    h("a", { href: "/manager/inventory#top" }),
    h("a", { href: "https://example.com/manager/inventory" }),
    secondInventoryLink,
    h("a", { href: "/manager/suppliers" }),
  );
  const search = h("input", { name: "search" });
  const deep = h("span");
  const plain = h("div", {}, h("div", {}, deep));
  const root = h(
    "div",
    { "data-tab-slot": "t_1" },
    h("main", {}, h("div", {}, h("h1"), list, links, deleteAlice, deleteBob, search, plain, iconHolder)),
  );
  return { root, list, listButton, linkLabel, secondInventoryLink, deleteAlice, deleteBob, search, deep, plain, icon, iconHolder };
}

describe("describeAnchor", () => {
  test("anchors to the nearest opted-in element, most stable candidate first", () => {
    const clicker = page();
    const described = describeAnchor(clicker.listButton.children[0], clicker.root);
    expect(described?.element).toBe(clicker.list);
    const lines = decodeAnchor(described?.anchor ?? "");
    expect(lines[0]).toBe("id:inventory.list");
    expect(lines[lines.length - 1]).toBe("path:main:1>div:1>section:1");

    const viewer = page();
    expect(resolveAnchor(viewer.root, described?.anchor ?? "")).toBe(viewer.list);
  });

  test("a link is anchored by its /manager path without the query, counted among links to that page", () => {
    const clicker = page();
    const described = describeAnchor(clicker.linkLabel, clicker.root);
    expect(described?.element).toBe(clicker.secondInventoryLink);
    expect(decodeAnchor(described?.anchor ?? "")[0]).toBe("href:/manager/inventory@1");
    expect(described?.anchor).not.toContain("item=42");

    const viewer = page();
    expect(resolveAnchor(viewer.root, described?.anchor ?? "")).toBe(viewer.secondInventoryLink);
  });

  test("labels leave the device hashed and still resolve on another client", () => {
    const clicker = page();
    const described = describeAnchor(clicker.deleteAlice, clicker.root);
    const anchor = described?.anchor ?? "";
    expect(decodeAnchor(anchor)[0]).toBe(`aria:${fnv1a("Delete Alice").toString(36)}@0`);
    expect(anchor).not.toContain("Alice");

    const viewer = page();
    expect(resolveAnchor(viewer.root, anchor)).toBe(viewer.deleteAlice);
  });

  test("a form control is anchored by its name attribute (hashed), never its value", () => {
    const clicker = page();
    const described = describeAnchor(clicker.search, clicker.root);
    expect(decodeAnchor(described?.anchor ?? "")[0]).toBe(`name:${fnv1a("search").toString(36)}@0`);
    const viewer = page();
    expect(resolveAnchor(viewer.root, described?.anchor ?? "")).toBe(viewer.search);
  });

  test("an unlabelled element is anchored by its structural path", () => {
    const clicker = page();
    const described = describeAnchor(clicker.deep, clicker.root);
    expect(described?.element).toBe(clicker.deep);
    expect(described?.anchor).toBe("path:main:1>div:1>div:2>div:1>span:1");
    const viewer = page();
    expect(resolveAnchor(viewer.root, described?.anchor ?? "")).toBe(viewer.deep);
  });

  test("SVG internals anchor to the element that draws them", () => {
    const clicker = page();
    expect(anchorElementOf(clicker.icon, clicker.root)).toBe(clicker.iconHolder);
  });

  test("a target outside the active slot has no anchor", () => {
    const clicker = page();
    const elsewhere = h("div", {}, h("button", { "aria-label": "Close" }));
    expect(describeAnchor(elsewhere.children[0], clicker.root)).toBeNull();
  });

  test("only attributes are read, and every anchor passes the module's validator", () => {
    const clicker = page();
    const all = [clicker.root, ...clicker.root.querySelectorAll("[href]"), ...collect(clicker.root)];
    for (const el of all) {
      const described = describeAnchor(el, clicker.root);
      expect(described).not.toBeNull();
      expect(isPresenceAnchor(described?.anchor ?? "")).toBe(true);
      expect((described?.anchor ?? "").length).toBeLessThanOrEqual(ANCHOR_MAX);
    }
  });

  test("an id that the module would reject is not a candidate", () => {
    const tooLong = h("div", { "data-presence-id": "x".repeat(201) });
    const control = h("div", { "data-presence-id": "bad\nid" });
    const separator = h("div", { "data-presence-id": "a|b" });
    const root = h("div", {}, tooLong, control, separator);
    expect(decodeAnchor(describeAnchor(tooLong, root)?.anchor ?? "")).toEqual(["path:div:1"]);
    expect(decodeAnchor(describeAnchor(control, root)?.anchor ?? "")).toEqual(["path:div:2"]);
    expect(decodeAnchor(describeAnchor(separator, root)?.anchor ?? "")).toEqual(["path:div:3"]);
  });
});

function collect(el: El): El[] {
  return el.children.flatMap((child) => [child, ...collect(child)]);
}

describe("resolveAnchor", () => {
  test("falls through to the next candidate when one does not resolve on this client", () => {
    const clicker = page();
    const anchor = describeAnchor(clicker.listButton, clicker.root)?.anchor ?? "";
    const viewer = page({ presenceId: false });
    expect(resolveAnchor(viewer.root, anchor)).toBe(viewer.list);
  });

  test("the n-th link is counted on the viewer's page, so an extra link shifts the match", () => {
    const clicker = page();
    const anchor = describeAnchor(clicker.linkLabel, clicker.root)?.anchor ?? "";
    const viewer = page({ extraLinkFirst: true });
    const resolved = resolveAnchor(viewer.root, anchor);
    expect(resolved?.getAttribute("href")).toBe("/manager/inventory#top");
  });

  test("elements the caller cannot use are skipped", () => {
    const clicker = page();
    const anchor = describeAnchor(clicker.listButton, clicker.root)?.anchor ?? "";
    const viewer = page();
    expect(resolveAnchor(viewer.root, anchor, (el) => el !== viewer.list)).toBeNull();
  });

  test("page and nav anchors, unknown kinds and malformed candidates resolve to nothing", () => {
    const viewer = page();
    expect(resolveAnchor(viewer.root, PAGE_ANCHOR)).toBeNull();
    expect(resolveAnchor(viewer.root, navPresenceId("/manager/inventory"))).toBeNull();
    expect(resolveAnchor(viewer.root, "href:/manager/inventory@x")).toBeNull();
    expect(resolveAnchor(viewer.root, "path:main:0")).toBeNull();
    expect(resolveAnchor(viewer.root, "path:main:1>table:1")).toBeNull();
    expect(resolveAnchor(viewer.root, "")).toBeNull();
  });

  test("an empty path is the slot itself", () => {
    const viewer = page();
    expect(resolveAnchor(viewer.root, "path:")).toBe(viewer.root);
  });
});

describe("anchor encoding", () => {
  test("keeps within the module limit by dropping the least stable candidates", () => {
    const candidates = ["id:" + "a".repeat(200), "href:/manager/" + "b".repeat(190) + "@0", "path:" + "div:1>".repeat(40) + "div:1"];
    const anchor = encodeAnchor(candidates);
    expect(anchor.length).toBeLessThanOrEqual(ANCHOR_MAX);
    expect(decodeAnchor(anchor)).toEqual(candidates.slice(0, 2));
  });

  test("round-trips candidate lists", () => {
    expect(decodeAnchor(encodeAnchor(["id:a", "path:div:1"]))).toEqual(["id:a", "path:div:1"]);
    expect(decodeAnchor("")).toEqual([]);
  });

  test("page and nav helpers", () => {
    expect(isPageAnchor(PAGE_ANCHOR)).toBe(true);
    expect(isPageAnchor("id:x")).toBe(false);
    expect(navPresenceId("/manager/inventory")).toBe("nav:/manager/inventory");
  });
});
