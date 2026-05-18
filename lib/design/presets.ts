export interface DesignPreset {
  id: string;
  labelKey: string;       // i18n key under `design.preset.*`
  category: "social" | "print" | "signage";
  width: number;
  height: number;
}

export const DESIGN_PRESETS: DesignPreset[] = [
  // Social
  { id: "instagram-square", labelKey: "instagramSquare", category: "social", width: 1080, height: 1080 },
  { id: "instagram-story",  labelKey: "instagramStory",  category: "social", width: 1080, height: 1920 },
  { id: "facebook-post",    labelKey: "facebookPost",    category: "social", width: 1200, height: 630  },
  // Print posters (px @ 96dpi for paper sizes)
  { id: "a4-portrait",      labelKey: "a4Portrait",      category: "print",  width: 794,  height: 1123 },
  { id: "a4-landscape",     labelKey: "a4Landscape",     category: "print",  width: 1123, height: 794  },
  { id: "us-letter",        labelKey: "usLetter",        category: "print",  width: 816,  height: 1056 },
  { id: "a3-portrait",      labelKey: "a3Portrait",      category: "print",  width: 1123, height: 1587 },
  { id: "poster-18x24",     labelKey: "poster18x24",     category: "print",  width: 1728, height: 2304 },
  // Receipt / in-store signage
  { id: "receipt-strip",    labelKey: "receiptStrip",    category: "signage", width: 288,  height: 800  },
  { id: "store-display",    labelKey: "storeDisplay",    category: "signage", width: 1080, height: 1920 },
  { id: "table-tent",       labelKey: "tableTent",       category: "signage", width: 1200, height: 1800 },
];

export function findPreset(id: string | null | undefined): DesignPreset | null {
  if (!id) return null;
  return DESIGN_PRESETS.find((p) => p.id === id) ?? null;
}
