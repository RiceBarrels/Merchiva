import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { scrollToCaret } from "@/components/docs/editor/presence-avatars";

// Keep-alive leaves background tabs' pages in the document, hidden by React with an inline
// `display: none !important`. A page-level global lookup must skip those copies: here, jumping
// to a collaborator's caret when a hidden tab's editor shows the same member's caret first.

class FakeEl {
  parentElement: FakeEl | null = null;
  readonly children: FakeEl[] = [];
  hidden = false;
  scrolls = 0;

  constructor(readonly memberId = "", children: FakeEl[] = []) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  get style() {
    return {
      getPropertyValue: (name: string) => (name === "display" && this.hidden ? "none" : ""),
      getPropertyPriority: (name: string) => (name === "display" && this.hidden ? "important" : ""),
    };
  }

  descendants(): FakeEl[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }

  scrollIntoView(): void {
    this.scrolls++;
  }
}

let body = new FakeEl();

const globals = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};

beforeEach(() => {
  for (const key of ["document", "CSS"]) saved[key] = globals[key];
  body = new FakeEl();
  Object.assign(globals, {
    CSS: { escape: (value: string) => value },
    document: {
      querySelectorAll(selector: string): FakeEl[] {
        const member = /data-member-id="([^"]+)"/.exec(selector)?.[1];
        return body.descendants().filter((el) => el.memberId !== "" && el.memberId === member);
      },
      /** First match in document order, like the real one: the hidden tab's caret comes first. */
      querySelector(selector: string): FakeEl | null {
        return this.querySelectorAll(selector)[0] ?? null;
      },
    },
  });
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete globals[key];
    else globals[key] = value;
  }
});

describe("page-level lookups with kept-alive tabs", () => {
  test("scrollToCaret scrolls to the on-screen caret, not a background tab's", () => {
    const hiddenCaret = new FakeEl("m1");
    const hiddenTab = new FakeEl("", [new FakeEl("", [hiddenCaret])]);
    hiddenTab.hidden = true;
    const caret = new FakeEl("m1");
    body = new FakeEl("", [hiddenTab, new FakeEl("", [caret])]);

    scrollToCaret("m1");
    expect(caret.scrolls).toBe(1);
    expect(hiddenCaret.scrolls).toBe(0);
  });

  test("scrollToCaret does nothing when the member's only caret is in a hidden tab", () => {
    const hiddenCaret = new FakeEl("m1");
    const hiddenTab = new FakeEl("", [hiddenCaret]);
    hiddenTab.hidden = true;
    body = new FakeEl("", [hiddenTab]);

    scrollToCaret("m1");
    expect(hiddenCaret.scrolls).toBe(0);
  });
});
