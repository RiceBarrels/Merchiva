// lib/sheets/univer/create-sheet-univer.ts guardClaimedKeys (S0 item 8, W1.2d#1): Univer's ShortcutService is a
// window keydown listener in the capture phase that ignores defaultPrevented, so a key the app shell already claimed
// (⌘9 = selectLastTab, Tauri ⌘R / ⌘⇧R) would also run Univer's own command. In this process: the guard over a plain
// EventTarget. The child `bun test` of THIS file (SHEETS_KEY_GUARD_SCENARIO=instance) runs createSheetUniver itself
// with a stand-in window and Univer (mock.module would leak into other files sharing this process): the guard goes
// in before Univer's listener and comes out with the instance, including when creation throws.

import { describe, expect, mock, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SELF = "./scripts/tests/sheets/key-guard.test.ts";
const SCENARIO = process.env.SHEETS_KEY_GUARD_SCENARIO ?? "";

type Listener = (event: Event) => void;

/** A keydown; `claimed` makes the stand-in shell handle it (preventDefault), as its ⌘9 binding does. */
function keydown(claimed: boolean): Event {
  return Object.assign(new Event("keydown", { cancelable: true }), { claimed });
}

/** The shell's capture listener, installed at boot (lib/browser-shell/shortcuts.ts installShortcuts). */
const shell: Listener = (event) => {
  if ((event as Event & { claimed?: boolean }).claimed) event.preventDefault();
};

if (SCENARIO === "") {
  // The editor's preset entries touch Path2D at module load (helpers/headless.ts stubs it the same way).
  (globalThis as { Path2D?: unknown }).Path2D ??= class Path2D {
    addPath(): void {}
  };
  const { guardClaimedKeys } = await import("@/lib/sheets/univer/create-sheet-univer");

  describe("guardClaimedKeys", () => {
    test("a key the shell claimed stops before the listeners after the guard; other keys pass; removal restores", () => {
      const target = new EventTarget();
      const seen: string[] = [];
      target.addEventListener("keydown", shell, true);
      const release = guardClaimedKeys(target);
      target.addEventListener("keydown", () => void seen.push("univer"), true); // Univer's ShortcutService
      target.addEventListener("keydown", () => void seen.push("bubble")); // anything later on the window

      const claimed = keydown(true);
      target.dispatchEvent(claimed);
      expect([claimed.defaultPrevented, seen]).toEqual([true, []]);
      target.dispatchEvent(keydown(false));
      expect(seen).toEqual(["univer", "bubble"]);

      release();
      seen.length = 0;
      target.dispatchEvent(keydown(true));
      expect(seen).toEqual(["univer", "bubble"]);
    });

    test("it never claims a key itself, and cannot reach listeners that ran before it", () => {
      const target = new EventTarget();
      const seen: string[] = [];
      target.addEventListener("keydown", () => void seen.push("early"), true);
      guardClaimedKeys(target);
      target.addEventListener("keydown", shell, true); // a claim made after the guard is not its business
      target.addEventListener("keydown", () => void seen.push("late"), true);
      const event = keydown(false);
      target.dispatchEvent(event);
      expect([event.defaultPrevented, seen]).toEqual([false, ["early", "late"]]);
      target.dispatchEvent(keydown(true));
      expect(seen).toEqual(["early", "late", "early", "late"]);
    });
  });

  describe("isolated children", () => {
    test("instance", () => {
      const proc = Bun.spawnSync([process.execPath, "test", SELF], {
        cwd: ROOT, env: { ...process.env, SHEETS_KEY_GUARD_SCENARIO: "instance" }, stdout: "pipe", stderr: "pipe",
      });
      const output = `${proc.stdout.toString()}${proc.stderr.toString()}`;
      if (proc.exitCode !== 0) console.error(output);
      expect(proc.exitCode).toBe(0);
      expect(output).toMatch(/[1-9]\d* pass/);
      expect(output).toContain(" 0 fail");
    }, 60_000);
  });
}

// ── Child: createSheetUniver with a stand-in window and Univer ────────────────
if (SCENARIO === "instance") {
  const win = new EventTarget();
  const log: string[] = [];
  const univerKeys: Listener = () => void log.push("univer key");
  const state = { failCreate: false };
  const addListener = win.addEventListener.bind(win);
  const removeListener = win.removeEventListener.bind(win);
  win.addEventListener = (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
    log.push(`add ${listener === univerKeys ? "univer" : listener === shell ? "shell" : "guard"} ${options === true ? "capture" : "bubble"}`);
    addListener(type, listener, options);
  };
  win.removeEventListener = (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) => {
    log.push(`remove ${listener === univerKeys ? "univer" : "guard"}`);
    removeListener(type, listener, options);
  };
  const scope = globalThis as { window?: unknown; document?: unknown };
  scope.window = win;
  scope.document = {
    createElement: () => ({ className: "", style: {}, remove: () => void log.push("container removed") }),
  };

  mock.module("@univerjs/presets", () => ({
    ICommandService: Symbol("ICommandService"),
    LogLevel: { WARN: 2 },
    createUniver: () => {
      log.push("createUniver");
      if (state.failCreate) throw new Error("no canvas");
      win.addEventListener("keydown", univerKeys, true); // what ShortcutService does while Univer is created
      return {
        univer: {
          dispose: () => {
            log.push("univer disposed");
            win.removeEventListener("keydown", univerKeys, true);
          },
          __getInjector: () => ({ get: () => ({}) }),
        },
        univerAPI: {},
      };
    },
  }));
  mock.module("@univerjs/preset-sheets-core", () => ({ FUNCTION_LIST: [] }));
  mock.module("@/lib/sheets/univer/presets", () => ({ buildSheetPresets: () => [] }));
  mock.module("@/lib/sheets/univer/theme", () => ({ buildUniverTheme: () => ({}) }));

  const { createSheetUniver } = await import("@/lib/sheets/univer/create-sheet-univer");
  const options = (worker: { terminate(): void } | null) => ({
    host: { appendChild: () => {} } as unknown as HTMLElement,
    layout: "desktop" as const,
    locale: { type: "enUS" as never, pack: {}, direction: "ltr" as const },
    dark: false,
    worker: worker as unknown as Worker | null,
    brand: "Sheets",
    onOpenUrl: () => {},
  });
  const microtask = () => new Promise<void>((resolve) => queueMicrotask(resolve));

  test("the guard goes in before Univer's listener and out with the instance", async () => {
    win.addEventListener("keydown", shell, true);
    log.length = 0;
    const sheet = createSheetUniver(options(null));
    expect(log).toEqual(["add guard capture", "createUniver", "add univer capture"]);

    log.length = 0;
    win.dispatchEvent(keydown(true)); // ⌘9 with whole rows selected: the tab switches, the rows stay
    win.dispatchEvent(keydown(false));
    expect(log).toEqual(["univer key"]);

    log.length = 0;
    sheet.dispose();
    sheet.dispose();
    expect(log).toEqual([]); // Univer's own dispose waits for a microtask
    await microtask();
    expect(log).toEqual(["univer disposed", "remove univer", "remove guard", "container removed"]);
  });

  test("a creation that throws takes the guard back out, with the container and the worker", () => {
    state.failCreate = true;
    log.length = 0;
    const worker = { terminate: () => void log.push("worker terminated") };
    expect(() => createSheetUniver(options(worker))).toThrow("no canvas");
    expect(log).toEqual(["add guard capture", "createUniver", "remove guard", "container removed", "worker terminated"]);
    // Nothing is left on the window but the shell: a claimed key reaches a listener added now.
    const late: string[] = [];
    win.addEventListener("keydown", () => void late.push("late"), true);
    win.dispatchEvent(keydown(true));
    expect(late).toEqual(["late"]);
    state.failCreate = false;
  });
}
