// Literal mirrors of the Univer 1.0.2 enums and resource names that code OUTSIDE the editor chunk needs
// (the xlsx worker, the sanitizer, the text serializer, create/import). Importing the enums themselves would
// pull the Univer runtime into those bundles, so the values are copied here and typed as the enum members
// (type-only imports). scripts/tests/sheets/univer-constants.test.ts checks every value against the
// installed enums.

import type {
  BooleanNumber,
  BorderStyleTypes,
  CellValueType,
  CustomRangeType,
  DataValidationErrorStyle,
  DataValidationOperator,
  DataValidationType,
  DateSystem,
  HorizontalAlign,
  ImageSourceType,
  LocaleType,
  VerticalAlign,
  WorksheetHiddenState,
  WrapStrategy,
} from "@univerjs/presets";
import type {
  CFNumberOperator,
  CFRuleType,
  CFSubRuleType,
  CFTextOperator,
  CFTimePeriodOperator,
  CFValueType,
} from "@univerjs/preset-sheets-conditional-formatting";

/** LocaleType. The app maps its locales onto these in lib/sheets/univer/locale-loader.ts (hi falls back to enUS). */
export const UNIVER_LOCALE = {
  EN_US: "enUS" as LocaleType.EN_US,
  FR_FR: "frFR" as LocaleType.FR_FR,
  ZH_CN: "zhCN" as LocaleType.ZH_CN,
  RU_RU: "ruRU" as LocaleType.RU_RU,
  ZH_TW: "zhTW" as LocaleType.ZH_TW,
  ZH_HK: "zhHK" as LocaleType.ZH_HK,
  VI_VN: "viVN" as LocaleType.VI_VN,
  FA_IR: "faIR" as LocaleType.FA_IR,
  JA_JP: "jaJP" as LocaleType.JA_JP,
  KO_KR: "koKR" as LocaleType.KO_KR,
  ES_ES: "esES" as LocaleType.ES_ES,
  CA_ES: "caES" as LocaleType.CA_ES,
  SK_SK: "skSK" as LocaleType.SK_SK,
  PT_BR: "ptBR" as LocaleType.PT_BR,
  DE_DE: "deDE" as LocaleType.DE_DE,
  IT_IT: "itIT" as LocaleType.IT_IT,
  ID_ID: "idID" as LocaleType.ID_ID,
  PL_PL: "plPL" as LocaleType.PL_PL,
  AR_SA: "arSA" as LocaleType.AR_SA,
} as const;

/** CellValueType (`ICellData.t`). */
export const CELL_TYPE = {
  STRING: 1 as CellValueType.STRING,
  NUMBER: 2 as CellValueType.NUMBER,
  BOOLEAN: 3 as CellValueType.BOOLEAN,
  FORCE_STRING: 4 as CellValueType.FORCE_STRING,
} as const;

/** BooleanNumber (booleans in Univer data are 1 | 0). */
export const BOOL = {
  FALSE: 0 as BooleanNumber.FALSE,
  TRUE: 1 as BooleanNumber.TRUE,
} as const;

/** WorksheetHiddenState (`IWorksheetData.hidden`). */
export const SHEET_HIDDEN = {
  VISIBLE: 0 as WorksheetHiddenState.VISIBLE,
  HIDDEN: 1 as WorksheetHiddenState.HIDDEN,
  VERY_HIDDEN: 2 as WorksheetHiddenState.VERY_HIDDEN,
} as const;

/** DateSystem (`IWorkbookData.dateSystem`). */
export const DATE_SYSTEM = {
  DATE_1900: "date1900" as DateSystem.Date1900,
  DATE_1904: "date1904" as DateSystem.Date1904,
} as const;

export const H_ALIGN = {
  UNSPECIFIED: 0 as HorizontalAlign.UNSPECIFIED,
  LEFT: 1 as HorizontalAlign.LEFT,
  CENTER: 2 as HorizontalAlign.CENTER,
  RIGHT: 3 as HorizontalAlign.RIGHT,
  JUSTIFIED: 4 as HorizontalAlign.JUSTIFIED,
  BOTH: 5 as HorizontalAlign.BOTH,
  DISTRIBUTED: 6 as HorizontalAlign.DISTRIBUTED,
} as const;

export const V_ALIGN = {
  UNSPECIFIED: 0 as VerticalAlign.UNSPECIFIED,
  TOP: 1 as VerticalAlign.TOP,
  MIDDLE: 2 as VerticalAlign.MIDDLE,
  BOTTOM: 3 as VerticalAlign.BOTTOM,
} as const;

