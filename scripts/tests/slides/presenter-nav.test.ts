// Presenter (slides.md §9): the show runs over shown slides only, starts on the nearest shown slide when asked to
// start on a skipped one, ends with an end screen, and follows the key / tap / swipe rules. Also the stopwatch and
// the full-screen session (StrictMode re-runs, a hidden tab, leaving full screen on purpose or not).
import { describe, expect, test } from "bun:test";

import { presenterKeyAction, swipeAction, tapAction } from "@/lib/slides/present/input";
import { jumpTo, navSlideId, presenterOrder, reconcileNav, startIndex, step, type PresenterNav } from "@/lib/slides/present/nav";
import { PresentationSession } from "@/lib/slides/present/presentation";
import {
  formatElapsed, initShow, pauseTimer, resetTimer, resumeTimer, showReducer, showSlideId, startTimer, timerElapsed,
  type ShowAction, type ShowState,
} from "@/lib/slides/present/show";

function deck(spec: Array<[string, boolean]>) {
  return {
    slideIds: spec.map(([id]) => id),
    slides: new Map(spec.map(([id, hidden]) => [id, { hidden }])) as unknown as Parameters<typeof presenterOrder>[0]["slides"],
  };
}

const run = (s: ShowState, ...actions: ShowAction[]) => actions.reduce(showReducer, s);

describe("presenterOrder / startIndex", () => {
  const d = deck([["a", false], ["b", true], ["c", false], ["d", true]]);
  const all = d.slideIds;
  const order = presenterOrder(d);

  test("hidden slides are skipped", () => {
    expect(order).toEqual(["a", "c"]);
  });

  test("a shown slide starts on itself; unknown or null starts on the first", () => {
    expect(startIndex(order, "c", all)).toBe(1);
    expect(startIndex(order, "zz", all)).toBe(0);
    expect(startIndex(order, null, all)).toBe(0);
  });

  test("a hidden slide starts on the next shown slide, the last hidden one on the one before it", () => {
    expect(startIndex(order, "b", all)).toBe(1);
    expect(startIndex(order, "d", all)).toBe(1);
  });

  test("an empty show starts at 0", () => {
    expect(startIndex([], "a", all)).toBe(0);
  });
});

describe("step / jumpTo / reconcileNav", () => {
  const nav: PresenterNav = { order: ["a", "c", "e"], index: 0 };

  test("step moves and reports the end; back from the first stays", () => {
    const next = step(nav, 1);
    expect(next).toEqual({ order: nav.order, index: 1 });
    expect(step({ ...nav, index: 2 }, 1)).toBe("end");
    expect(step(nav, -1)).toBe(nav);
    expect(step({ order: [], index: 0 }, 1)).toBe("end");
  });

  test("jumpTo is 1-based and clamped", () => {
    expect(jumpTo(nav, 3).index).toBe(2);
    expect(jumpTo(nav, 99).index).toBe(2);
    expect(jumpTo(nav, 0).index).toBe(0);
    expect(jumpTo(nav, 1)).toBe(nav);
  });

  test("reconcile keeps the current slide, moves off a newly hidden or deleted one", () => {
    const on = { order: nav.order, index: 1 };
    expect(reconcileNav(on, ["x", "a", "c", "e"], ["x", "a", "c", "e"])).toEqual({ order: ["x", "a", "c", "e"], index: 2 });
    // c got skipped: the next shown slide after it.
    expect(navSlideId(reconcileNav(on, ["a", "e"], ["a", "c", "e"]))).toBe("e");
    // c got deleted: whatever is now at its position.
    expect(navSlideId(reconcileNav(on, ["a", "e"], ["a", "e"]))).toBe("e");
    expect(reconcileNav(on, ["a", "c", "e"], ["a", "c", "e"])).toBe(on);
  });
});

