import { describe, expect, test } from "bun:test";
import { modeOnRelease, stripOffset, swipeMayClaim } from "@/components/personal-device/chat-composer";
import { PTT_HOLD_DELAY_MS } from "@/components/device/talk-bar";
import { CHANNEL_DEFAULT_PX, CHANNEL_MIN_PX, appColumns, storedChannelWidth } from "@/components/personal-device/tablet-split";

const W = 400;

describe("stripOffset", () => {
  test("follows the finger between the two sides", () => {
    expect(stripOffset(0, -150, -W)).toBe(-150);
    expect(stripOffset(-W, 150, -W)).toBe(-250);
    expect(stripOffset(0, 150, W)).toBe(150);
  });

  test("gives a quarter of the travel past either end", () => {
    expect(stripOffset(0, 100, -W)).toBe(25);
    expect(stripOffset(-W, -100, -W)).toBe(-W - 25);
    expect(stripOffset(0, -100, W)).toBe(-25);
  });
});

describe("modeOnRelease", () => {
  test("settles on the keyboard past 40% of the way, or on a flick toward it", () => {
    expect(modeOnRelease("voice", -0.4 * W, 0, -W)).toBe("text");
    expect(modeOnRelease("voice", -0.2 * W, 0, -W)).toBe("voice");
    expect(modeOnRelease("voice", -0.1 * W, -0.5, -W)).toBe("text");
  });

  test("settles back on the walkie the same way, and mirrors in RTL", () => {
    expect(modeOnRelease("text", -0.5 * W, 0, -W)).toBe("voice");
    expect(modeOnRelease("text", -0.9 * W, 0.5, -W)).toBe("voice");
    expect(modeOnRelease("text", -0.9 * W, 0, -W)).toBe("text");
    expect(modeOnRelease("voice", 0.5 * W, 0, W)).toBe("text");
    expect(modeOnRelease("voice", 0.1 * W, 0.5, W)).toBe("text");
  });

  test("a flick back cancels however far the strip went", () => {
    expect(modeOnRelease("voice", -0.8 * W, 0.5, -W)).toBe("voice");
  });
});

describe("swipeMayClaim", () => {
  test("a drag from anywhere but the mic may move the strip", () => {
    expect(swipeMayClaim(false, 5_000)).toBe(true);
  });

  test("a drag from the mic is a swipe only if it goes sideways before the hold registers", () => {
    expect(swipeMayClaim(true, PTT_HOLD_DELAY_MS - 1)).toBe(true);
    expect(swipeMayClaim(true, PTT_HOLD_DELAY_MS)).toBe(false);
  });
});

describe("tablet split", () => {
  test("a stored channel width is used when it is a usable number", () => {
    expect(storedChannelWidth("512.4")).toBe(512);
    expect(storedChannelWidth(null)).toBe(CHANNEL_DEFAULT_PX);
    expect(storedChannelWidth("wide")).toBe(CHANNEL_DEFAULT_PX);
    expect(storedChannelWidth(String(CHANNEL_MIN_PX - 1))).toBe(CHANNEL_DEFAULT_PX);
  });

  test("a narrow apps side drops to four columns", () => {
    expect(appColumns(700)).toBe(6);
    expect(appColumns(520)).toBe(6);
    expect(appColumns(400)).toBe(4);
  });
});
