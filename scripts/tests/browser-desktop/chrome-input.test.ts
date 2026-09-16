import { describe, expect, test } from "bun:test";
import { isImeComposing } from "@/components/browser-shell/desktop/ime";
import {
  createLongPressClickGuard,
  type LongPressClickGuardEnv,
} from "@/components/browser-shell/desktop/long-press-click-guard";
import { pressActivatesTab } from "@/components/browser-shell/desktop/use-tab-drag";

/** A window stand-in: a real EventTarget plus a manual task queue for setTimeout(0). */
function fakeEnv() {
  const target = new EventTarget();
  let next = 1;
  const tasks = new Map<number, () => void>();
  const env: LongPressClickGuardEnv = {
    target,
    schedule(callback) {
      const handle = next++;
      tasks.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      tasks.delete(handle);
    },
  };
  return {
    env,
    release(type: "pointerup" | "pointercancel" = "pointerup") {
      target.dispatchEvent(new Event(type));
    },
    runTasks() {
      const pending = Array.from(tasks.values());
      tasks.clear();
      for (const task of pending) task();
    },
    pendingTasks: () => tasks.size,
  };
}

describe("createLongPressClickGuard (Back / Forward long press)", () => {
  test("an ordinary click is never swallowed", () => {
    const { env } = fakeEnv();
    const guard = createLongPressClickGuard(env);
    guard.reset();
    expect(guard.consumeClick()).toBe(false);
  });

  test("the click that ends the long press on the button is swallowed once", () => {
    const { env, release, runTasks } = fakeEnv();
    const guard = createLongPressClickGuard(env);
    guard.reset();
    guard.arm();
    release(); // pointerup ...
    expect(guard.consumeClick()).toBe(true); // ... and its click, in the same task
    runTasks();
    guard.reset();
    expect(guard.consumeClick()).toBe(false);
  });

  test("release over the modal menu backdrop (no click on the button) does not eat the next click", () => {
    const { env, release, runTasks } = fakeEnv();
    const guard = createLongPressClickGuard(env);
    guard.reset();
    guard.arm();
    release(); // lands on the backdrop: no click reaches the button
    runTasks();
    // Later the user picks an entry or dismisses the menu, then clicks Back again. Even without a
    // pointerdown (keyboard activation) the click must go through.
    expect(guard.consumeClick()).toBe(false);
  });

  test("pointercancel disarms too", () => {
    const { env, release, runTasks } = fakeEnv();
    const guard = createLongPressClickGuard(env);
    guard.arm();
    release("pointercancel");
    runTasks();
    expect(guard.consumeClick()).toBe(false);
  });

  test("a new press resets an armed guard whose release never arrived", () => {
    const { env } = fakeEnv();
    const guard = createLongPressClickGuard(env);
    guard.arm();
    guard.reset();
    expect(guard.consumeClick()).toBe(false);
  });

  test("release listeners are one-shot and dispose drops pending work", () => {
    const { env, release, runTasks, pendingTasks } = fakeEnv();
    const guard = createLongPressClickGuard(env);
    guard.arm();
    release();
    expect(pendingTasks()).toBe(1);
    release(); // listener already removed
    expect(pendingTasks()).toBe(1);
    guard.dispose();
    expect(pendingTasks()).toBe(0);
    runTasks();
    expect(guard.consumeClick()).toBe(false);
  });
});

describe("isImeComposing", () => {
  test("composition keydowns are ignored (Chrome / Firefox: isComposing)", () => {
    expect(isImeComposing({ isComposing: true, keyCode: 229 })).toBe(true);
  });

  test("WebKit's committing Enter after compositionend (isComposing false, keyCode 229) is ignored", () => {
    expect(isImeComposing({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  test("a plain Enter runs", () => {
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false);
  });
});

describe("pressActivatesTab", () => {
  test("mouse and pen activate on pointerdown", () => {
    expect(pressActivatesTab("mouse")).toBe(true);
    expect(pressActivatesTab("pen")).toBe(true);
  });

  test("touch (and unknown pointers) wait for the tap's click, so swiping the strip never switches tabs", () => {
    expect(pressActivatesTab("touch")).toBe(false);
    expect(pressActivatesTab("")).toBe(false);
  });
});