export const WRAP = {
  UNSPECIFIED: 0 as WrapStrategy.UNSPECIFIED,
  OVERFLOW: 1 as WrapStrategy.OVERFLOW,
  CLIP: 2 as WrapStrategy.CLIP,
  WRAP: 3 as WrapStrategy.WRAP,
} as const;

/** BorderStyleTypes (0..13). */
export const BORDER_STYLE = {
  NONE: 0 as BorderStyleTypes.NONE,
  THIN: 1 as BorderStyleTypes.THIN,
  HAIR: 2 as BorderStyleTypes.HAIR,
  DOTTED: 3 as BorderStyleTypes.DOTTED,
  DASHED: 4 as BorderStyleTypes.DASHED,
  DASH_DOT: 5 as BorderStyleTypes.DASH_DOT,
  DASH_DOT_DOT: 6 as BorderStyleTypes.DASH_DOT_DOT,
  DOUBLE: 7 as BorderStyleTypes.DOUBLE,
  MEDIUM: 8 as BorderStyleTypes.MEDIUM,
  MEDIUM_DASHED: 9 as BorderStyleTypes.MEDIUM_DASHED,
  MEDIUM_DASH_DOT: 10 as BorderStyleTypes.MEDIUM_DASH_DOT,
  MEDIUM_DASH_DOT_DOT: 11 as BorderStyleTypes.MEDIUM_DASH_DOT_DOT,
  SLANT_DASH_DOT: 12 as BorderStyleTypes.SLANT_DASH_DOT,
  THICK: 13 as BorderStyleTypes.THICK,
} as const;

export const DV_TYPE = {
  CUSTOM: "custom" as DataValidationType.CUSTOM,
  LIST: "list" as DataValidationType.LIST,
  LIST_MULTIPLE: "listMultiple" as DataValidationType.LIST_MULTIPLE,
  NONE: "none" as DataValidationType.NONE,
  TEXT_LENGTH: "textLength" as DataValidationType.TEXT_LENGTH,
  DATE: "date" as DataValidationType.DATE,
  TIME: "time" as DataValidationType.TIME,
  WHOLE: "whole" as DataValidationType.WHOLE,
  DECIMAL: "decimal" as DataValidationType.DECIMAL,
  CHECKBOX: "checkbox" as DataValidationType.CHECKBOX,
  ANY: "any" as DataValidationType.ANY,
} as const;

export const DV_OPERATOR = {
  BETWEEN: "between" as DataValidationOperator.BETWEEN,
  EQUAL: "equal" as DataValidationOperator.EQUAL,
  GREATER_THAN: "greaterThan" as DataValidationOperator.GREATER_THAN,
  GREATER_THAN_OR_EQUAL: "greaterThanOrEqual" as DataValidationOperator.GREATER_THAN_OR_EQUAL,
  LESS_THAN: "lessThan" as DataValidationOperator.LESS_THAN,
  LESS_THAN_OR_EQUAL: "lessThanOrEqual" as DataValidationOperator.LESS_THAN_OR_EQUAL,
  NOT_BETWEEN: "notBetween" as DataValidationOperator.NOT_BETWEEN,
  NOT_EQUAL: "notEqual" as DataValidationOperator.NOT_EQUAL,
} as const;

export const DV_ERROR_STYLE = {
  INFO: 0 as DataValidationErrorStyle.INFO,
  STOP: 1 as DataValidationErrorStyle.STOP,
  WARNING: 2 as DataValidationErrorStyle.WARNING,
} as const;

export const CF_RULE_TYPE = {
  highlightCell: "highlightCell" as CFRuleType.highlightCell,
  dataBar: "dataBar" as CFRuleType.dataBar,
  colorScale: "colorScale" as CFRuleType.colorScale,
  iconSet: "iconSet" as CFRuleType.iconSet,
} as const;

export const CF_SUB_TYPE = {
  uniqueValues: "uniqueValues" as CFSubRuleType.uniqueValues,
  duplicateValues: "duplicateValues" as CFSubRuleType.duplicateValues,
  rank: "rank" as CFSubRuleType.rank,
  text: "text" as CFSubRuleType.text,
  timePeriod: "timePeriod" as CFSubRuleType.timePeriod,
  number: "number" as CFSubRuleType.number,
  average: "average" as CFSubRuleType.average,
  formula: "formula" as CFSubRuleType.formula,
} as const;

