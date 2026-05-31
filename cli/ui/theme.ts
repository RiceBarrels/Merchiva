// Terminal palette mirroring the web app's Stone/Slate aesthetic.
// Sharp, low-chroma, data-dense — no neon, no gradients.

export const theme = {
  // Brand
  brand: "#a855f7", // merchiva purple (used sparingly, like the web logo)
  // Neutrals (Stone/Slate)
  fg: "#e7e5e4", // stone-200 — primary text
  muted: "#a8a29e", // stone-400 — secondary text
  dim: "#78716c", // stone-500 — labels / hints
  border: "#44403c", // stone-700 — separators
  panel: "#1c1917", // stone-900 — panel bg (where supported)
  // Accents
  accent: "#60a5fa", // blue-400 — active/selected
  good: "#34d399", // emerald-400 — positive / in-stock
  warn: "#fbbf24", // amber-400 — low-stock / attention
  bad: "#f87171", // red-400 — out-of-stock / errors
} as const;

// Status → color, matching the web's badge semantics.
export function stockColor(status: string): string {
  switch (status) {
    case "out_of_stock":
      return theme.bad;
    case "low_stock":
      return theme.warn;
    case "in_stock":
      return theme.good;
    default:
      return theme.muted;
  }
}

// Currency formatting — terminals can't do Intl reliably across locales for
// width, so keep it simple and right-alignable.
export function money(n: number, currency = "$"): string {
  if (!Number.isFinite(n)) return `${currency}0.00`;
  return `${currency}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pad(s: string, width: number, align: "left" | "right" = "left"): string {
  const str = s ?? "";
  if (str.length >= width) return str.slice(0, width);
  const gap = " ".repeat(width - str.length);
  return align === "left" ? str + gap : gap + str;
}
