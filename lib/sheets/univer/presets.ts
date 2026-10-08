// The editor's Univer presets (sheets.md §9.2): the core preset plus eight feature presets, configured, and
// swapped to Univer's mobile UI plugins for phone widths. Every constructor comes from a preset entry.

import { IImageIoService, type IPreset, type IPresetPlugin, type Plugin, type PluginCtor } from "@univerjs/presets";
import * as SheetsCore from "@univerjs/preset-sheets-core";
import { UniverSheetsConditionalFormattingMobileUIPlugin, UniverSheetsConditionalFormattingPreset, UniverSheetsConditionalFormattingUIPlugin } from "@univerjs/preset-sheets-conditional-formatting";
import { UniverSheetsDataValidationMobileUIPlugin, UniverSheetsDataValidationPreset, UniverSheetsDataValidationUIPlugin } from "@univerjs/preset-sheets-data-validation";
import {
  UniverDrawingMobileUIPlugin, UniverDrawingPlugin, UniverDrawingUIPlugin, UniverSheetsDrawingMobileUIPlugin,
  UniverSheetsDrawingPreset, UniverSheetsDrawingUIPlugin,
} from "@univerjs/preset-sheets-drawing";
import { UniverSheetsFilterMobileUIPlugin, UniverSheetsFilterPreset, UniverSheetsFilterUIPlugin } from "@univerjs/preset-sheets-filter";
import {
  UniverFindReplaceMobileUIPlugin, UniverFindReplacePlugin, UniverSheetsFindReplaceMobileUIPlugin, UniverSheetsFindReplacePlugin,
  UniverSheetsFindReplacePreset,
} from "@univerjs/preset-sheets-find-replace";
import { UniverSheetsHyperLinkMobileUIPlugin, UniverSheetsHyperLinkPreset, UniverSheetsHyperLinkUIPlugin } from "@univerjs/preset-sheets-hyper-link";
import { UniverSheetsNotePreset, UniverSheetsNoteUIPlugin } from "@univerjs/preset-sheets-note";
import { UniverSheetsSortMobileUIPlugin, UniverSheetsSortPreset, UniverSheetsSortUIPlugin } from "@univerjs/preset-sheets-sort";
import { DOC_IMAGE_MAX_BYTES } from "@/lib/docs/uploads";
import { isSafeSheetLink } from "@/lib/sheets/sanitize";
import { MerchivaImageIoService } from "./image-io";
import { SHEET_MENU_CONFIG } from "./menu-config";
import { buildSafeFormulaFunctions } from "./safe-functions";

type AnyPluginCtor = PluginCtor<Plugin>;

export interface SheetPresetConfig {
  /** The element Univer renders into (created by createSheetUniver inside the host). */
  container: HTMLElement;
  layout: "desktop" | "mobile";
  /** Desktop only: "simple" on a page, "collapsed" in a store-tablet panel. */
  ribbon: "simple" | "collapsed";
  /** The formula worker, or null for main-thread formulas. */
  worker: Worker | null;
  /** Id of the element Univer's canvas popups render into (inside the editor). */
  popupRootId: string;
  /** No on-screen keyboard on open (phones and device panels). */
  disableAutoFocus: boolean;
  /** A hyperlink click that passed isSafeSheetLink. */
  onOpenUrl(url: string): void;
  /** The sheet's store: inserted images count toward its storage (MerchivaImageIoService). */
  organizationId: string;
  /** An image upload failed (the error the upload rejected with). */
  onImageUploadError?(err: unknown): void;
}

/** Desktop plugin → its mobile counterpart (constructor identity, sheets.md §9.2). */
const MOBILE_SWAP: ReadonlyMap<AnyPluginCtor, AnyPluginCtor> = new Map<AnyPluginCtor, AnyPluginCtor>([
  [SheetsCore.UniverUIPlugin, SheetsCore.UniverMobileUIPlugin],
  [SheetsCore.UniverSheetsUIPlugin, SheetsCore.UniverSheetsMobileUIPlugin],
  [SheetsCore.UniverDocsUIPlugin, SheetsCore.UniverDocsMobileUIPlugin],
  [SheetsCore.UniverSheetsFormulaUIPlugin, SheetsCore.UniverSheetsFormulaMobileUIPlugin],
  [SheetsCore.UniverSheetsNumfmtUIPlugin, SheetsCore.UniverSheetsNumfmtMobileUIPlugin],
  [UniverSheetsFilterUIPlugin, UniverSheetsFilterMobileUIPlugin],
  [UniverSheetsSortUIPlugin, UniverSheetsSortMobileUIPlugin],
  [UniverSheetsConditionalFormattingUIPlugin, UniverSheetsConditionalFormattingMobileUIPlugin],
  [UniverSheetsDataValidationUIPlugin, UniverSheetsDataValidationMobileUIPlugin],
  [UniverFindReplacePlugin, UniverFindReplaceMobileUIPlugin],
  [UniverSheetsFindReplacePlugin, UniverSheetsFindReplaceMobileUIPlugin],
  [UniverSheetsHyperLinkUIPlugin, UniverSheetsHyperLinkMobileUIPlugin],
  [UniverDrawingUIPlugin, UniverDrawingMobileUIPlugin],
  [UniverSheetsDrawingUIPlugin, UniverSheetsDrawingMobileUIPlugin],
]);

