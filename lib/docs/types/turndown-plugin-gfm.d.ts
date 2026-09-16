// Ambient types for turndown-plugin-gfm@1.0.2, which ships no declarations.
// Each export is a Turndown plugin: a function that registers rules on a service.
declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";

  type TurndownPlugin = (service: TurndownService) => void;

  /** All GFM plugins: highlightedCodeBlock, strikethrough, tables, taskListItems. */
  export const gfm: TurndownPlugin;
  export const highlightedCodeBlock: TurndownPlugin;
  export const strikethrough: TurndownPlugin;
  /** Converts tables whose first row is a heading row; keeps other tables as HTML. */
  export const tables: TurndownPlugin;
  export const taskListItems: TurndownPlugin;
}
