// Attention (lib/notifications/attention.ts): a notification row is read, and an
// alert is a toast, only while someone is at the document — visible, focused, and
// used within ATTENTION_IDLE_MS. A visible window behind another app, or one left
// open with nobody at it, leaves rows unread so their push and email still go out.

import { describe, expect, test } from "bun:test";
import { ATTENTION_IDLE_MS, AttentionTracker, type AttentionEnv } from "@/lib/notifications/attention";

function fakeEnv(over: Partial<{ now: number; visible: boolean; focused: boolean }> = {}) {
  const env = { now: 1_000_000, visible: true, focused: true, ...over };
  const api: AttentionEnv = { now: () => env.now, visible: () => env.visible, hasFocus: () => env.focused };
  return { env, api };
}

describe("AttentionTracker", () => {
  test("a visible, focused page that was just opened is attended", () => {
    const { api } = fakeEnv();
    expect(new AttentionTracker(api).value).toBe(true);
  });

  test("visible but unfocused (another app in front, a second monitor) is not", () => {
    const { api } = fakeEnv({ focused: false });
    const t = new AttentionTracker(api);
    expect(t.value).toBe(false);
    // Hovering over it does not focus it.
    t.input();
    t.refresh();
    expect(t.value).toBe(false);
  });

  test("hidden is not", () => {
    const { env, api } = fakeEnv();
    const t = new AttentionTracker(api);
    env.visible = false;
    expect(t.refresh()).toBe(true);
    expect(t.value).toBe(false);
  });

  test("focused but idle past the threshold is not; input brings it back", () => {
    const { env, api } = fakeEnv();
    const t = new AttentionTracker(api);
    env.now += ATTENTION_IDLE_MS - 1;
    t.refresh();
    expect(t.value).toBe(true);
    expect(t.msUntilIdle()).toBe(1);
    env.now += 1;
    expect(t.refresh()).toBe(true);
    expect(t.value).toBe(false);
    expect(t.msUntilIdle()).toBe(Number.POSITIVE_INFINITY);
    t.input();
    expect(t.refresh()).toBe(true);
    expect(t.value).toBe(true);
    expect(t.msUntilIdle()).toBe(ATTENTION_IDLE_MS);
  });

  test("a press proves focus where hasFocus lags (a web view), until the window blurs", () => {
    const { env, api } = fakeEnv({ focused: false });
    const t = new AttentionTracker(api);
    env.now += 10;
    t.input(true);
    t.refresh();
    expect(t.value).toBe(true);
    env.now += 10;
    t.blur();
    t.refresh();
    expect(t.value).toBe(false);
  });

  test("focus moving into a frame is not a blur", () => {
    const { api } = fakeEnv();
    const t = new AttentionTracker(api);
    // The top window got `blur`, but hasFocus() is still true for an ancestor of the focused frame.
    t.blur();
    t.refresh();
    expect(t.value).toBe(true);
  });
});
