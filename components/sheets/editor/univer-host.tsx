"use client";

/**
 * Mounts Univer for the spreadsheet editor (sheets.md §9.2) and binds its model to the sync session. The only
 * component that imports Univer (its CSS and, through lib/sheets/univer, its runtime).
 *
 * - Mount: the language pack loads (white-labelled), the formula worker starts (else formulas run in-thread), then
 *   createSheetUniver builds the instance inside our sized element and the model adapter goes to `bindModel`.
 *   The session loads the workbook and decides when the grid is editable (adapter.setEditable).
 * - Remounts: a locale change, the editor crossing the phone width (Univer's mobile plugins), or a worker that
 *   failed to start (this tab then computes formulas in-thread). Dark mode switches in place (toggleDarkMode).
 *   The width is the whole editor's (`[data-sheet-editor]`), so opening the history side panel never flips it.
 * - A mount that fails shows "Couldn't open" + Retry here and tells the editor (onFailed), which drops its skeleton.
 * - Read-only (not the holder, or a version preview on screen): the toolbar is hidden and the view-only guard
 *   stops the keys, pastes, drops and double-clicks that would start an edit.
 * - Keys the app shell already handled (⌘1–9 switch tabs) never reach Univer's own shortcut listener: the
 *   instance comes with guardClaimedKeys (createSheetUniver), which stops an event that is already defaultPrevented.
 * - Unmount, all synchronous: bindModel(null) parks the session (it saves the workbook while Univer is alive),
 *   then the adapter goes and Univer disposes in a microtask (createSheetUniver), terminating the worker.
 */
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs/preset-sheets-filter/lib/index.css";
import "@univerjs/preset-sheets-sort/lib/index.css";
import "@univerjs/preset-sheets-conditional-formatting/lib/index.css";
import "@univerjs/preset-sheets-data-validation/lib/index.css";
import "@univerjs/preset-sheets-find-replace/lib/index.css";
import "@univerjs/preset-sheets-hyper-link/lib/index.css";
import "@univerjs/preset-sheets-note/lib/index.css";
import "@univerjs/preset-sheets-drawing/lib/index.css";
import "@/lib/sheets/univer/univer-compat.css";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { IWorkbookData } from "@univerjs/presets";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { openExternal } from "@/lib/browser-shell/mobile/share";
import { useI18n } from "@/lib/i18n/context";
import { SHEET_PREVIEW_UNIT_ID, SHEET_UNIT_ID } from "@/lib/sheets/constants";
import type { SheetModelAdapter } from "@/lib/sheets/types";
import { createSheetUniver, type SheetUniver } from "@/lib/sheets/univer/create-sheet-univer";
import { loadUniverLocale } from "@/lib/sheets/univer/locale-loader";
import { createUniverModelAdapter } from "@/lib/sheets/univer/model-adapter";
import { installViewOnlyGuard } from "@/lib/sheets/univer/view-only-guard";
import { createFormulaWorker, watchFormulaWorkerStartup } from "@/lib/sheets/univer/worker-support";
import { sheetToSafeCsv } from "@/lib/sheets/xlsx/csv";
import { useResolvedDark } from "@/lib/use-resolved-dark";
import { MOBILE_BREAKPOINT } from "@/lib/use-is-mobile";
import type { SheetHostHandle } from "./sheet-editor-context";

/** A width change must settle this long before the layout remounts. */
const RELAYOUT_DELAY_MS = 300;

export interface UniverHostProps {
  /** The session's stable bindModel (lib/sheets/use-sheet-session.ts). */
  bindModel(model: SheetModelAdapter | null): void;
  /** Inside a device panel: no keyboard on open; a wide tablet keeps the desktop set with a collapsed ribbon. */
  panel: boolean;
  /** Our chrome's phone layout: no keyboard on open either. */
  mobile: boolean;
  /** A version preview is on screen (read-only, whoever holds the lease). */
  previewing: boolean;
  /** The grid's handle once Univer is up; null while (re)mounting. */
  onReady(handle: SheetHostHandle | null): void;
  /** Univer could not be mounted (true: the Retry overlay is up), or a retry started (false). */
  onFailed(failed: boolean): void;
  /** The view-only guard stopped an edit. */
  onBlocked(): void;
}

interface LiveUniver {
  sheet: SheetUniver;
  disposed: boolean;
}

/**
 * A formula worker failed to start in this tab: every later mount computes in-thread. The sessionStorage flag of
 * worker-support.ts says the same across reloads, but it is lost when storage is blocked, and without this the host
 * would remount on every failed start.
 */
let workerFailedInTab = false;

/** What decides Univer's layout: the editor as a whole (a side panel beside the grid does not count), else the host. */
function layoutElement(host: HTMLElement): HTMLElement {
  return host.closest<HTMLElement>("[data-sheet-editor]") ?? host;
}

function layoutOf(host: HTMLElement): "desktop" | "mobile" {
  const width = layoutElement(host).clientWidth || window.innerWidth;
  return width < MOBILE_BREAKPOINT ? "mobile" : "desktop";
}

