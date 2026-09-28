// SheetModelAdapter over a live Univer instance (sheets.md §8.1, §9.9): the sync engine's only handle on the
// editor's workbook. It reads Univer through its services (not the facade), so the same code runs headless
// under Bun, where the UI facades cannot be constructed (scripts/tests/sheets/helpers/headless-adapter.ts).
//
// - load: the unit is disposed and recreated under one id, the active sheet kept. Univer keeps undo stacks per
//   unit id and a dispose leaves them, so load clears them: Undo must never replay an edit from before a reload
//   (a discarded one) against the new content;
// - capture: every executed mutation passes captureMutation (mutation-filter.ts): an op, a compaction
//   request, or nothing. Capture is muted while this adapter itself changes the model (load, applyRemote);
// - applyRemote: accepted + sanitized ops run as mutations `{ fromCollab: true }`, which bypass the editable
//   permission, and stop at the first one Univer does not know, rejects or throws on. Once one applied, the
//   unit's undo history is cleared too: local undo entries are positional and never transformed against a
//   remote mutation, so after a hand-back Undo would change someone else's rows. An editing holder receives no
//   remote ops, so no usable Undo is lost;
// - setEditable(false) also refuses Undo and Redo on this unit: Univer gates edit commands on the editable
//   permission but not those two, and its shortcut listener (window, capture phase) runs before the view-only
//   guard, so a viewer's ⌘Z would otherwise rewind their grid;
// - a second adapter (the version preview, SHEET_PREVIEW_UNIT_ID) shows its unit on load and, on dispose,
//   disposes that unit and makes SHEET_UNIT_ID current again. The main unit never takes the screen from it.

import {
  CustomCommandExecutionError, ICommandService, IPermissionService, IResourceLoaderService, IUndoRedoService,
  IUniverInstanceService, RedoCommandId, UndoCommandId, UniverInstanceType, type DependencyIdentifier, type FUniver,
  type ICellData, type IWorkbookData, type Nullable, type Univer, type Workbook,
} from "@univerjs/presets";
import {
  FormulaDataModel, SetWorksheetActiveOperation, SheetsSelectionsService, WorkbookEditablePermission,
  type ISelectionWithStyle,
} from "@univerjs/preset-sheets-core";
import { SHEET_UNIT_ID } from "@/lib/sheets/constants";
import type { SheetModelAdapter, SheetOp, SheetSelection } from "@/lib/sheets/types";
import { captureMutation } from "./mutation-filter";
import { createPeerHighlighter } from "./peer-highlight";

export interface UniverModelHost {
  univer: Univer;
  /** The facade, for the peer outline. Null headless, where the UI facades cannot be built. */
  univerAPI: FUniver | null;
}

export interface UniverModelAdapterOptions {
  /**
   * SHEET_UNIT_ID (default), or SHEET_PREVIEW_UNIT_ID for the read-only version preview. The preview adapter owns
   * its unit: load() makes it current, dispose() disposes it and makes SHEET_UNIT_ID current again.
   */
  unitId?: string;
}

type Listener<T> = (value: T) => void;

const loggedSnapshotIds = new Set<string>();

/** A persisted mutation the op log cannot carry is fine (the next compaction does), but worth knowing about. */
function noteSnapshotMutation(mutationId: string): void {
  if (process.env.NODE_ENV === "production" || loggedSnapshotIds.has(mutationId)) return;
  loggedSnapshotIds.add(mutationId);
  console.debug(`[sheets] ${mutationId} is saved by the next snapshot, not as an op`);
}

function toSelection(entries: readonly ISelectionWithStyle[] | null | undefined, sheetId: string | null): SheetSelection | null {
  const range = entries?.[entries.length - 1]?.range;
  if (!range || !sheetId) return null;
  const { startRow, startColumn, endRow, endColumn } = range;
  if (![startRow, startColumn, endRow, endColumn].every(Number.isFinite)) return null;
  return { sheetId: range.sheetId || sheetId, startRow, startColumn, endRow, endColumn };
}

