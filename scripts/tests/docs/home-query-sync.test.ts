import { describe, expect, test } from "bun:test";
import { parseDocsHomeParams, type DocScope, type DocsHomeParams } from "@/components/docs/home/doc-list-model";
import {
  docsHomeKey,
  docsHomeKeyFromSearch,
  initialDocsQuerySync,
  planDebouncedQueryWrite,
  planDocsHomeWrite,
  reconcileDocsQuery,
  type DocsQuerySync,
} from "@/components/docs/home/query-sync";

const paramsOf = (search: string): DocsHomeParams => parseDocsHomeParams(new URLSearchParams(search));

/** One browser-shell tab: its own history stack of `location.search` values. */
class Tab {
  entries: string[];
  index = 0;
  constructor(search = "") {
    this.entries = [search];
  }
  get search(): string {
    return this.entries[this.index];
  }
  push(search: string) {
    this.entries = [...this.entries.slice(0, this.index + 1), search];
    this.index += 1;
  }
  replace(search: string) {
    this.entries[this.index] = search;
  }
  back() {
    this.index -= 1;
  }
  forward() {
    this.index += 1;
  }
}

/**
 * The mounted docs home, driven the way useDocsHomeState drives query-sync: `render()` is a
 * render against the active tab's URL, `fireTimer()` is the debounce scheduled by the last
 * render firing now, and own writes record their echo before touching history.
 */
class Home {
  sync: DocsQuerySync;
  rendered: string;
  constructor(public tab: Tab) {
    this.rendered = tab.search;
    this.sync = initialDocsQuerySync(paramsOf(tab.search));
  }
  get draft() {
    return this.sync.draft;
  }
  render() {
    this.rendered = this.tab.search;
    this.sync = reconcileDocsQuery(this.sync, paramsOf(this.rendered));
  }
  type(text: string) {
    this.sync = { ...this.sync, draft: text };
  }
  commit(patch: Partial<DocsHomeParams>, mode: "push" | "replace") {
    const plan = planDocsHomeWrite(this.tab.search, patch);
    if (!plan) return;
    this.sync = { ...this.sync, echoKey: plan.key };
    if (mode === "push") this.tab.push(plan.search);
    else this.tab.replace(plan.search);
  }
  fireTimer(): boolean {
    const rendered = paramsOf(this.rendered);
    const plan = planDebouncedQueryWrite({
      draft: this.draft,
      renderedKey: docsHomeKey(rendered),
      renderedQuery: rendered.q,
      liveSearch: this.tab.search,
    });
    if (!plan) return false;
    this.sync = { ...this.sync, echoKey: plan.key };
    this.tab.replace(plan.search);
    return true;
  }
  setScope(scope: DocScope) {
    this.commit({ q: this.draft }, "replace");
    this.commit({ scope }, "push");
  }
  clearFilters() {
    this.sync = { ...this.sync, draft: "" };
    this.commit({ q: "", owner: "anyone" }, "replace");
  }
  /** Settles: render, let any debounce fire, render its echo. */
  settle() {
    this.render();
    if (this.fireTimer()) this.render();
  }
}

