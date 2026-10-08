// The Drive lite app (drive-ui §14, §18 lite-render): each render state on /store and /personal, run as child
// processes of lite-render.isolated.tsx (it replaces modules with mock.module, which would leak into other test
// files sharing this process), plus the pure screen-stack rules of components/drive/lite/lite-state.ts.
//
// Scenarios: a staff operator on a tablet signed in as the owner (Mine, Store, Trash, other apps, the actions each
// entry offers), a staff-account tablet (Store only), the owner on her phone, the unacknowledged notice, empty,
// not published, offline, loading, an editor inside the panel, a camera shot, a lost PIN session, the file store
// being unavailable, a missing editor plugin (downloaded in place by an owner; a staff operator is told to ask), and
// New ▸ Doc from a template while Docs is not downloaded.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { isOperatorError } from "@/components/drive/lite/lite-actions";
import {
  blockedEditor, effectiveTab, folderScreen, homeScreen, liteTabs, openUrlInStack, popScreen, popScreenIfTop, popToHome, pushScreen,
  screenBelow, virtualSourceOfKey, type LiteDriveScreen,
} from "@/components/drive/lite/lite-state";
import { DriveEditorError } from "@/lib/drive/editors";
import { DriveClientError } from "@/lib/drive/errors";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SCENARIOS = [
  "store-operator", "staff-tablet", "personal", "needs-ack", "empty", "not-published", "offline", "checking", "editor",
  "camera", "operator", "storage-off", "plugin-missing", "plugin-ask", "plugin-template",
] as const;

function run(env: Record<string, string>): { exitCode: number | null; output: string } {
  const proc = Bun.spawnSync([process.execPath, "test", "./scripts/tests/drive/lite-render.isolated.tsx"], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exitCode: proc.exitCode, output: `${proc.stdout.toString()}${proc.stderr.toString()}` };
}

describe("drive lite renders each state", () => {
  for (const scenario of SCENARIOS) {
    test(scenario, () => {
      const { exitCode, output } = run({ DRIVE_LITE_SCENARIO: scenario });
      if (exitCode !== 0) console.error(output);
      expect(exitCode).toBe(0);
      expect(output).toMatch(/\b[1-9]\d* pass\b/);
      expect(output).toContain(" 0 fail");
    }, 60_000);
  }
});

const DOC = "00000000-0000-4000-8000-000000000101";
const SHEET = "00000000-0000-4000-8000-000000000102";
const DECK = "00000000-0000-4000-8000-000000000103";
const FOLDER = "00000000-0000-4000-8000-000000000104";
const ME = "00000000-0000-4000-8000-000000000105";
const OTHER = "00000000-0000-4000-8000-000000000106";

