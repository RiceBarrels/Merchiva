// Plugin store logic with no React: categories, the featured row and search.
// The store itself is /manager/apps (components/device/plugin-store); install
// state stays org-wide on settings.deviceApps (lib/device-apps.ts).

export const PLUGIN_CATEGORIES = ["team", "operations", "sales", "files", "essentials"] as const;
export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number];

const CATEGORY_BY_ID: Readonly<Record<string, PluginCategory>> = {
  "punch-in": "team",
  requests: "team",
  directory: "team",
  schedule: "team",
  tasks: "team",
  training: "team",
  pay: "team",
  channel: "team",
  personnel: "team",
  inventory: "operations",
  products: "operations",
  bookings: "operations",
  forms: "operations",
  sales: "sales",
  dashboard: "sales",
  docs: "files",
  drive: "files",
  sheets: "files",
  slides: "files",
  settings: "essentials",
  merchiva: "essentials",
  bugs: "essentials",
  "settings-org": "essentials",
};

/** The store category of a plugin id; unknown ids land in "essentials". */
export function pluginCategory(id: string): PluginCategory {
  return CATEGORY_BY_ID[id] ?? "essentials";
}

/** Shown in the featured row, in this order, when they are optional plugins. */
export const FEATURED_PLUGINS: readonly string[] = ["sheets", "tasks", "sales", "docs"];

/**
 * Case- and accent-insensitive form for matching in every locale: NFKC folds
 * full-width forms, the lowercase is locale-free, and combining marks are
 * dropped on both sides so "categorie" finds "catégorie".
 */
export function normalizeSearchText(text: string): string {
  return text.normalize("NFKC").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
}

export interface SearchablePlugin {
  id: string;
  /** Localized name. */
  name: string;
  /** Localized description. */
  description: string;
  /** Localized category label. */
  categoryLabel: string;
}

/**
 * Plugins matching every word of `query`, best first: a name that starts with
 * the query, then a name containing it, then category, then description
 * matches. Ties keep the input order. An empty query returns the input as is.
 */
export function searchPlugins<T extends SearchablePlugin>(plugins: readonly T[], query: string): T[] {
  const q = normalizeSearchText(query);
  if (!q) return [...plugins];
  const terms = q.split(" ");
  const scored: Array<{ plugin: T; score: number; index: number }> = [];
  plugins.forEach((plugin, index) => {
    const name = normalizeSearchText(plugin.name);
    const category = normalizeSearchText(plugin.categoryLabel);
    const description = normalizeSearchText(plugin.description);
    const haystack = `${name} ${category} ${description}`;
    if (!terms.every((term) => haystack.includes(term))) return;
    const score = name.startsWith(q) ? 0 : name.includes(q) ? 1 : category.includes(q) ? 2 : 3;
    scored.push({ plugin, score, index });
  });
  scored.sort((a, b) => a.score - b.score || a.index - b.index);
  return scored.map((s) => s.plugin);
}