export const CF_VALUE_TYPE = {
  num: "num" as CFValueType.num,
  min: "min" as CFValueType.min,
  max: "max" as CFValueType.max,
  percent: "percent" as CFValueType.percent,
  percentile: "percentile" as CFValueType.percentile,
  formula: "formula" as CFValueType.formula,
} as const;

export const CF_NUMBER_OP = {
  greaterThan: "greaterThan" as CFNumberOperator.greaterThan,
  greaterThanOrEqual: "greaterThanOrEqual" as CFNumberOperator.greaterThanOrEqual,
  lessThan: "lessThan" as CFNumberOperator.lessThan,
  lessThanOrEqual: "lessThanOrEqual" as CFNumberOperator.lessThanOrEqual,
  notBetween: "notBetween" as CFNumberOperator.notBetween,
  between: "between" as CFNumberOperator.between,
  equal: "equal" as CFNumberOperator.equal,
  notEqual: "notEqual" as CFNumberOperator.notEqual,
} as const;

export const CF_TEXT_OP = {
  beginsWith: "beginsWith" as CFTextOperator.beginsWith,
  endsWith: "endsWith" as CFTextOperator.endsWith,
  containsText: "containsText" as CFTextOperator.containsText,
  notContainsText: "notContainsText" as CFTextOperator.notContainsText,
  equal: "equal" as CFTextOperator.equal,
  notEqual: "notEqual" as CFTextOperator.notEqual,
  containsBlanks: "containsBlanks" as CFTextOperator.containsBlanks,
  notContainsBlanks: "notContainsBlanks" as CFTextOperator.notContainsBlanks,
  containsErrors: "containsErrors" as CFTextOperator.containsErrors,
  notContainsErrors: "notContainsErrors" as CFTextOperator.notContainsErrors,
} as const;

export const CF_TIME_OP = {
  today: "today" as CFTimePeriodOperator.today,
  yesterday: "yesterday" as CFTimePeriodOperator.yesterday,
  tomorrow: "tomorrow" as CFTimePeriodOperator.tomorrow,
  last7Days: "last7Days" as CFTimePeriodOperator.last7Days,
  thisMonth: "thisMonth" as CFTimePeriodOperator.thisMonth,
  lastMonth: "lastMonth" as CFTimePeriodOperator.lastMonth,
  nextMonth: "nextMonth" as CFTimePeriodOperator.nextMonth,
  thisWeek: "thisWeek" as CFTimePeriodOperator.thisWeek,
  lastWeek: "lastWeek" as CFTimePeriodOperator.lastWeek,
  nextWeek: "nextWeek" as CFTimePeriodOperator.nextWeek,
} as const;

/** CustomRangeType.HYPERLINK: a rich-text range whose `properties.url` is a link. */
export const CUSTOM_RANGE_HYPERLINK = 0 as CustomRangeType.HYPERLINK;

/** ImageSourceType (`source` of drawings and background images). */
export const IMAGE_SOURCE_TYPE = {
  URL: "URL" as ImageSourceType.URL,
  UUID: "UUID" as ImageSourceType.UUID,
  BASE64: "BASE64" as ImageSourceType.BASE64,
} as const;

/** `IWorkbookData.resources[].name` of the plugins the presets load (registerPluginResource pluginName). */
export const RESOURCE = {
  CONDITIONAL_FORMATTING: "SHEET_CONDITIONAL_FORMATTING_PLUGIN",
  DATA_VALIDATION: "SHEET_DATA_VALIDATION_PLUGIN",
  DEFINED_NAME: "SHEET_DEFINED_NAME_PLUGIN",
  DRAWING: "SHEET_DRAWING_PLUGIN",
  FILTER: "SHEET_FILTER_PLUGIN",
  HYPER_LINK: "SHEET_HYPER_LINK_PLUGIN",
  NOTE: "SHEET_NOTE_PLUGIN",
  RANGE_THEME: "SHEET_RANGE_THEME_MODEL_PLUGIN",
  RANGE_PROTECTION: "SHEET_RANGE_PROTECTION_PLUGIN",
  WORKSHEET_PROTECTION: "SHEET_WORKSHEET_PROTECTION_PLUGIN",
  WORKSHEET_PROTECTION_POINT: "SHEET_WORKSHEET_PROTECTION_POINT_PLUGIN",
} as const;

/** The protection resources: their UI is hidden and the lease is the access model, so they are stripped on load. */
export const PROTECTION_RESOURCES: readonly string[] = [
  RESOURCE.RANGE_PROTECTION,
  RESOURCE.WORKSHEET_PROTECTION,
  RESOURCE.WORKSHEET_PROTECTION_POINT,
];
