// Render state of a deck (slides.md §4.4). The store observes the three top-level maps, collects what each Yjs
// transaction touched (a slide's scalar keys, its notes, single elements, a master, the deck meta) and, once per
// microtask, re-reads only that. Everything else keeps its object identity: an untouched slide, element or master
// is the same object in the next state, so memoized renderers skip it. Text is converted only for the elements
// whose own subtree changed.
//
// getSnapshot() never writes. The only writes a store makes are repairs, in a later microtask, after
// setCanRepair(true) on a store that is not read-only (a read-only provider drops local updates, so a repair there
// would diverge): duplicate or malformed order and z keys are re-keyed (deterministically, so concurrent repairs
// agree), and an empty deck gets one slide, once per store. Both use SLIDES_SILENT_ORIGIN (never undone).
import * as Y from "yjs";

import { SLIDES_ID_RE, SLIDES_READ_MAX_ELEMENTS, SLIDES_READ_MAX_SLIDES, SLIDES_SCHEMA_VERSION, SLIDES_SILENT_ORIGIN } from "@/lib/slides/constants";
import { compareKeyed, isOrderKey, repairDuplicateKeys } from "@/lib/slides/model/fractional-index";
import { keyedMaps, sameJson, seedFirstSlide } from "@/lib/slides/model/ops-slides";
import { deckMaps, readDeckMeta, readElement, readElements, readMaster } from "@/lib/slides/model/read";
import { sanitizeFill, sanitizeTransition } from "@/lib/slides/model/sanitize-parts";
import type { DeckMeta, MasterSnapshot, SlideElement, SlideSnapshot } from "@/lib/slides/model/types";
import { isLayoutKind } from "@/lib/slides/themes/layouts";
import { blankTextJson, fragmentToJson } from "@/lib/slides/text/fragment";

export interface DeckState {
  readonly meta: DeckMeta;
  /** Sorted by (order, id); at most SLIDES_READ_MAX_SLIDES. */
  readonly slideIds: readonly string[];
  /** A slide object is replaced only when it changed. */
  readonly slides: ReadonlyMap<string, SlideSnapshot>;
  readonly masters: ReadonlyMap<string, MasterSnapshot>;
  /** meta.schemaVersion > SLIDES_SCHEMA_VERSION: open read-only, never mount a text editor, never repair. */
  readonly schemaTooNew: boolean;
}

/** What changed in one slide since the last publish. */
interface SlideDirt { all: boolean; fields: boolean; notes: boolean; elements: Set<string> }

type DeckEvents = Array<Y.YEvent<Y.AbstractType<unknown>>>;

function changedKeys(event: Y.YEvent<Y.AbstractType<unknown>>): ReadonlySet<string> {
  return event instanceof Y.YMapEvent ? (event.keysChanged as Set<string>) : new Set<string>();
}

function readNotes(y: Y.Map<unknown>): SlideSnapshot["notes"] {
  const notes = y.get("notes");
  return notes instanceof Y.XmlFragment ? fragmentToJson(notes) : blankTextJson();
}

/** The scalar fields of a slide, read exactly as readSlide reads them. */
function readFields(id: string, y: Y.Map<unknown>): Omit<SlideSnapshot, "notes" | "elements"> {
  const order: unknown = y.get("order");
  const layout: unknown = y.get("layout");
  const masterId: unknown = y.get("masterId");
  const background: unknown = y.get("background");
  return {
    id,
    order: isOrderKey(order) ? order : "",
    layout: isLayoutKind(layout) ? layout : "blank",
    masterId: typeof masterId === "string" && (masterId === "" || SLIDES_ID_RE.test(masterId)) ? masterId : "",
    hidden: y.get("hidden") === true,
    background: background === null || background === undefined ? null : sanitizeFill(background),
    transition: sanitizeTransition(y.get("transition")),
  };
}

/** The elements of a slide re-read where dirty, the previous objects kept elsewhere (same cap as readElements). */
function patchElements(value: unknown, previous: readonly SlideElement[], dirty: ReadonlySet<string>): SlideElement[] {
  if (!(value instanceof Y.Map)) return [];
  const prevById = new Map(previous.map((el) => [el.id, el]));
  const out: SlideElement[] = [];
  for (const entry of keyedMaps(value, "z")) {
    if (out.length >= SLIDES_READ_MAX_ELEMENTS) break;
    const kept = dirty.has(entry.id) ? undefined : prevById.get(entry.id);
    const el = kept ?? readElement(entry.id, entry.y);
    if (el) out.push(el);
  }
  return out;
}

