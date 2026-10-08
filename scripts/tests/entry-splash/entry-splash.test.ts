// The connecting splash plays on the first entry of a session only (lib/entry-splash.ts): a sessionStorage flag,
// with a module flag for the rest of the page load when storage is blocked.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ENTRY_SPLASH_SEEN_KEY,
  __resetEntrySplashForTests,
  entrySplashSeen,
  markEntrySplashSeen,
} from "@/lib/entry-splash";

function memoryStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    clear: () => data.clear(),
  };
  return { storage: storage as unknown as Storage, data };
}

const globals = globalThis as { window?: unknown };

beforeEach(() => {
  __resetEntrySplashForTests();
});

afterEach(() => {
  delete globals.window;
  __resetEntrySplashForTests();
});

describe("entry splash flag", () => {
  test("unseen in a fresh session; marking writes the session key", () => {
    const session = memoryStorage();
    globals.window = { sessionStorage: session.storage };
    expect(entrySplashSeen()).toBe(false);
    markEntrySplashSeen();
    expect(session.data.get(ENTRY_SPLASH_SEEN_KEY)).toBe("1");
    expect(entrySplashSeen()).toBe(true);
  });

  test("survives a reload (new page load, same session storage)", () => {
    const session = memoryStorage();
    session.data.set(ENTRY_SPLASH_SEEN_KEY, "1");
    globals.window = { sessionStorage: session.storage };
    expect(entrySplashSeen()).toBe(true);
  });

  test("a cleared session (sign-out, new tab) plays it again", () => {
    const session = memoryStorage();
    globals.window = { sessionStorage: session.storage };
    markEntrySplashSeen();
    session.data.clear();
    __resetEntrySplashForTests(); // the sign-out navigation is a new page load
    expect(entrySplashSeen()).toBe(false);
  });

  test("storage that throws on access falls back to the module flag", () => {
    const win = {};
    Object.defineProperty(win, "sessionStorage", {
      get() {
        throw new Error("SecurityError");
      },
    });
    globals.window = win;
    expect(entrySplashSeen()).toBe(false);
    expect(() => markEntrySplashSeen()).not.toThrow();
    expect(entrySplashSeen()).toBe(true);
  });

  test("getItem / setItem that throw fall back to the module flag", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    globals.window = { sessionStorage: broken as unknown as Storage };
    expect(entrySplashSeen()).toBe(false);
    expect(() => markEntrySplashSeen()).not.toThrow();
    expect(entrySplashSeen()).toBe(true);
  });

  test("a refused write still counts for this page load", () => {
    const session = memoryStorage();
    const refusing = { ...session.storage, getItem: session.storage.getItem, setItem: () => { throw new Error("QuotaExceededError"); } };
    globals.window = { sessionStorage: refusing as unknown as Storage };
    markEntrySplashSeen();
    expect(session.data.has(ENTRY_SPLASH_SEEN_KEY)).toBe(false);
    expect(entrySplashSeen()).toBe(true);
  });

  test("without a window it reads unseen and marking is safe", () => {
    delete globals.window;
    expect(entrySplashSeen()).toBe(false);
    expect(() => markEntrySplashSeen()).not.toThrow();
    expect(entrySplashSeen()).toBe(true);
  });

  test("the key is outside the browser shell's purged prefixes", () => {
    expect(ENTRY_SPLASH_SEEN_KEY).toBe("merchiva_entry_splash_seen");
    expect(ENTRY_SPLASH_SEEN_KEY.startsWith("merchiva_shell_")).toBe(false);
  });

  test("sign-out clears sessionStorage, so the next sign-in counts as a first entry", () => {
    const auth = readFileSync(join(import.meta.dir, "../../../lib/auth/context.tsx"), "utf8");
    const start = auth.indexOf("const signOut = useCallback");
    expect(start).toBeGreaterThan(-1);
    const signOut = auth.slice(start, auth.indexOf("}, []);", start));
    expect(signOut).toContain("sessionStorage.clear()");
  });
});