describe("docs home search draft vs URL", () => {
  test("Back then Forward shows each entry's search and never rewrites the forward entry", () => {
    const tab = new Tab();
    const home = new Home(tab);
    home.type("x");
    home.settle();
    home.setScope("starred");
    home.settle();
    home.type("y");
    home.settle();
    expect(tab.entries).toEqual(["?q=x", "?q=y&scope=starred"]);

    tab.back();
    home.render();
    expect(home.draft).toBe("x");
    expect(home.fireTimer()).toBe(false);

    tab.forward();
    home.render();
    expect(home.draft).toBe("y");
    expect(home.fireTimer()).toBe(false);
    expect(tab.entries).toEqual(["?q=x", "?q=y&scope=starred"]);
  });

  test("the echo of a debounced write keeps typing that is already ahead of it", () => {
    const tab = new Tab();
    const home = new Home(tab);
    home.type("abc");
    home.render();
    expect(home.fireTimer()).toBe(true);
    home.type("abcd"); // before the URL render lands
    home.render();
    expect(home.draft).toBe("abcd");
    expect(home.sync.echoKey).toBeNull();
    home.settle();
    expect(tab.search).toBe("?q=abcd");
    expect(home.draft).toBe("abcd");
  });

  test("the echo marker is one-shot: an external change first wins, later ones still apply", () => {
    const tab = new Tab("?q=y");
    const home = new Home(tab);
    tab.push("?q=x&scope=starred");
    home.render();
    home.type("z");
    home.render();
    expect(home.fireTimer()).toBe(true); // marker for q=z&scope=starred
    tab.back(); // before that write rendered
    home.render();
    expect(home.draft).toBe("y");
    tab.forward();
    home.render();
    expect(home.draft).toBe("z");
  });

  test("switching between two docs-home tabs follows each tab's own search", () => {
    const a = new Tab();
    const b = new Tab("?scope=starred");
    const home = new Home(a);
    home.type("abc");
    home.settle();

    home.tab = b;
    home.render();
    expect(home.draft).toBe("");
    expect(home.fireTimer()).toBe(false);

    home.tab = a;
    home.render();
    expect(home.draft).toBe("abc");
    expect(home.fireTimer()).toBe(false);
    expect(a.entries).toEqual(["?q=abc"]);
    expect(b.entries).toEqual(["?scope=starred"]);
  });

  test("a pending write never lands in the tab the user switched to", () => {
    const a = new Tab();
    const b = new Tab("?scope=starred");
    const home = new Home(a);
    home.type("abc");
    home.render(); // debounce scheduled against tab A's URL

    home.tab = b; // soft navigation; its render hasn't landed when the timer fires
    expect(home.fireTimer()).toBe(false);
    home.render();
    expect(home.draft).toBe("");
    expect(home.fireTimer()).toBe(false);
    expect(b.entries).toEqual(["?scope=starred"]);
  });

  test("a pending write never lands in the entry Back went to", () => {
    const tab = new Tab();
    tab.push("?scope=starred");
    const home = new Home(tab);
    home.type("abc");
    home.render();
    tab.back();
    expect(home.fireTimer()).toBe(false);
    home.render();
    expect(home.draft).toBe("");
    expect(home.fireTimer()).toBe(false);
    expect(tab.entries).toEqual(["", "?scope=starred"]);
  });

  test("params the home doesn't own (an opened dialog) keep the draft and still let the write land", () => {
    const tab = new Tab();
    const home = new Home(tab);
    home.type("abc");
    home.render();
    tab.replace("?dialogs=share");
    home.render();
    expect(home.draft).toBe("abc");
    expect(home.fireTimer()).toBe(true);
    expect(tab.search).toBe("?dialogs=share&q=abc");
  });

  test("a scope change records the typed search on the entry being left", () => {
    const tab = new Tab();
    const home = new Home(tab);
    home.type("abc");
    home.render();
    home.setScope("trash");
    home.render();
    expect(tab.entries).toEqual(["?q=abc", "?q=abc&scope=trash"]);
    expect(home.draft).toBe("abc");
    expect(home.fireTimer()).toBe(false);
  });

  test("clear filters empties the draft and the URL together", () => {
    const tab = new Tab("?q=abc&owner=me");
    const home = new Home(tab);
    home.type("abcd");
    home.render();
    home.clearFilters();
    home.render();
    expect(tab.search).toBe("");
    expect(home.draft).toBe("");
    expect(home.fireTimer()).toBe(false);
  });
});

describe("query-sync helpers", () => {
  test("planDocsHomeWrite is null when the URL wouldn't change", () => {
    expect(planDocsHomeWrite("?q=a", { q: "a" })).toBeNull();
    expect(planDocsHomeWrite("", { q: "   " })).toBeNull();
    expect(planDocsHomeWrite("?q=a%20b", { q: "a b" })).toBeNull();
    expect(planDocsHomeWrite("?scope=starred", { scope: "starred" })).toBeNull();
  });

  test("planDocsHomeWrite returns the new search and its key", () => {
    const plan = planDocsHomeWrite("?dialogs=x", { q: "hello" });
    expect(plan).toEqual({ search: "?dialogs=x&q=hello", key: docsHomeKeyFromSearch("?q=hello") });
  });

  test("the key ignores params the home doesn't own and normalizes defaults", () => {
    expect(docsHomeKeyFromSearch("?dialogs=a&q=x")).toBe(docsHomeKeyFromSearch("?q=x"));
    expect(docsHomeKeyFromSearch("?scope=recent&owner=anyone&sort=modified")).toBe(docsHomeKeyFromSearch(""));
    expect(docsHomeKeyFromSearch("?q=x")).not.toBe(docsHomeKeyFromSearch("?q=x&scope=starred"));
  });

  test("reconcile returns the same state object when the home params didn't change", () => {
    const state = initialDocsQuerySync(paramsOf("?q=a"));
    const typed = { ...state, draft: "ab" };
    expect(reconcileDocsQuery(typed, paramsOf("?q=a&dialogs=z"))).toBe(typed);
  });

  test("planDebouncedQueryWrite skips when the draft already matches", () => {
    const rendered = paramsOf("?q=a");
    expect(
      planDebouncedQueryWrite({ draft: "a", renderedKey: docsHomeKey(rendered), renderedQuery: "a", liveSearch: "?q=a" }),
    ).toBeNull();
  });
});