describe("showReducer", () => {
  const start = () => initShow(["a", "c", "e"], "a", ["a", "b", "c", "d", "e"]);

  test("next through the end screen, then the show is done", () => {
    let s = run(start(), { type: "next" }, { type: "next" });
    expect(showSlideId(s)).toBe("e");
    s = run(s, { type: "next" });
    expect(s.ended).toBe(true);
    expect(showSlideId(s)).toBeNull();
    s = run(s, { type: "prev" });
    expect(showSlideId(s)).toBe("e");
    s = run(s, { type: "next" }, { type: "next" });
    expect(s.done).toBe(true);
    expect(run(s, { type: "prev" })).toBe(s);
  });

  test("starting on a hidden slide begins on the next shown one", () => {
    expect(showSlideId(initShow(["a", "c", "e"], "d", ["a", "b", "c", "d", "e"]))).toBe("e");
  });

  test("digits and Enter jump; Backspace edits the digits first", () => {
    let s = run(start(), { type: "digit", digit: "3" });
    expect(s.digits).toBe("3");
    s = run(s, { type: "enter" });
    expect(showSlideId(s)).toBe("e");
    expect(s.digits).toBe("");
    s = run(s, { type: "digit", digit: "2" }, { type: "digit", digit: "9" }, { type: "backspace" }, { type: "enter" });
    expect(showSlideId(s)).toBe("c");
    s = run(s, { type: "backspace" });
    expect(showSlideId(s)).toBe("a");
    expect(run(start(), { type: "digit", digit: "0" }, { type: "enter" }).digits).toBe("");
  });

  test("Enter without digits is next; Home and End", () => {
    expect(showSlideId(run(start(), { type: "enter" }))).toBe("c");
    expect(showSlideId(run(start(), { type: "last" }))).toBe("e");
    expect(showSlideId(run(start(), { type: "last" }, { type: "first" }))).toBe("a");
  });

  test("a blank screen swallows the next move, then the show goes on", () => {
    let s = run(start(), { type: "blank", screen: "black" });
    expect(s.blank).toBe("black");
    s = run(s, { type: "blank", screen: "white" });
    expect(s.blank).toBe("white");
    s = run(s, { type: "next" });
    expect(s.blank).toBeNull();
    expect(showSlideId(s)).toBe("a");
    expect(showSlideId(run(s, { type: "next" }))).toBe("c");
    expect(run(start(), { type: "blank", screen: "black" }, { type: "blank", screen: "black" }).blank).toBeNull();
  });

  test("an empty show ends on the first next; exit is done", () => {
    expect(run(initShow([], null), { type: "next" }).done).toBe(true);
    expect(run(start(), { type: "exit" }).done).toBe(true);
  });

  test("deck changes keep the current slide", () => {
    const s = run(start(), { type: "next" });
    const moved = run(s, { type: "deck", order: ["n", "a", "c", "e"], all: ["n", "a", "c", "e"] });
    expect(showSlideId(moved)).toBe("c");
    expect(run(s, { type: "deck", order: ["a", "c", "e"], all: ["a", "b", "c", "d", "e"] })).toBe(s);
  });
});

describe("keys", () => {
  test("navigation, blanking, exit and toggles", () => {
    expect(presenterKeyAction({ key: "ArrowRight" })).toEqual({ type: "next" });
    expect(presenterKeyAction({ key: " " })).toEqual({ type: "next" });
    expect(presenterKeyAction({ key: "PageUp" })).toEqual({ type: "prev" });
    expect(presenterKeyAction({ key: "Backspace" })).toEqual({ type: "backspace" });
    expect(presenterKeyAction({ key: "End" })).toEqual({ type: "last" });
    expect(presenterKeyAction({ key: "B" })).toEqual({ type: "blank", screen: "black" });
    expect(presenterKeyAction({ key: "w" })).toEqual({ type: "blank", screen: "white" });
    expect(presenterKeyAction({ key: "Escape" })).toEqual({ type: "exit" });
    expect(presenterKeyAction({ key: "f" })).toEqual({ type: "fullscreen" });
    expect(presenterKeyAction({ key: "S" })).toEqual({ type: "speaker" });
    expect(presenterKeyAction({ key: "7" })).toEqual({ type: "digit", digit: "7" });
  });

  test("chords, compositions and unknown keys are left alone", () => {
    expect(presenterKeyAction({ key: "ArrowRight", metaKey: true })).toBeNull();
    expect(presenterKeyAction({ key: "r", ctrlKey: true })).toBeNull();
    expect(presenterKeyAction({ key: "n", altKey: true })).toBeNull();
    expect(presenterKeyAction({ key: "n", isComposing: true })).toBeNull();
    expect(presenterKeyAction({ key: "x" })).toBeNull();
    expect(presenterKeyAction({ key: "toString" })).toBeNull();
  });
});

describe("pointer", () => {
  test("mouse click is next; taps split at the left third", () => {
    expect(tapAction({ pointerType: "mouse", dx: 0, dy: 0, x: 10, width: 900 })).toBe("next");
    expect(tapAction({ pointerType: "mouse", dx: 0, dy: 0, x: 10, width: 900, button: 2 })).toBeNull();
    expect(tapAction({ pointerType: "touch", dx: 2, dy: 1, x: 100, width: 900 })).toBe("prev");
    expect(tapAction({ pointerType: "touch", dx: 0, dy: 0, x: 400, width: 900 })).toBe("next");
    expect(tapAction({ pointerType: "touch", dx: 40, dy: 0, x: 400, width: 900 })).toBeNull();
  });

  test("horizontal swipes over 48 px move; vertical or short ones do not", () => {
    expect(swipeAction({ pointerType: "touch", dx: -60, dy: 10 })).toBe("next");
    expect(swipeAction({ pointerType: "pen", dx: 80, dy: -5 })).toBe("prev");
    expect(swipeAction({ pointerType: "touch", dx: -40, dy: 0 })).toBeNull();
    expect(swipeAction({ pointerType: "touch", dx: -60, dy: 90 })).toBeNull();
    expect(swipeAction({ pointerType: "mouse", dx: -200, dy: 0 })).toBeNull();
  });
});

