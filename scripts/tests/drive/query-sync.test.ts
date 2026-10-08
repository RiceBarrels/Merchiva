// lib/url-state/query-sync.ts over the Drive codec: the search box's draft, debounce and echo
// scenarios with `space` as the scope param, plus the Drive-only folder rule.
import { describe, expect, test } from "bun:test";
import { DRIVE_CODEC, type DriveUrlParams } from "@/components/drive/model/url-state";
import type { DriveSection } from "@/components/drive/model/types";
import {
  afterOwnWrite,
  initialQuerySync,
  planDebouncedQueryWrite,
  planSearchWrite,
  reconcileQuery,
  searchKey,
  type QuerySync,
  type SearchCodec,
} from "@/lib/url-state/query-sync";

const F = "0f8e2b1c-3d4a-4b5c-8d6e-7f8091a2b3c4";

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
 * The mounted Drive home, driven the way its URL-state hook drives query-sync: `render()` is a
 * render against the active tab's URL, `fireTimer()` is the debounce scheduled by the last render
 * firing now, and own writes record their echo before touching history.
 */
class Home {
  sync: QuerySync;
  rendered: string;
  constructor(public tab: Tab) {
    this.rendered = tab.search;
    this.sync = initialQuerySync(DRIVE_CODEC, DRIVE_CODEC.parse(tab.search));
  }
  get draft() {
    return this.sync.draft;
  }
  render() {
    this.rendered = this.tab.search;
    this.sync = reconcileQuery(DRIVE_CODEC, this.sync, DRIVE_CODEC.parse(this.rendered));
  }
  type(text: string) {
    this.sync = { ...this.sync, draft: text };
  }
  commit(patch: Partial<DriveUrlParams>, mode: "push" | "replace") {
    const plan = planSearchWrite(DRIVE_CODEC, this.tab.search, patch);
    if (!plan) return;
    this.sync = afterOwnWrite(DRIVE_CODEC, this.sync, this.tab.search, patch, plan);
    if (mode === "push") this.tab.push(plan.search);
    else this.tab.replace(plan.search);
  }
  fireTimer(): boolean {
    const rendered = DRIVE_CODEC.parse(this.rendered);
    const plan = planDebouncedQueryWrite(DRIVE_CODEC, {
      draft: this.draft,
      renderedKey: DRIVE_CODEC.key(rendered),
      renderedQuery: rendered.q,
      liveSearch: this.tab.search,
    });
    if (!plan) return false;
    this.sync = afterOwnWrite(DRIVE_CODEC, this.sync, this.tab.search, { q: this.draft }, plan);
    this.tab.replace(plan.search);
    return true;
  }
  setSpace(space: DriveSection) {
    this.commit({ q: this.draft }, "replace");
    this.commit({ space }, "push");
  }
  openFolder(folder: string) {
    this.commit({ q: this.draft }, "replace");
    this.commit({ folder }, "push");
  }
  clearFilters() {
    this.sync = { ...this.sync, draft: "" };
    this.commit({ q: "", type: "all" }, "replace");
  }
  /** Settles: render, let any debounce fire, render its echo. */
  settle() {
    this.render();
    if (this.fireTimer()) this.render();
  }
}

