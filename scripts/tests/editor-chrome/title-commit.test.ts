import { describe, expect, test } from "bun:test";

import { cleanTitle, createTitleCommitter, TITLE_MAX } from "@/components/files/editor-chrome/title-commit";

interface Call {
  title: string;
  resolve(): void;
  reject(err: Error): void;
}

/** A fake `onCommit` whose calls settle only when the test says so. */
function fakeSend() {
  const calls: Call[] = [];
  const send = (title: string) =>
    new Promise<void>((resolve, reject) => {
      calls.push({ title, resolve, reject });
    });
  return { calls, send, titles: () => calls.map((call) => call.title) };
}

/** Lets the committer's `.catch` handlers run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("cleanTitle", () => {
  test("collapses whitespace, trims and caps the length", () => {
    expect(cleanTitle("  Q3   budget \n draft ")).toBe("Q3 budget draft");
    expect(cleanTitle("x".repeat(TITLE_MAX + 50))).toHaveLength(TITLE_MAX);
  });
});

describe("createTitleCommitter", () => {
  test("a debounce commit followed by a blur with the same draft sends once", () => {
    const committer = createTitleCommitter();
    const { send, titles } = fakeSend();
    committer.titleChanged("Budget");
    committer.commit("Budget 2026", "Budget", send); // debounce
    committer.commit("Budget 2026", "Budget", send); // blur, before the new title arrives
    committer.endSession();
    expect(titles()).toEqual(["Budget 2026"]);
  });

  test("sends the cleaned value", () => {
    const committer = createTitleCommitter();
    const { send, titles } = fakeSend();
    committer.commit("  Budget   2026 ", "Budget", send);
    expect(titles()).toEqual(["Budget 2026"]);
  });

  test("an unchanged or whitespace-only edit sends nothing", () => {
    const committer = createTitleCommitter();
    const { send, titles } = fakeSend();
    committer.commit("Budget", "Budget", send);
    committer.commit("  Budget ", "Budget", send);
    committer.commit("Budget   2026", "Budget 2026", send);
    committer.commit("   ", "", send);
    expect(titles()).toEqual([]);
  });

  test("a rejected rename can be retried with the same value", async () => {
    const committer = createTitleCommitter();
    const { calls, send, titles } = fakeSend();
    committer.commit("Budget 2026", "Budget", send);
    calls[0].reject(new Error("offline"));
    await settle();
    committer.commit("Budget 2026", "Budget", send);
    expect(titles()).toEqual(["Budget 2026", "Budget 2026"]);
  });

  test("a stale rejection does not forget a newer send", async () => {
    const committer = createTitleCommitter();
    const { calls, send, titles } = fakeSend();
    committer.commit("Budget 2026", "Budget", send);
    committer.endSession();
    committer.commit("Budget 2026", "Budget", send); // next session, first call still in flight
    calls[0].reject(new Error("offline"));
    await settle();
    committer.commit("Budget 2026", "Budget", send); // blur of the second session
    expect(titles()).toEqual(["Budget 2026", "Budget 2026"]);
  });

  test("renaming back after the title went A -> B -> A sends again", () => {
    const committer = createTitleCommitter();
    const { calls, send, titles } = fakeSend();
    committer.titleChanged("Budget");
    committer.commit("Budget 2026", "Budget", send);
    calls[0].resolve();
    committer.endSession();
    committer.titleChanged("Budget 2026"); // our rename landed
    committer.titleChanged("Budget"); // a collaborator renamed it back
    committer.commit("Budget 2026", "Budget", send);
    expect(titles()).toEqual(["Budget 2026", "Budget 2026"]);
  });

  test("a title change forgets the entry even inside one session", () => {
    const committer = createTitleCommitter();
    const { send, titles } = fakeSend();
    committer.titleChanged("Budget");
    committer.commit("Budget 2026", "Budget", send);
    committer.titleChanged("Budget 2026");
    committer.titleChanged("Budget");
    committer.commit("Budget 2026", "Budget", send);
    expect(titles()).toEqual(["Budget 2026", "Budget 2026"]);
  });

  test("reporting the same live title again keeps the entry", () => {
    const committer = createTitleCommitter();
    const { send, titles } = fakeSend();
    committer.titleChanged("Budget");
    committer.commit("Budget 2026", "Budget", send);
    committer.titleChanged("Budget");
    committer.commit("Budget 2026", "Budget", send);
    expect(titles()).toEqual(["Budget 2026"]);
  });

  test("a rename that resolved without landing is retried in the next session", async () => {
    const committer = createTitleCommitter();
    const { calls, send, titles } = fakeSend();
    committer.titleChanged("Budget");
    committer.commit("Budget 2026", "Budget", send);
    calls[0].resolve(); // e.g. the caller returned early; the title never changes
    await settle();
    committer.commit("Budget 2026", "Budget", send); // same session: still deduped
    committer.endSession();
    committer.commit("Budget 2026", "Budget", send); // next session
    expect(titles()).toEqual(["Budget 2026", "Budget 2026"]);
  });

  test("an entry sent against another live title does not block", () => {
    const committer = createTitleCommitter();
    const { send, titles } = fakeSend();
    committer.commit("Budget 2026", "Budget", send);
    committer.commit("Budget 2026", "Budget draft", send); // title changed, effect not yet run
    expect(titles()).toEqual(["Budget 2026", "Budget 2026"]);
  });

  test("typing back to an earlier draft while renames are in flight sends it again", () => {
    const committer = createTitleCommitter();
    const { send, titles } = fakeSend();
    committer.commit("B", "A", send);
    committer.commit("C", "A", send);
    committer.commit("B", "A", send);
    expect(titles()).toEqual(["B", "C", "B"]);
  });
});
