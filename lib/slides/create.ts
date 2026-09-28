// New decks (slides.md §7.2, §12.2): Drive's New ▸ Slides and the editor's File ▸ New. A deck is born with its
// whole content: one "title" slide with empty placeholders, built headlessly into a Y state, serialized for the
// snapshot row and the excerpt, and created through createDriveDocument, never the Docs createDocument wrapper
// (whose org_edit default would publish a deck meant for My files). The server derives the visibility from the
// space (My files → private, Store → org_edit) and the owner from the container or the acting member, so on the
// store tablet the PIN operator owns the deck, not the tablet account.
import * as Y from "yjs";

import type { DocumentMeta } from "@/lib/docs/types";
import type { DriveDocTarget } from "@/lib/drive/types";
import { createDriveDocument } from "@/lib/spacetimedb/actions/drive";
import { SLIDE_SIZE_PRESETS, SLIDES_SCHEMA_VERSION } from "@/lib/slides/constants";
import { buildDeckState } from "@/lib/slides/model/build";
import { newSlidesId, sequentialKeys } from "@/lib/slides/model/fractional-index";
import { newSlideSnapshot } from "@/lib/slides/model/ops-slides";
import type { DeckSnapshot, Pt, StarterThemeId } from "@/lib/slides/model/types";
import { serializeDeck } from "@/lib/slides/serialize";
import { DEFAULT_THEME_ID, STARTER_THEMES, isStarterThemeId } from "@/lib/slides/themes/themes";

/** = DOC_STATE_MAX_BYTES of the module (the largest initial state createDriveDocument accepts). */
export const SLIDES_STATE_MAX_BYTES = 8_388_608;

export interface CreateSlidesOptions { themeId?: StarterThemeId; size?: keyof typeof SLIDE_SIZE_PRESETS }

/** A new deck: `themeId`, slide `size`, one "title" slide with its (empty) placeholders. */
export function blankDeckSnapshot(themeId: StarterThemeId, size: { w: Pt; h: Pt }): DeckSnapshot {
  const theme = STARTER_THEMES[isStarterThemeId(themeId) ? themeId : DEFAULT_THEME_ID];
  const slideId = newSlidesId();
  return {
    meta: { schemaVersion: SLIDES_SCHEMA_VERSION, size: { w: size.w, h: size.h }, theme, source: null },
    masters: [],
    slides: [newSlideSnapshot(slideId, sequentialKeys(1)[0], "title", "theme", size)],
  };
}

/**
 * Creates a deck document holding `snapshot` in `target` and returns its id: buildDeckState, serializeDeck of that
 * state, createDriveDocument. Shared by createSlidesDocument and the .pptx import. Rejects with `[doc.too_large]`
 * before any request when the state is over the module's limit, or with the reducer's error.
 */
export async function createDeckDocument(
  snapshot: DeckSnapshot,
  target: DriveDocTarget,
  input: { templateId: string; title?: string },
): Promise<string> {
  const initialState = buildDeckState(snapshot);
  if (initialState.byteLength > SLIDES_STATE_MAX_BYTES) throw new Error("[doc.too_large] Presentation is too large");
  const scratch = new Y.Doc();
  let serialized: ReturnType<typeof serializeDeck>;
  try {
    Y.applyUpdate(scratch, initialState);
    serialized = serializeDeck(scratch);
  } finally {
    scratch.destroy();
  }
  return createDriveDocument({
    fileType: "slides",
    organizationId: target.organizationId,
    space: target.space,
    folderId: target.folderId,
    ownerMemberId: target.ownerMemberId,
    actingMemberId: target.actingMemberId,
    title: input.title ?? target.title ?? "",
    templateId: input.templateId,
    initialState,
    html: serialized.html,
    plainText: serialized.plainText,
    wordCount: serialized.wordCount,
  });
}

/** Drive's New ▸ Slides and the editor's File ▸ New: a blank deck in `target`; resolves to the new document id. */
export async function createSlidesDocument(target: DriveDocTarget, opts?: CreateSlidesOptions): Promise<string> {
  const themeId = opts?.themeId && isStarterThemeId(opts.themeId) ? opts.themeId : DEFAULT_THEME_ID;
  const size = SLIDE_SIZE_PRESETS[opts?.size ?? "16:9"] ?? SLIDE_SIZE_PRESETS["16:9"];
  return createDeckDocument(blankDeckSnapshot(themeId, size), target, { templateId: `slides:${themeId}` });
}

function sameMember(a: string, b: string | null): boolean {
  return b !== null && b !== "" && a.toLowerCase() === b.toLowerCase();
}

/**
 * Where File ▸ New and File ▸ Import put a new deck, seen from the open one: next to it when it is in the Store space
 * or in the actor's own My files; otherwise (an admin viewing someone else's private deck) at the root of the
 * actor's own My files, so nothing is created inside another member's folder. `actingMemberId` always passes
 * through, so on /store the server attributes the new deck to the PIN operator.
 */
export function targetForNewFromDeck(
  doc: Pick<DocumentMeta, "organizationId" | "visibility" | "folderId" | "ownerMemberId">,
  actor: { memberId: string | null; actingMemberId: string },
): DriveDocTarget {
  const base = { organizationId: doc.organizationId, actingMemberId: actor.actingMemberId };
  if (doc.visibility !== "private") return { ...base, space: "store", folderId: doc.folderId };
  if (sameMember(doc.ownerMemberId, actor.memberId)) return { ...base, space: "my", folderId: doc.folderId };
  return { ...base, space: "my", folderId: "" };
}