describe("Drive search draft vs URL", () => {
  test("Back then Forward shows each entry's search and never rewrites the forward entry", () => {
    const tab = new Tab();
    const home = new Home(tab);
    home.type("x");
    home.settle();
    home.setSpace("starred");
    home.settle();
    home.type("y");
    home.settle();
    expect(tab.entries).toEqual(["?q=x", "?q=y&space=starred"]);

    tab.back();
    home.render();
    expect(home.draft).toBe("x");
    expect(home.fireTimer()).toBe(false);

    tab.forward();
    home.render();
    expect(home.draft).toBe("y");
    expect(home.fireTimer()).toBe(false);
    expect(tab.entries).toEqual(["?q=x", "?q=y&space=starred"]);
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
    tab.push("?q=x&space=starred");
    home.render();
    home.type("z");
    home.render();
    expect(home.fireTimer()).toBe(true); // marker for q=z&space=starred
    tab.back(); // before that write rendered
    home.render();
    expect(home.draft).toBe("y");
    tab.forward();
    home.render();
    expect(home.draft).toBe("z");
  });

  test("switching between two Drive tabs follows each tab's own search", () => {
    const a = new Tab();
    const b = new Tab("?space=starred");
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
    expect(b.entries).toEqual(["?space=starred"]);
  });

  test("a pending write never lands in the tab the user switched to", () => {
    const a = new Tab();
    const b = new Tab("?space=starred");
    const home = new Home(a);
    home.type("abc");
    home.render(); // debounce scheduled against tab A's URL

    home.tab = b; // soft navigation; its render hasn't landed when the timer fires
    expect(home.fireTimer()).toBe(false);
    home.render();
    expect(home.draft).toBe("");
    expect(home.fireTimer()).toBe(false);
    expect(b.entries).toEqual(["?space=starred"]);
  });

  test("a pending write never lands in the entry Back went to", () => {
    const tab = new Tab();
    tab.push("?space=starred");
    const home = new Home(tab);
    home.type("abc");
    home.render();
    tab.back();
    expect(home.fireTimer()).toBe(false);
    home.render();
    expect(home.draft).toBe("");
    expect(home.fireTimer()).toBe(false);
    expect(tab.entries).toEqual(["", "?space=starred"]);
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

  test("a space change records the typed search on the entry being left", () => {
    const tab = new Tab();
    const home = new Home(tab);
    home.type("abc");
    home.render();
    home.setSpace("trash");
    home.render();
    expect(tab.entries).toEqual(["?q=abc", "?q=abc&space=trash"]);
    expect(home.draft).toBe("abc");
    expect(home.fireTimer()).toBe(false);
  });

  test("opening a folder records the search on the entry being left and starts the folder unfiltered", () => {
    const tab = new Tab();
    const home = new Home(tab);
    home.type("inv");
    home.render();
    home.openFolder(F);
    home.render();
    expect(tab.entries).toEqual(["?q=inv", `?folder=${F}`]);
    expect(home.draft).toBe("");
    expect(home.fireTimer()).toBe(false);
    tab.back();
    home.render();
    expect(home.draft).toBe("inv");
  });

  test("opening a folder before the debounce flushed the draft still starts the folder unfiltered", () => {
    const tab = new Tab();
    const home = new Home(tab);
    home.type("inv");
    home.render(); // debounce scheduled, not fired
    home.commit({ folder: F }, "push"); // no flush of the draft first
    expect(home.draft).toBe("");
    home.render();
    expect(home.fireTimer()).toBe(false);
    expect(tab.entries).toEqual(["", `?folder=${F}`]);
  });

  test("clear filters empties the draft and the URL together", () => {
    const tab = new Tab("?q=abc&type=image");
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

describe("query-sync helpers over the Drive codec", () => {
  const paramsOf = (search: string) => DRIVE_CODEC.parse(search);

  test("planSearchWrite is null when the URL wouldn't change", () => {
    expect(planSearchWrite(DRIVE_CODEC, "?q=a", { q: "a" })).toBeNull();
    expect(planSearchWrite(DRIVE_CODEC, "", { q: "   " })).toBeNull();
    expect(planSearchWrite(DRIVE_CODEC, "?q=a%20b", { q: "a b" })).toBeNull();
    expect(planSearchWrite(DRIVE_CODEC, "?space=starred", { space: "starred" })).toBeNull();
    expect(planSearchWrite(DRIVE_CODEC, "", { sort: "name" })).toBeNull();
  });

  test("planSearchWrite returns the new search and its key", () => {
    const plan = planSearchWrite(DRIVE_CODEC, "?dialogs=x", { q: "hello" });
    expect(plan).toEqual({ search: "?dialogs=x&q=hello", key: searchKey(DRIVE_CODEC, "?q=hello") });
  });

  test("the key ignores params the home doesn't own and normalizes defaults", () => {
    expect(searchKey(DRIVE_CODEC, "?dialogs=a&q=x")).toBe(searchKey(DRIVE_CODEC, "?q=x"));
    expect(searchKey(DRIVE_CODEC, "?space=my&type=all&sort=name")).toBe(searchKey(DRIVE_CODEC, ""));
    expect(searchKey(DRIVE_CODEC, "?space=recent&sort=modified")).toBe(searchKey(DRIVE_CODEC, "?space=recent"));
    expect(searchKey(DRIVE_CODEC, "?q=x")).not.toBe(searchKey(DRIVE_CODEC, "?q=x&space=starred"));
  });

  test("reconcile returns the same state object when the home params didn't change", () => {
    const state = initialQuerySync(DRIVE_CODEC, paramsOf("?q=a"));
    const typed = { ...state, draft: "ab" };
    expect(reconcileQuery(DRIVE_CODEC, typed, paramsOf("?q=a&dialogs=z"))).toBe(typed);
  });

  test("afterOwnWrite keeps a typed draft but follows a q the write changed on its own", () => {
    const state: QuerySync = { draft: "abcd", syncedKey: "synced", echoKey: null };
    const typed = planSearchWrite(DRIVE_CODEC, "", { q: "abc" });
    expect(typed).not.toBeNull();
    if (!typed) return;
    expect(afterOwnWrite(DRIVE_CODEC, state, "", { q: "abc" }, typed)).toEqual({ draft: "abcd", syncedKey: "synced", echoKey: typed.key });

    const folder = planSearchWrite(DRIVE_CODEC, "?q=abc", { folder: F });
    expect(folder?.search).toBe(`?folder=${F}`);
    if (!folder) return;
    expect(afterOwnWrite(DRIVE_CODEC, { ...state, draft: "abc" }, "?q=abc", { folder: F }, folder).draft).toBe("");

    const filter = planSearchWrite(DRIVE_CODEC, "?q=abc", { type: "pdf" });
    if (!filter) throw new Error("expected a write");
    expect(afterOwnWrite(DRIVE_CODEC, state, "?q=abc", { type: "pdf" }, filter).draft).toBe("abcd");
  });

  test("afterOwnWrite measures a side effect on the draft, not on the live URL", () => {
    const state: QuerySync = { draft: "inv", syncedKey: "synced", echoKey: null };
    // The draft never reached the URL: the folder write still clears it.
    const folder = planSearchWrite(DRIVE_CODEC, "", { folder: F });
    if (!folder) throw new Error("expected a write");
    expect(afterOwnWrite(DRIVE_CODEC, state, "", { folder: F }, folder).draft).toBe("");
    // A draft ahead of the URL survives writes that leave q alone.
    for (const patch of [{ type: "pdf" }, { space: "starred" }, { preview: `item:${F}` }] as const) {
      const plan = planSearchWrite(DRIVE_CODEC, "?q=in", patch);
      if (!plan) throw new Error("expected a write");
      expect(afterOwnWrite(DRIVE_CODEC, state, "?q=in", patch, plan).draft).toBe("inv");
    }
  });

  test("the codec's own normalizing of q is not a side effect", () => {
    const filter = planSearchWrite(DRIVE_CODEC, "", { type: "pdf" });
    if (!filter) throw new Error("expected a write");
    // A blank query never reaches the URL; a long one is cut at DRIVE_QUERY_MAX. Both stay as typed.
    for (const draft of ["   ", "x".repeat(250), "foo "]) {
      const state: QuerySync = { draft, syncedKey: "synced", echoKey: null };
      expect(afterOwnWrite(DRIVE_CODEC, state, "", { type: "pdf" }, filter).draft).toBe(draft);
    }
  });

  test("planDebouncedQueryWrite skips when the draft already matches", () => {
    const rendered = paramsOf("?q=a");
    expect(
      planDebouncedQueryWrite(DRIVE_CODEC, { draft: "a", renderedKey: DRIVE_CODEC.key(rendered), renderedQuery: "a", liveSearch: "?q=a" }),
    ).toBeNull();
  });

  test("the helpers work with any codec", () => {
    // A minimal codec: only `q` and `tag` are page-owned.
    type P = { q: string; tag: string };
    const codec: SearchCodec<P> = {
      parse: (search) => {
        const p = new URLSearchParams(search);
        return { q: p.get("q") ?? "", tag: p.get("tag") ?? "" };
      },
      merge: (search, patch) => {
        const p = new URLSearchParams(search);
        for (const [k, v] of Object.entries(patch)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        const s = p.toString();
        return s ? `?${s}` : "";
      },
      key: (params) => `${params.tag}|${params.q}`,
    };
    const state = initialQuerySync(codec, codec.parse("?tag=a&q=1"));
    expect(state).toEqual({ draft: "1", syncedKey: "a|1", echoKey: null });
    const plan = planDebouncedQueryWrite(codec, { draft: "2", renderedKey: "a|1", renderedQuery: "1", liveSearch: "?tag=a&q=1&x=y" });
    expect(plan).toEqual({ search: "?tag=a&q=2&x=y", key: "a|2" });
    const echoed = reconcileQuery(codec, { ...state, draft: "23", echoKey: "a|2" }, codec.parse(plan?.search ?? ""));
    expect(echoed).toEqual({ draft: "23", syncedKey: "a|2", echoKey: null });
    const external = reconcileQuery(codec, echoed, codec.parse("?tag=b&q=9"));
    expect(external).toEqual({ draft: "9", syncedKey: "b|9", echoKey: null });
  });
});