/** Every formula cell gets its own `f` (shared-formula followers are expanded) and no `si`. */
function materializeFormulas(wb: IWorkbookData, formulas: FormulaDataModel | null, unitId: string): void {
  for (const [sheetId, sheet] of Object.entries(wb.sheets ?? {})) {
    const rows = (sheet.cellData ?? {}) as Record<string, Record<string, Nullable<ICellData>> | undefined>;
    for (const [row, cells] of Object.entries(rows)) {
      for (const [column, cell] of Object.entries(cells ?? {})) {
        if (!cell || cell.si == null) continue;
        if (!cell.f) {
          const formula = formulas?.getFormulaStringByCell(Number(row), Number(column), sheetId, unitId);
          if (formula) cell.f = formula;
        }
        delete cell.si;
      }
    }
  }
}

export function createUniverModelAdapter(host: UniverModelHost, options: UniverModelAdapterOptions = {}): SheetModelAdapter {
  const unitId = options.unitId ?? SHEET_UNIT_ID;
  const isMain = unitId === SHEET_UNIT_ID;
  const injector = host.univer.__getInjector();
  const commands = injector.get(ICommandService);
  const instances = injector.get(IUniverInstanceService);
  const resourceLoader = injector.get(IResourceLoaderService);
  const permissions = injector.get(IPermissionService);
  const highlighter = createPeerHighlighter(host.univerAPI, unitId);
  const localListeners = new Set<Listener<SheetOp>>();
  const snapshotListeners = new Set<Listener<string>>();
  const selectionListeners = new Set<Listener<SheetSelection | null>>();
  let muted = 0;
  let editable = false;
  let disposed = false;

  const workbook = (): Workbook | null => instances.getUnit<Workbook>(unitId, UniverInstanceType.UNIVER_SHEET) ?? null;
  const activeSheetId = (): string | null => workbook()?.getActiveSheet(true)?.getSheetId() ?? null;
  const currentUnitId = () => instances.getCurrentUnitOfType<Workbook>(UniverInstanceType.UNIVER_SHEET)?.getUnitId() ?? null;
  const isCurrent = () => currentUnitId() === unitId;

  const applyEditable = () => {
    if (!workbook()) return;
    const point = new WorkbookEditablePermission(unitId);
    if (!permissions.getPermissionPoint(point.id)) permissions.addPermissionPoint(point);
    permissions.updatePermissionPoint(point.id, editable);
  };

  const muteWhile = <T>(fn: () => T): T => {
    muted++;
    try {
      return fn();
    } finally {
      muted--;
    }
  };

  // Undo and Redo act on the focused unit (core UndoCommand); the throw is how Univer's own permission check
  // refuses a command (executeCommand then returns false).
  const historyGate = commands.beforeCommandExecuted((info) => {
    if (editable || disposed || (info.id !== UndoCommandId && info.id !== RedoCommandId)) return;
    if (instances.getFocusedUnit()?.getUnitId() !== unitId) return;
    throw new CustomCommandExecutionError("The spreadsheet is view-only");
  });

  const collab = commands.onMutationExecutedForCollab((info, executionOptions) => {
    if (muted > 0 || disposed) return;
    const captured = captureMutation(info, executionOptions, unitId);
    if (captured.kind === "op") {
      for (const listener of [...localListeners]) listener(captured.op);
    } else if (captured.kind === "snapshot") {
      noteSnapshotMutation(captured.mutationId);
      for (const listener of [...snapshotListeners]) listener(captured.mutationId);
    }
  });

  // Sheet services exist once Univer starts the sheet plugins, which it does when the first workbook is created.
  const sheetService = <T>(token: DependencyIdentifier<T>): T | null => {
    try {
      return injector.get(token);
    } catch {
      return null;
    }
  };
  /** Univer keeps undo stacks per unit id, also across disposeUnit (core LocalUndoRedoService). */
  const clearHistory = () => sheetService<IUndoRedoService>(IUndoRedoService)?.clearUndoRedo(unitId);
  /** The preview's unit goes with its adapter, and the sheet it covered becomes current again. */
  const releaseUnit = () => {
    clearHistory();
    if (workbook()) instances.disposeUnit(unitId);
    if (currentUnitId() === null && instances.getUnit(SHEET_UNIT_ID, UniverInstanceType.UNIVER_SHEET)) {
      instances.setCurrentUnitForType(SHEET_UNIT_ID);
    }
  };
  let selections: SheetsSelectionsService | null = null;
  let selectionSub: { unsubscribe(): void } | null = null;
  const watchSelections = () => {
    if (selectionSub || disposed) return;
    selections = sheetService<SheetsSelectionsService>(SheetsSelectionsService);
    selectionSub = selections?.selectionMoveEnd$.subscribe((entries) => {
      if (disposed || !isCurrent() || selectionListeners.size === 0) return;
      const selection = toSelection(entries, activeSheetId());
      for (const listener of [...selectionListeners]) listener(selection);
    }) ?? null;
  };

  const listen = <T>(set: Set<Listener<T>>, listener: Listener<T>) => {
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  };

  const save = (): IWorkbookData => {
    const data = resourceLoader.saveUnit<IWorkbookData>(unitId);
    if (!data) throw new Error("The spreadsheet is not loaded");
    data.id = unitId;
    return data;
  };

  return {
    /** Takes ownership of `data` (Univer keeps it as the unit's snapshot). */
    load(data: IWorkbookData): void {
      muteWhile(() => {
        const keepActive = activeSheetId();
        if (workbook()) instances.disposeUnit(unitId);
        data.id = unitId;
        // A reload of the main unit stays behind an open preview (which is then current); a preview always shows.
        const makeCurrent = !isMain || currentUnitId() === null;
        instances.createUnit<IWorkbookData, Workbook>(UniverInstanceType.UNIVER_SHEET, data, { makeCurrent });
        clearHistory();
        const created = workbook();
        const sheet = keepActive ? created?.getSheetBySheetId(keepActive) : null;
        if (created && sheet && !sheet.isSheetHidden()) {
          commands.syncExecuteCommand(SetWorksheetActiveOperation.id, { unitId, subUnitId: keepActive });
        }
        applyEditable();
      });
      watchSelections();
    },

    applyRemote(ops: readonly SheetOp[]): { applied: number; failedAt: number } {
      const result = muteWhile(() => {
        for (let i = 0; i < ops.length; i++) {
          const { mutationId, params } = ops[i];
          if (!commands.hasCommand(mutationId)) return { applied: i, failedAt: i };
          let executed: unknown;
          try {
            executed = commands.syncExecuteCommand(mutationId, params, { fromCollab: true });
          } catch {
            return { applied: i, failedAt: i };
          }
          if (executed === false) return { applied: i, failedAt: i };
        }
        return { applied: ops.length, failedAt: -1 };
      });
      if (result.applied > 0) clearHistory();
      return result;
    },

    save,

    saveForExport(): IWorkbookData {
      const data = save();
      // Without a formula engine, followers keep only their cached values.
      materializeFormulas(data, sheetService<FormulaDataModel>(FormulaDataModel), unitId);
      return data;
    },

    onLocalOp: (listener) => listen(localListeners, listener),
    onNeedsSnapshot: (listener) => listen(snapshotListeners, listener),

    setEditable(value: boolean): void {
      editable = value;
      applyEditable();
    },

    getSelection(): SheetSelection | null {
      if (!selections || !isCurrent()) return null;
      return toSelection(selections.getCurrentSelections(), activeSheetId());
    },

    onSelectionChange: (listener) => listen(selectionListeners, listener),

    highlightPeer(peer): void {
      if (!disposed) highlighter.show(peer);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      historyGate.dispose();
      collab.dispose();
      selectionSub?.unsubscribe();
      highlighter.dispose();
      localListeners.clear();
      snapshotListeners.clear();
      selectionListeners.clear();
      if (!isMain) releaseUnit();
    },
  };
}