describe("lite screen stack", () => {
  const base: LiteDriveScreen[] = [homeScreen("mine"), homeScreen("mine", FOLDER)];

  test("an editor link opens that editor on top; the same one twice stays; another editor replaces it", () => {
    const sheet = openUrlInStack(base, `/manager/drive/sheet?id=${SHEET}&new=1`);
    expect(sheet.at(-1)).toStrictEqual({ kind: "editor", docKind: "sheet", id: SHEET, isNew: true });
    expect(sheet).toHaveLength(3);
    // The editor dropping `new=1` from its link keeps the screen (and its isNew) as it is.
    expect(openUrlInStack(sheet, `/manager/drive/sheet/?id=${SHEET.toUpperCase()}`)).toEqual(sheet);
    const deck = openUrlInStack(sheet, `/manager/drive/slides?id=${DECK}`);
    expect(deck).toHaveLength(3);
    expect(deck.at(-1)).toStrictEqual({ kind: "editor", docKind: "slides", id: DECK });
    expect(openUrlInStack(base, `/manager/docs/edit?id=${DOC}`).at(-1)).toStrictEqual({ kind: "editor", docKind: "doc", id: DOC });
    expect(openUrlInStack(base, `/manager/drive/slides?id=${DECK}&new=1#x`).at(-1)).toStrictEqual({ kind: "editor", docKind: "slides", id: DECK, isNew: true });
    expect(openUrlInStack(base, `/manager/drive/slides?id=${DECK}&new=0`).at(-1)).toStrictEqual({ kind: "editor", docKind: "slides", id: DECK });
  });

  test("any other /manager link returns to the last home screen; anything else stays", () => {
    const deep: LiteDriveScreen[] = [...base, { kind: "preview", key: `item:${FOLDER}` }, { kind: "editor", docKind: "doc", id: DOC }];
    expect(openUrlInStack(deep, "/manager/drive")).toEqual(base);
    expect(openUrlInStack(deep, "/manager/docs")).toEqual(base);
    expect(openUrlInStack(deep, "/manager/drive/sheet?id=not-a-uuid")).toEqual(base);
    expect(openUrlInStack(deep, "https://example.test/x")).toEqual(deep);
    expect(popToHome([{ kind: "trash" }])).toEqual([homeScreen("mine")]);
  });

  test("Back pops one screen and never the first", () => {
    expect(popScreen(base)).toEqual([homeScreen("mine")]);
    expect(popScreen([homeScreen("store")])).toEqual([homeScreen("store")]);
    expect(screenBelow(base)).toEqual(homeScreen("mine"));
    expect(screenBelow([homeScreen("mine")])).toBeNull();
  });

  test("a screen already on top is not opened again, so one Back leaves it", () => {
    const preview: LiteDriveScreen = { kind: "preview", key: `item:${FOLDER}` };
    const previewing = pushScreen(base, preview);
    expect(previewing).toEqual([...base, preview]);
    expect(pushScreen(previewing, { kind: "preview", key: `item:${FOLDER}` })).toEqual(previewing);
    expect(pushScreen(previewing, { kind: "preview", key: `item:${DOC}` })).toHaveLength(4);
    // A typed search is the same screen.
    expect(pushScreen(base, { ...homeScreen("mine", FOLDER), q: "rec" })).toEqual(base);
    expect(popScreen(pushScreen(previewing, preview))).toEqual(base);
  });

  test("a late Back leaves only the screen it was for", () => {
    const preview: LiteDriveScreen = { kind: "preview", key: `item:${FOLDER}` };
    const previewing = [...base, preview];
    expect(popScreenIfTop(previewing, preview)).toEqual(base);
    // The person went Back (or elsewhere) while the write ran: nothing more is taken away.
    expect(popScreenIfTop(base, preview)).toEqual(base);
    expect(popScreenIfTop([...base, { kind: "preview", key: `item:${DOC}` }], preview)).toHaveLength(3);
    expect(popScreenIfTop([homeScreen("mine")], homeScreen("mine"))).toEqual([homeScreen("mine")]);
  });

  test("an editor link is held back only while its own editor plugin is missing", () => {
    const only = (...kinds: string[]) => (kind: string) => kinds.includes(kind);
    expect(blockedEditor(`/manager/docs/edit?id=${DOC}`, only("sheet", "slides"))).toBe("doc");
    expect(blockedEditor(`/manager/docs/edit?id=${DOC}`, only("doc"))).toBeNull();
    expect(blockedEditor(`/manager/drive/sheet?id=${SHEET}`, only("doc", "slides"))).toBe("sheet");
    expect(blockedEditor(`/manager/drive/sheet?id=${SHEET}`, only("sheet"))).toBeNull();
    expect(blockedEditor(`/manager/drive/slides?id=${SHEET}`, only())).toBe("slides");
    // Not an editor link: nothing to hold back.
    expect(blockedEditor("/manager/drive", only())).toBeNull();
    expect(blockedEditor("/manager/drive/sheet", only())).toBeNull();
  });

  test("tabs: Mine and Store, Shared with something shared, Team with the power; a staff tablet keeps Store", () => {
    expect(liteTabs({ staffTablet: false, sharedCount: 0, canViewAll: false })).toEqual(["mine", "store"]);
    expect(liteTabs({ staffTablet: false, sharedCount: 2, canViewAll: true })).toEqual(["mine", "store", "shared", "team"]);
    const tablet = liteTabs({ staffTablet: true, sharedCount: 1, canViewAll: true });
    expect(tablet).toEqual(["store", "shared"]);
    expect(effectiveTab("mine", tablet)).toBe("store");
    expect(effectiveTab("shared", tablet)).toBe("shared");
  });

  test("a folder opens in the tab that holds it", () => {
    const at = (space: "my" | "store", ownerMemberId: string) => ({ id: FOLDER, location: { space, ownerMemberId, parentId: "" } });
    expect(folderScreen(at("store", ""), ME)).toEqual(homeScreen("store", FOLDER));
    expect(folderScreen(at("my", ME), ME)).toEqual(homeScreen("mine", FOLDER));
    expect(folderScreen(at("my", OTHER), ME)).toEqual(homeScreen("team", FOLDER, OTHER));
  });

  test("a preview key names its app source, or none", () => {
    expect(virtualSourceOfKey("v:chat:abc")).toBe("chat");
    expect(virtualSourceOfKey("v:profile:abc:2")).toBe("profile");
    expect(virtualSourceOfKey("v:nope:abc")).toBeNull();
    expect(virtualSourceOfKey(`item:${FOLDER}`)).toBeNull();
  });
});

describe("lost PIN session", () => {
  test("[drive.operator] is recognised directly, stringified, and inside an editor error", () => {
    expect(isOperatorError(new DriveClientError("operator"))).toBe(true);
    expect(isOperatorError(new Error("SenderError: [drive.operator] Enter your PIN again"))).toBe(true);
    expect(isOperatorError(new DriveEditorError("Couldn't create it.", new Error("[drive.operator] x")))).toBe(true);
    expect(isOperatorError(new Error("[drive.forbidden] nope"))).toBe(false);
    expect(isOperatorError(new DriveEditorError("Couldn't open this file.", null))).toBe(false);
  });
});
