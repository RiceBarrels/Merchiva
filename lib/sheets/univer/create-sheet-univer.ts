// One Univer instance for the spreadsheet editor (sheets.md §9.2). The editor host (components/sheets/editor/
// univer-host.tsx) imports the preset CSS and univer-compat.css, loads the locale (locale-loader.ts), starts
// the formula worker (worker-support.ts), then calls this with a sized host element. It creates no workbook:
// the sync session loads one through the model adapter (model-adapter.ts).
//
// Dispose ordering (§5.7, §9.2): the host first releases its session (which saves the model and unbinds the
// adapter), then calls dispose(), which defers Univer's own dispose to a microtask as Univer asks for under
// React 18/19, removes the container and terminates the worker (Univer never terminates one passed to it).
//
// Keys the app shell already claimed (S0 item 8): Univer's ShortcutService is a window keydown listener in the
// capture phase that ignores defaultPrevented, so ⌘9 would both switch tabs (the shell's selectLastTab) and
// hide the selected rows. guardClaimedKeys is registered on the same phase before createUniver, which puts it
// after the shell's listener (installed at boot) and ahead of Univer's; it lives exactly as long as the instance.

import {
  ICommandService, LogLevel, createUniver,
  type FUniver, type ILanguagePack, type LocaleType, type Univer,
} from "@univerjs/presets";
import { FUNCTION_LIST } from "@univerjs/preset-sheets-core";
import { buildSheetPresets } from "./presets";
import { buildUniverTheme } from "./theme";
import { neutralizeFunctionExamples } from "./white-label";

export interface CreateSheetUniverOptions {
  /** Our element with an explicit height; a child container is created per mount. */
  host: HTMLElement;
  /** Chosen from the host width at mount (< 768 px → mobile); the host remounts when it changes. */
  layout: "desktop" | "mobile";
  /** Desktop layout only: "collapsed" for a store tablet panel. Default "simple". */
  ribbon?: "simple" | "collapsed";
  locale: { type: LocaleType; pack: ILanguagePack; direction: "ltr" | "rtl" };
  dark: boolean;
  /** Null → formulas run on the main thread. Terminated by dispose() (or when creation throws). */
  worker: Worker | null;
  /** t("sheets.brand") */
  brand: string;
  /** No on-screen keyboard on open (device panels). The mobile layout never focuses on open. */
  disableAutoFocus?: boolean;
  /** Hyperlink clicks that passed isSafeSheetLink (Capacitor Browser on native, window.open otherwise). */
  onOpenUrl(url: string): void;
  /** The sheet's store, whose storage inserted images count toward. */
  organizationId: string;
  /** An inserted image failed to upload (after Univer's own generic error). */
  onImageUploadError?(err: unknown): void;
}

export interface SheetUniver {
  univer: Univer;
  univerAPI: FUniver;
  commandService: ICommandService;
  /** The element Univer renders into (a child of `host`). */
  container: HTMLElement;
  dispose(): void;
}

let mountCount = 0;

/** Where the guard listens: `window` in the app, a stand-in in tests. */
export type KeydownTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

/**
 * Stops a keydown that an earlier listener already handled (defaultPrevented) from reaching the capture listeners
 * registered after this one, Univer's shortcut listener among them. Returns the remover.
 */
export function guardClaimedKeys(target: KeydownTarget): () => void {
  const onKeyDown = (event: Event) => {
    if (event.defaultPrevented) event.stopImmediatePropagation();
  };
  target.addEventListener("keydown", onKeyDown, true);
  return () => target.removeEventListener("keydown", onKeyDown, true);
}

export function createSheetUniver(opts: CreateSheetUniverOptions): SheetUniver {
  neutralizeFunctionExamples(FUNCTION_LIST, opts.brand);
  const mount = ++mountCount;
  const container = document.createElement("div");
  container.className = "merchiva-sheet-univer";
  container.style.width = "100%";
  container.style.height = "100%";
  opts.host.appendChild(container);
  const presets = buildSheetPresets({
    container,
    layout: opts.layout,
    ribbon: opts.ribbon ?? "simple",
    worker: opts.worker,
    popupRootId: `merchiva-sheet-popups-${mount}`,
    disableAutoFocus: opts.disableAutoFocus === true || opts.layout === "mobile",
    onOpenUrl: opts.onOpenUrl,
    organizationId: opts.organizationId,
    onImageUploadError: opts.onImageUploadError,
  });
  let created: { univer: Univer; univerAPI: FUniver };
  // Before createUniver: Univer's ShortcutService (ui/lib/es/index.js:1023) adds its listener only after this.
  const releaseKeys = guardClaimedKeys(window);
  try {
    created = createUniver({
      locale: opts.locale.type,
      locales: { [opts.locale.type]: opts.locale.pack },
      direction: opts.locale.direction,
      darkMode: opts.dark,
      theme: buildUniverTheme(),
      logLevel: LogLevel.WARN,
      presets,
    });
  } catch (error) {
    releaseKeys();
    container.remove();
    opts.worker?.terminate();
    throw error;
  }
  const { univer, univerAPI } = created;
  let disposed = false;
  return {
    univer,
    univerAPI,
    commandService: univer.__getInjector().get(ICommandService),
    container,
    dispose() {
      if (disposed) return;
      disposed = true;
      const worker = opts.worker;
      queueMicrotask(() => {
        try {
          univer.dispose(); // removes Univer's shortcut listener
        } finally {
          releaseKeys();
          container.remove();
          worker?.terminate();
        }
      });
    },
  };
}