export function UniverHost({ bindModel, panel, mobile, previewing, onReady, onFailed, onBlocked }: UniverHostProps) {
  const { t, locale } = useI18n();
  const dark = useResolvedDark();
  const brand = t("sheets.brand");
  const viewOnlyHint = t("sheets.lease.viewOnlyHint");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [live, setLive] = useState<LiveUniver | null>(null);
  const [editable, setEditable] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [failed, setFailed] = useState(false);

  // Read by the mount effect without remounting on change.
  const latest = useRef({ bindModel, onReady, onBlocked, dark, mobile });
  useLayoutEffect(() => {
    latest.current = { bindModel, onReady, onBlocked, dark, mobile };
  });
  const mountedLayout = useRef<"desktop" | "mobile" | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let teardown: (() => void) | null = null;
    const layout = layoutOf(host);
    mountedLayout.current = layout;

    loadUniverLocale(locale, brand, viewOnlyHint)
      .then((pack) => {
        if (cancelled) return;
        const worker = workerFailedInTab ? null : createFormulaWorker();
        let sheet: SheetUniver | null = null;
        let adapter: SheetModelAdapter;
        try {
          sheet = createSheetUniver({
            host,
            layout,
            ribbon: panel && layout === "desktop" ? "collapsed" : "simple",
            locale: pack,
            dark: latest.current.dark,
            worker,
            brand,
            disableAutoFocus: panel || latest.current.mobile,
            onOpenUrl: (url) => void openExternal(url).catch(() => {}),
          });
          adapter = createUniverModelAdapter({ univer: sheet.univer, univerAPI: sheet.univerAPI });
        } catch (err) {
          sheet?.dispose(); // createSheetUniver cleans up after itself when it throws
          throw err;
        }
        const stopWatch = worker
          ? watchFormulaWorkerStartup(worker, () => {
              workerFailedInTab = true;
              setGeneration((n) => n + 1);
            })
          : () => {};
        const mounted: SheetUniver = sheet;
        const model: SheetModelAdapter = {
          ...adapter,
          setEditable(value: boolean) {
            adapter.setEditable(value);
            setEditable(value);
          },
        };
        const current: LiveUniver = { sheet: mounted, disposed: false };
        let preview: SheetModelAdapter | null = null;
        const handle: SheetHostHandle = {
          undo: () => void mounted.univerAPI.undo().catch(() => false),
          redo: () => void mounted.univerAPI.redo().catch(() => false),
          exportWorkbook: (): IWorkbookData => adapter.saveForExport(),
          activeSheetCsv: () => {
            const sheetApi = mounted.univerAPI.getWorkbook(SHEET_UNIT_ID)?.getActiveSheet();
            if (!sheetApi) return null;
            const range = sheetApi.getDataRange();
            const display = range.getDisplayValues();
            const cells = range.getCellDatas();
            const csv = sheetToSafeCsv(display, (row, col) => {
              const cell = cells[row]?.[col];
              return cell ? { v: cell.v, t: typeof cell.t === "number" ? cell.t : null } : null;
            });
            return { sheetName: sheetApi.getSheetName(), csv };
          },
          showPreview: (wb: IWorkbookData) => {
            preview?.dispose();
            preview = createUniverModelAdapter({ univer: mounted.univer, univerAPI: mounted.univerAPI }, { unitId: SHEET_PREVIEW_UNIT_ID });
            preview.load(wb);
          },
          hidePreview: () => {
            preview?.dispose();
            preview = null;
          },
        };
        setLive(current);
        latest.current.bindModel(model);
        latest.current.onReady(handle);
        teardown = () => {
          current.disposed = true;
          stopWatch();
          latest.current.onReady(null);
          latest.current.bindModel(null); // parks: the workbook is saved while Univer is still alive
          preview?.dispose();
          preview = null;
          adapter.dispose();
          mounted.dispose();
        };
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      teardown?.();
      teardown = null;
    };
  }, [locale, brand, viewOnlyHint, panel, generation]);

  // Remount when the editor crosses the phone width (Univer picks its plugin set at creation).
  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const measured = layoutElement(host);
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (measured.clientWidth > 0 && mountedLayout.current !== null && layoutOf(host) !== mountedLayout.current) {
          setGeneration((n) => n + 1);
        }
      }, RELAYOUT_DELAY_MS);
    });
    observer.observe(measured);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    onFailed(failed);
  }, [failed, onFailed]);

  useEffect(() => {
    if (live && !live.disposed) live.sheet.univerAPI.toggleDarkMode(dark);
  }, [live, dark]);

  const retry = () => {
    setFailed(false);
    setGeneration((n) => n + 1);
  };

  const readOnly = !editable || previewing;
  useEffect(() => {
    if (!live || live.disposed) return;
    const { univerAPI, container } = live.sheet;
    try {
      univerAPI.setUIVisible(univerAPI.Enum.BuiltInUIPart.TOOLBAR, !readOnly);
    } catch {
      // The phone layout has no toolbar part.
    }
    if (!readOnly) return;
    return installViewOnlyGuard(container, () => latest.current.onBlocked());
  }, [live, readOnly]);

  return (
    <div className="relative h-full min-h-0 w-full min-w-0" data-sheet-host="">
      <div ref={hostRef} className="absolute inset-0" />
      {failed && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background p-4">
          <EmptyState
            icon={AlertTriangle}
            title={t("sheets.editor.loadFailedTitle")}
            action={
              <Button type="button" variant="outline" size="sm" onClick={retry}>
                {t("sheets.editor.retry")}
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
