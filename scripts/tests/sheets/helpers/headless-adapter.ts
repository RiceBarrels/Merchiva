// The editor's real SheetModelAdapter (lib/sheets/univer/model-adapter.ts) over a headless Univer
// (./headless.ts), for the op-replay and session suites (sheets.md §15, SH3). Nothing here re-implements the
// adapter: capture, load, applyRemote and save are the browser code; only the UI (and so the peer outline)
// is missing. The adapter module is imported after the Path2D stub, like the preset entries.

import type { IWorkbookData, Workbook } from "@univerjs/presets";
import { SHEET_UNIT_ID } from "@/lib/sheets/constants";
import type { SheetModelAdapter, SheetOp } from "@/lib/sheets/types";
import { createHeadlessUniver, loadHeadlessModules, type HeadlessUniver, type HeadlessUniverOptions } from "./headless";

export interface HeadlessSheet {
  adapter: SheetModelAdapter;
  headless: HeadlessUniver;
  unitId: string;
  /** Ops the adapter captured, in order (also delivered to onLocalOp listeners). */
  captured: SheetOp[];
  /** Mutation ids the adapter asked a snapshot for. */
  snapshots: string[];
  /** Runs a command the way the UI does (permission checks included); true when Univer executed it. */
  run(commandId: string, params?: object): Promise<boolean>;
  /** Executes a mutation directly, as a UI controller would (captured like any local mutation). */
  mutate(mutationId: string, params: object): boolean;
  workbook(): Workbook;
  /** The saved workbook without volatile parts, for semantic comparison between two models. */
  comparable(): IWorkbookData;
  dispose(): void;
}

export interface HeadlessSheetOptions extends HeadlessUniverOptions {
  unitId?: string;
  /** Loaded right away (after a JSON copy) when given. */
  data?: IWorkbookData;
}

/** Resource payloads Univer writes in a different order, or for bookkeeping only. */
const VOLATILE_RESOURCES: ReadonlySet<string> = new Set(["SHEET_AuthzIoMockService_PLUGIN"]);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item !== undefined) out[key] = canonical(item);
    }
    return out;
  }
  return value;
}

type Json = Record<string, unknown>;

/** Style ids are minted by each client as it applies a style; the style itself is what must match. */
function inlineStyles(wb: Json): void {
  const styles = (wb.styles ?? {}) as Record<string, unknown>;
  const resolve = (holder: Json | null | undefined) => {
    if (holder && typeof holder.s === "string") holder.s = styles[holder.s] ?? holder.s;
  };
  for (const sheet of Object.values((wb.sheets ?? {}) as Record<string, Json>)) {
    if (typeof sheet.defaultStyle === "string") sheet.defaultStyle = styles[sheet.defaultStyle] ?? sheet.defaultStyle;
    for (const row of Object.values((sheet.cellData ?? {}) as Record<string, Record<string, Json | null>>)) {
      for (const cell of Object.values(row ?? {})) resolve(cell);
    }
    for (const row of Object.values((sheet.rowData ?? {}) as Record<string, Json | null>)) resolve(row);
    for (const column of Object.values((sheet.columnData ?? {}) as Record<string, Json | null>)) resolve(column);
  }
  delete wb.styles;
}

/** Per-sheet maps in resources: an empty list for a sheet is the same as no entry. */
function dropEmptyEntries(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const out: Json = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.length === 0) continue;
    if (value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) continue;
    out[key] = value;
  }
  return out;
}

/**
 * A workbook for comparison: styles inlined, resources parsed (their JSON compared as data, empty per-sheet
 * entries dropped), keys sorted.
 */
export function comparableWorkbook(wb: IWorkbookData): IWorkbookData {
  const copy = JSON.parse(JSON.stringify(wb)) as Json;
  inlineStyles(copy);
  copy.resources = ((copy.resources ?? []) as Array<{ name: string; data: unknown }>)
    .filter((r) => !VOLATILE_RESOURCES.has(r.name))
    .map((r) => {
      let data: unknown = r.data;
      if (typeof r.data === "string" && r.data !== "") {
        try {
          data = JSON.parse(r.data);
        } catch {
          // compared as text
        }
      }
      return { name: r.name, data: data === "" ? {} : dropEmptyEntries(data) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return canonical(copy) as IWorkbookData;
}

/** Mutation-typed commands that only touch the render layer; headless their real handlers throw. */
const RENDER_ONLY_MUTATIONS: readonly string[] = ["sheet.operation.clear-drawing-transformer"];

/**
 * Swaps the render-only mutations for no-ops once the sheet plugins have started (they register their
 * commands when the first workbook is created), so model commands that end with one still succeed.
 */
export function stubRenderOnlyMutations(headless: HeadlessUniver): void {
  const { presets: P } = headless.modules;
  for (const id of RENDER_ONLY_MUTATIONS) {
    if (!headless.commandService.hasCommand(id)) continue;
    headless.commandService.unregisterCommand(id);
    headless.commandService.registerCommand({ id, type: P.CommandType.MUTATION, handler: () => true });
  }
}

export async function createHeadlessSheet(options: HeadlessSheetOptions = {}): Promise<HeadlessSheet> {
  await loadHeadlessModules();
  const { createUniverModelAdapter } = await import("@/lib/sheets/univer/model-adapter");
  const headless = await createHeadlessUniver(options);
  const unitId = options.unitId ?? SHEET_UNIT_ID;
  const adapter = createUniverModelAdapter({ univer: headless.univer, univerAPI: null }, { unitId });
  const { presets: P } = headless.modules;
  const captured: SheetOp[] = [];
  const snapshots: string[] = [];
  adapter.onLocalOp((op) => captured.push(op));
  adapter.onNeedsSnapshot((id) => snapshots.push(id));
  const sheet: HeadlessSheet = {
    adapter,
    headless,
    unitId,
    captured,
    snapshots,
    run: async (commandId, params) => (await headless.commandService.executeCommand(commandId, params)) === true,
    mutate: (mutationId, params) => headless.commandService.syncExecuteCommand(mutationId, params) === true,
    workbook() {
      const unit = headless.univer.__getInjector().get(P.IUniverInstanceService).getUnit<Workbook>(unitId, P.UniverInstanceType.UNIVER_SHEET);
      if (!unit) throw new Error("No workbook loaded");
      return unit;
    },
    comparable: () => comparableWorkbook(adapter.save()),
    dispose() {
      adapter.dispose();
      headless.dispose();
    },
  };
  if (options.data) {
    adapter.load(JSON.parse(JSON.stringify(options.data)) as IWorkbookData);
    stubRenderOnlyMutations(headless);
  }
  return sheet;
}