describe("timer", () => {
  test("pause, resume and reset", () => {
    let timer = startTimer(1_000);
    expect(timerElapsed(timer, 61_000)).toBe(60_000);
    timer = pauseTimer(timer, 61_000);
    expect(timerElapsed(timer, 500_000)).toBe(60_000);
    timer = resumeTimer(timer, 100_000);
    expect(timerElapsed(timer, 110_000)).toBe(70_000);
    const paused = resetTimer(pauseTimer(timer, 110_000), 120_000);
    expect(timerElapsed(paused, 200_000)).toBe(0);
    expect(paused.pausedAt).not.toBeNull();
    expect(timerElapsed(resetTimer(timer, 120_000), 125_000)).toBe(5_000);
  });

  test("formatElapsed", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(65_400)).toBe("1:05");
    expect(formatElapsed(3_723_000)).toBe("1:02:03");
    expect(formatElapsed(-5)).toBe("0:00");
  });
});

describe("PresentationSession", () => {
  // A fake overlay element in a document that grants element full screen.
  function fakeElement() {
    const doc = { fullscreenEnabled: true, fullscreenElement: null as unknown, exitFullscreen: async () => { doc.fullscreenElement = null; } };
    const el = { ownerDocument: doc, requestFullscreen: async () => { doc.fullscreenElement = el; } };
    return { el: el as unknown as HTMLElement, doc: doc as unknown as Document };
  }
  const nextTask = () => new Promise((resolve) => setTimeout(resolve, 5));

  test("enters full screen; StrictMode's cleanup + re-run does not stop it", async () => {
    const modes: string[] = [];
    const { el } = fakeElement();
    const session = new PresentationSession((mode) => modes.push(mode));
    session.start(el, true);
    let stopped = false;
    session.stopSoon(() => { stopped = true; });
    session.start(el, true);
    await nextTask();
    expect(stopped).toBe(false);
    expect(session.running).toBe(true);
    expect(modes).toEqual(["element"]);
  });

  test("a cleanup with no re-run stops it after a task (a hidden tab)", async () => {
    const { el } = fakeElement();
    const session = new PresentationSession(() => undefined);
    session.start(el, true);
    let stopped = false;
    session.stopSoon(() => { stopped = true; });
    expect(stopped).toBe(false);
    await nextTask();
    expect(stopped).toBe(true);
    expect(session.running).toBe(false);
  });

  test("without full screen (the speaker window took the activation) it stays an overlay", async () => {
    const modes: string[] = [];
    const { el, doc } = fakeElement();
    const session = new PresentationSession((mode) => modes.push(mode));
    session.start(el, false);
    await nextTask();
    expect(modes).toEqual(["overlay"]);
    expect((doc as unknown as { fullscreenElement: unknown }).fullscreenElement).toBeNull();
  });

  test("ruled out (/store): no element full screen at start, on F or from the control bar", async () => {
    const modes: string[] = [];
    const { el, doc } = fakeElement();
    const session = new PresentationSession((mode) => modes.push(mode), { elementFullscreen: false });
    expect(session.canFullscreen(el)).toBe(false);
    expect(new PresentationSession(() => undefined).canFullscreen(el)).toBe(true);
    session.start(el, true);
    await nextTask();
    expect(modes).toEqual(["overlay"]);
    expect(await session.toggleFullscreen(el)).toBe("overlay");
    expect((doc as unknown as { fullscreenElement: unknown }).fullscreenElement).toBeNull();
    expect(session.running).toBe(true);
  });

  test("leaving full screen on purpose keeps the show; the browser leaving it ends the show", async () => {
    const { el, doc } = fakeElement();
    const session = new PresentationSession(() => undefined);
    session.start(el, true);
    await nextTask();
    // F: out of full screen, on purpose.
    const leaving = session.toggleFullscreen(el);
    expect(session.fullscreenChanged(doc)).toBe(false);
    expect(await leaving).toBe("overlay");
    // F again, then the browser leaves full screen by itself (Esc).
    expect(await session.toggleFullscreen(el)).toBe("element");
    (doc as unknown as { fullscreenElement: unknown }).fullscreenElement = null;
    expect(session.fullscreenChanged(doc)).toBe(true);
  });
});
