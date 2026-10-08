// Slides: Y.Doc layout names, transaction origins, sizes and caps (slides.md §2.1, §2.4).
//
// A deck is a Y.Doc with three top-level maps. None of the names collide with the ones Docs reserves
// ("default", "__merchiva_meta", "__merchiva_page", "hf:<zone>:<variant>"), so the Docs sync stack carries a deck
// unchanged.

/** Bumped whenever a new text node/mark or element shape is added; older clients then open the deck read-only. */
export const SLIDES_SCHEMA_VERSION = 1;

/** Y.Map<DeckKey, JSON scalar/object>: schemaVersion, size, theme, source. */
export const SLIDES_DECK_MAP = "slides:deck";
/** Y.Map<slideId, Y.Map<SlideKey, …>>. */
export const SLIDES_SLIDES_MAP = "slides:slides";
/** Y.Map<masterId, Y.Map<MasterKey, …>>: imported layout/master decor, deduped by content hash. */
export const SLIDES_MASTERS_MAP = "slides:masters";

/** Transaction origin for every Slides write (tracked by the deck UndoManager, pushed by the provider). */
export const SLIDES_ORIGIN: unique symbol = Symbol("merchiva-slides");
/** Origin for writes that must NOT enter undo history (repairs, import seeding into a live doc). */
export const SLIDES_SILENT_ORIGIN: unique symbol = Symbol("merchiva-slides-silent");

/** 16:9 in pt (13.333in × 7.5in). */
export const DEFAULT_SLIDE_SIZE = { w: 960, h: 540 } as const;
export const SLIDE_SIZE_PRESETS = {
  "16:9": { w: 960, h: 540 },
  "4:3": { w: 720, h: 540 },
  "16:10": { w: 960, h: 600 },
} as const;

export const SLIDES_MAX_SLIDES = 500;
export const SLIDES_MAX_ELEMENTS_PER_SLIDE = 400;
/**
 * Read ceilings: readers return at most this many slides per deck and elements per slide or master (the first by
 * order). Twice the write caps, which concurrent adds can overshoot by a few, so real content is never hidden; only
 * a doc written around the ops is cut short.
 */
export const SLIDES_READ_MAX_SLIDES = SLIDES_MAX_SLIDES * 2;
export const SLIDES_READ_MAX_ELEMENTS = SLIDES_MAX_ELEMENTS_PER_SLIDE * 2;
/** Per text fragment. */
export const SLIDES_MAX_TEXT_CHARS = 20_000;
/** Per text fragment: blocks, list items, hard breaks and text runs, so empty structure can't grow without bound. */
export const SLIDES_MAX_TEXT_NODES = 20_000;
/**
 * Text nesting ceiling. Slide text needs about 18 levels (doc > 8 nested lists > listItem > paragraph); anything
 * deeper is flattened to its plain text instead of being walked recursively (it would overflow the stack).
 */
export const SLIDES_MAX_TEXT_DEPTH = 64;
/** Per custom geometry path. */
export const SLIDES_MAX_PATH_CHARS = 20_000;
/** |x|, |y|, w, h clamp (pt). */
export const SLIDES_COORD_LIMIT = 20_000;
/** Table caps: an imported or inserted table never grows past these. */
export const SLIDES_MAX_TABLE_ROWS = 100;
export const SLIDES_MAX_TABLE_COLS = 40;

/**
 * Slide, element, master, row and column ids. They are Y map keys any editor can write and they reach DOM ids and
 * `url(#…)` references, so every reader skips a key that fails this ("theme" and "" are masterId values, not keys).
 */
export const SLIDES_ID_RE = /^[0-9A-Za-z_]{1,40}$/;