/** Duplicate or malformed ("") keys among `entries`. */
function needsRepair(entries: ReadonlyArray<{ key: string }>): boolean {
  const seen = new Set<string>();
  for (const { key } of entries) {
    if (key === "" || seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export class DeckStore {
  private readonly doc: Y.Doc;
  private readonly readOnly: boolean;
  private readonly maps: ReturnType<typeof deckMaps>;
  private readonly listeners = new Set<() => void>();
  /** Every slide under a valid id → its order key ("" when malformed); the visible window is the first N. */
  private readonly orderOf = new Map<string, string>();
  private readonly dirtySlides = new Map<string, SlideDirt>();
  private readonly dirtyMasters = new Set<string>();
  /** Slides whose element z keys the next repair pass checks. */
  private readonly zToCheck = new Set<string>();
  private state: DeckState;
  private metaDirty = false;
  private flushQueued = false;
  private repairQueued = false;
  private canRepair = false;
  private seeded = false;
  private destroyed = false;

  constructor(doc: Y.Doc, opts: { readOnly?: boolean } = {}) {
    this.doc = doc;
    this.readOnly = opts.readOnly === true;
    this.maps = deckMaps(doc);
    for (const entry of keyedMaps(this.maps.slides, "order")) this.orderOf.set(entry.id, entry.key);
    const masters = new Map<string, MasterSnapshot>();
    this.maps.masters.forEach((y, id) => {
      const master = readMaster(id, y);
      if (master) masters.set(id, master);
    });
    const slideIds = this.visibleIds();
    const slides = new Map<string, SlideSnapshot>();
    for (const id of slideIds) slides.set(id, this.readWholeSlide(id));
    const meta = readDeckMeta(this.maps.deck);
    this.state = { meta, slideIds, slides, masters, schemaTooNew: meta.schemaVersion > SLIDES_SCHEMA_VERSION };
    this.maps.deck.observeDeep(this.onDeck);
    this.maps.slides.observeDeep(this.onSlides);
    this.maps.masters.observeDeep(this.onMasters);
  }

  /** For useSyncExternalStore; the returned function unsubscribes. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** The current state. Pure: never writes to the Y.Doc. */
  readonly getSnapshot = (): DeckState => this.state;

  /** The session mirrors canEditNow here. Ignored by a read-only store, which never writes. */
  setCanRepair(canEditNow: boolean): void {
    this.canRepair = canEditNow && !this.readOnly && !this.destroyed;
    if (!this.canRepair) return;
    for (const id of this.orderOf.keys()) this.zToCheck.add(id);
    this.scheduleRepair();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.canRepair = false;
    this.maps.deck.unobserveDeep(this.onDeck);
    this.maps.slides.unobserveDeep(this.onSlides);
    this.maps.masters.unobserveDeep(this.onMasters);
    this.listeners.clear();
  }

  // ── events ────────────────────────────────────────────────────────────────────────────────────────────────────

  private dirt(id: string): SlideDirt {
    let d = this.dirtySlides.get(id);
    if (!d) {
      d = { all: false, fields: false, notes: false, elements: new Set() };
      this.dirtySlides.set(id, d);
    }
    return d;
  }

  private readonly onDeck = (): void => {
    this.metaDirty = true;
    this.scheduleFlush();
  };

  private readonly onMasters = (events: DeckEvents): void => {
    for (const event of events) {
      if (event.path.length === 0) for (const id of changedKeys(event)) this.dirtyMasters.add(id);
      else this.dirtyMasters.add(String(event.path[0]));
    }
    this.scheduleFlush();
  };

  private readonly onSlides = (events: DeckEvents): void => {
    for (const event of events) {
      const path = event.path;
      if (path.length === 0) {
        for (const id of changedKeys(event)) this.dirt(id).all = true; // slides added, deleted or replaced
        continue;
      }
      const d = this.dirt(String(path[0]));
      if (path.length === 1) {
        const keys = changedKeys(event);
        if (keys.has("elements") || keys.has("notes")) d.all = true;
        else d.fields = true;
      } else if (path[1] === "notes") d.notes = true;
      else if (path[1] === "elements") {
        if (path.length === 2) for (const id of changedKeys(event)) d.elements.add(id);
        else d.elements.add(String(path[2]));
      } else d.fields = true;
    }
    this.scheduleFlush();
  };

  // ── publishing ────────────────────────────────────────────────────────────────────────────────────────────────

  private scheduleFlush(): void {
    if (this.flushQueued || this.destroyed) return;
    this.flushQueued = true;
    queueMicrotask(this.flush);
  }

  private visibleIds(): string[] {
    return [...this.orderOf]
      .map(([id, key]) => ({ id, key }))
      .sort(compareKeyed)
      .slice(0, SLIDES_READ_MAX_SLIDES)
      .map((e) => e.id);
  }

  private slideMap(id: string): Y.Map<unknown> | null {
    const y = SLIDES_ID_RE.test(id) ? this.maps.slides.get(id) : undefined;
    return y instanceof Y.Map ? y : null;
  }

  private readWholeSlide(id: string): SlideSnapshot {
    const y = this.slideMap(id) as Y.Map<unknown>;
    return { ...readFields(id, y), notes: readNotes(y), elements: readElements(y.get("elements")) };
  }

  private readSlide(id: string, previous: SlideSnapshot | undefined, d: SlideDirt | undefined): SlideSnapshot {
    if (!previous) return this.readWholeSlide(id);
    if (!d) return previous;
    if (d.all) return this.readWholeSlide(id);
    const y = this.slideMap(id) as Y.Map<unknown>;
    const { notes, elements, ...fields } = previous;
    return {
      ...(d.fields ? readFields(id, y) : fields),
      notes: d.notes ? readNotes(y) : notes,
      elements: d.elements.size > 0 ? patchElements(y.get("elements"), elements, d.elements) : elements,
    };
  }

  private readonly flush = (): void => {
    this.flushQueued = false;
    if (this.destroyed) return;
    const prev = this.state;
    let meta = prev.meta;
    if (this.metaDirty) {
      this.metaDirty = false;
      const next = readDeckMeta(this.maps.deck);
      if (!sameJson(next, meta)) meta = next;
    }
    let masters = prev.masters;
    if (this.dirtyMasters.size > 0) {
      const next = new Map(prev.masters);
      for (const id of this.dirtyMasters) {
        const y = this.maps.masters.get(id);
        const master = y instanceof Y.Map ? readMaster(id, y) : null;
        if (master) next.set(id, master);
        else next.delete(id);
      }
      this.dirtyMasters.clear();
      masters = next;
    }
    let slides = prev.slides;
    let slideIds = prev.slideIds;
    if (this.dirtySlides.size > 0) {
      for (const id of this.dirtySlides.keys()) {
        const y = this.slideMap(id);
        if (y) {
          const order: unknown = y.get("order");
          this.orderOf.set(id, isOrderKey(order) ? order : "");
        } else this.orderOf.delete(id);
        this.zToCheck.add(id);
      }
      const ids = this.visibleIds();
      const next = new Map<string, SlideSnapshot>();
      for (const id of ids) next.set(id, this.readSlide(id, prev.slides.get(id), this.dirtySlides.get(id)));
      this.dirtySlides.clear();
      slides = next;
      if (ids.length !== slideIds.length || ids.some((id, i) => id !== slideIds[i])) slideIds = ids;
    }
    if (meta !== prev.meta || masters !== prev.masters || slides !== prev.slides || slideIds !== prev.slideIds) {
      this.state = { meta, slideIds, slides, masters, schemaTooNew: meta.schemaVersion > SLIDES_SCHEMA_VERSION };
      for (const listener of [...this.listeners]) listener();
    }
    this.scheduleRepair();
  };

  // ── repairs (write path) ──────────────────────────────────────────────────────────────────────────────────────

  private scheduleRepair(): void {
    if (!this.canRepair || this.repairQueued || this.destroyed) return;
    this.repairQueued = true;
    queueMicrotask(this.repair);
  }

  private readonly repair = (): void => {
    this.repairQueued = false;
    // Changes not yet published: the flush re-schedules this pass once orderOf is current.
    if (!this.canRepair || this.readOnly || this.destroyed || this.flushQueued || this.state.schemaTooNew) return;
    const orders = [...this.orderOf].map(([id, key]) => ({ id, key }));
    const slideFixes = needsRepair(orders) ? repairDuplicateKeys(orders) : [];
    const zFixes: Array<{ y: Y.Map<unknown>; id: string; key: string }> = [];
    for (const slideId of this.zToCheck) {
      const elements = this.slideMap(slideId)?.get("elements");
      if (!(elements instanceof Y.Map)) continue;
      const entries = keyedMaps(elements, "z");
      if (!needsRepair(entries)) continue;
      const byId = new Map(entries.map((e) => [e.id, e.y]));
      for (const fix of repairDuplicateKeys(entries)) {
        const y = byId.get(fix.id);
        if (y) zFixes.push({ y, id: fix.id, key: fix.key });
      }
    }
    this.zToCheck.clear();
    if (slideFixes.length > 0 || zFixes.length > 0) {
      this.doc.transact(() => {
        for (const fix of slideFixes) this.slideMap(fix.id)?.set("order", fix.key);
        for (const fix of zFixes) fix.y.set("z", fix.key);
      }, SLIDES_SILENT_ORIGIN);
    }
    if (!this.seeded && this.orderOf.size === 0) {
      this.seeded = true;
      seedFirstSlide(this.doc, this.state.meta);
    }
  };
}
