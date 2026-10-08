// The manager layout plays the connecting splash on the first entry of a session only, and later entries get a
// quiet loader. Errors and the sign-out escape must stay reachable on both paths: a skipped splash must never leave
// a stuck connection with no way out.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const layout = readFileSync(join(import.meta.dir, "../../../app/manager/layout.tsx"), "utf8");

function block(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("entry splash wiring", () => {
  test("the layout reads and marks the session flag", () => {
    expect(layout).toMatch(/import \{ entrySplashSeen, markEntrySplashSeen \} from "@\/lib\/entry-splash";/);
    expect(layout).toMatch(/useState\(\(\) => !entrySplashSeen\(\) && !isReady && !effectiveAuth\)/);
  });

  test("every first mount marks the entry, splash or warm cache, never when the splash finishes", () => {
    expect(layout).toMatch(/useEffect\(\(\) => \{\s*markEntrySplashSeen\(\);\s*\}, \[\]\);/);
    expect(layout).not.toMatch(/if \(splashStarted\) markEntrySplashSeen\(\)/);
    expect(layout).toContain("onFinish={() => setSplashFinished(true)}");
    expect(layout.match(/markEntrySplashSeen\(\)/g)?.length).toBe(1);
  });

  test("the error list and sign-out button render in the quiet loader and over the splash", () => {
    const quiet = block(layout, "{!showSplash && realContent === null && (", "{showSplash && (");
    expect(quiet).toContain("<Spinner");
    expect(quiet).toContain("{showLoadErrors && (");
    expect(quiet).toContain("<EntryLoadErrors errors={splashErrors} onSignOut={handleSignOut} />");

    const splash = block(layout, "{showSplash && (", "</>");
    expect(splash).toContain("<SplashLoader");
    expect(splash).toContain("{showLoadErrors && (");
    expect(splash).toContain("<EntryLoadErrors errors={splashErrors} onSignOut={handleSignOut} />");

    expect(layout).toContain("const showLoadErrors = splashErrors.length > 0 && !dataReady;");
  });

  test("the shared error block offers sign-out and uses semantic tokens", () => {
    const shared = block(layout, "function EntryLoadErrors(", "\n}\n");
    expect(shared).toContain('t("layout.signOutAndRetry")');
    expect(shared).toContain("onClick={onSignOut}");
    expect(shared).toContain("errors.map(");
    expect(shared).not.toMatch(/\b(stone|red)-\d/);
  });
});