/** Desktop plugins with no mobile variant: dropped from the phone layout (notes stay in the model). */
const MOBILE_DROP: ReadonlySet<AnyPluginCtor> = new Set<AnyPluginCtor>([UniverSheetsNoteUIPlugin]);

function splitEntry(entry: IPresetPlugin): [AnyPluginCtor, object | undefined] {
  return Array.isArray(entry) ? [entry[0], entry[1] as object | undefined] : [entry, undefined];
}

function joinEntry(ctor: AnyPluginCtor, config: object | undefined): IPresetPlugin {
  return config === undefined ? ctor : [ctor, config];
}

/** `preset` with `patch` merged into the config of every `ctor` entry (the entry keeps its position). */
export function withPluginConfig(preset: IPreset, ctor: AnyPluginCtor, patch: object): IPreset {
  return {
    ...preset,
    plugins: preset.plugins.map((entry) => {
      const [plugin, config] = splitEntry(entry);
      return plugin === ctor ? joinEntry(plugin, { ...config, ...patch }) : entry;
    }),
  };
}

/**
 * The phone layout: each desktop UI plugin replaced in place by its mobile one, same config. Replacing (not
 * appending) matters, because some mobile plugins keep the desktop pluginName and others do not.
 */
export function swapToMobile(presets: readonly IPreset[]): IPreset[] {
  return presets.map((preset) => ({
    ...preset,
    plugins: preset.plugins.flatMap((entry): IPresetPlugin[] => {
      const [plugin, config] = splitEntry(entry);
      if (MOBILE_DROP.has(plugin)) return [];
      const mobile = MOBILE_SWAP.get(plugin);
      return [mobile ? joinEntry(mobile, config) : entry];
    }),
  }));
}

export function buildSheetPresets(cfg: SheetPresetConfig): IPreset[] {
  const mobile = cfg.layout === "mobile";
  let core = SheetsCore.UniverSheetsCorePreset({
    container: cfg.container,
    header: true,
    toolbar: true,
    ribbonType: mobile ? undefined : cfg.ribbon,
    // footer left undefined: sheet tabs, statistics, menus and zoom all shown (Univer's `footer` takes only
    // `false` or a per-part object)
    formulaBar: !mobile,
    contextMenu: true,
    menu: SHEET_MENU_CONFIG,
    disableAutoFocus: cfg.disableAutoFocus || undefined,
    workerURL: cfg.worker ?? undefined,
    formula: { function: buildSafeFormulaFunctions(SheetsCore) },
    sheets: { freezeSync: true },
  });
  core = withPluginConfig(core, SheetsCore.UniverUIPlugin, { popupRootId: cfg.popupRootId });
  let drawing = UniverSheetsDrawingPreset({ allowImageSize: DOC_IMAGE_MAX_BYTES });
  drawing = withPluginConfig(drawing, UniverDrawingPlugin, {
    override: [[IImageIoService, { useFactory: () => new MerchivaImageIoService(cfg.organizationId, cfg.onImageUploadError) }]],
  });
  const presets: IPreset[] = [
    core,
    UniverSheetsFilterPreset(),
    UniverSheetsSortPreset(),
    UniverSheetsConditionalFormattingPreset(),
    UniverSheetsDataValidationPreset(),
    UniverSheetsFindReplacePreset(),
    UniverSheetsHyperLinkPreset({
      urlHandler: {
        navigateToOtherWebsite: (url: string) => {
          if (isSafeSheetLink(url)) cfg.onOpenUrl(url);
        },
      },
    }),
    UniverSheetsNotePreset(),
    drawing,
  ];
  return mobile ? swapToMobile(presets) : presets;
}
