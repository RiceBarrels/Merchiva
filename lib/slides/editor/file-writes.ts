// The Slides editor's writes on the deck's own row (slides.md §7.2): rename, move to trash, restore and star, and
// which file commands the chrome offers. No React.
//
// Rename, trash and restore go through the Drive reducers, which name the actor like the Drive list does
// (components/drive/actions/drive-writes.ts): on /store the tablet ACCOUNT is the sender and the PIN operator is
// `actingMemberId`, so the module grants the lower of both members' roles and records the operator as the editor or
// the one who trashed it. The plain Docs reducers (renameDocument, trashDocument, restoreDocument) check and
// attribute the sender only, which there is the tablet account. Elsewhere `actingMemberId` is '' and the Drive
// reducers decide exactly as the Docs ones do (docRoleFor of the sender).
//
// Three commands have no acting-aware reducer and are not offered while acting: a document star belongs to the
// signed-in account (the tablet's, not the operator's), a copy would be owned by the tablet account, and the share
// dialog grants and changes visibility as the tablet account. The Drive lite app never offers them either
// (components/drive/model/actions.ts MANAGER_ONLY).
import type { DocumentMeta } from "@/lib/docs/types";
import { toggleDocumentStar } from "@/lib/spacetimedb/actions";
import { renameDriveDocument, restoreDriveEntries, trashDriveEntries } from "@/lib/spacetimedb/actions/drive";

/** Who writes: the PIN operator on /store (`actingMemberId`), '' on /manager and /personal. */
export interface SlidesFileActor {
  actingMemberId: string;
}

type DeckRow = Pick<DocumentMeta, "id" | "organizationId">;

function acting(actor: SlidesFileActor): string {
  return String(actor.actingMemberId ?? "").trim();
}

function entriesOf(doc: DeckRow, actor: SlidesFileActor) {
  return { documentIds: [doc.id], actingMemberId: acting(actor), organizationId: doc.organizationId };
}

/** Renames the deck for the actor (renameDriveDocument: acting, both members need edit access). */
export function renameDeck(doc: DeckRow, title: string, actor: SlidesFileActor): Promise<void> {
  return renameDriveDocument(doc.id, title, { actingMemberId: acting(actor), organizationId: doc.organizationId });
}

/** Moves the deck to the trash for the actor (trashDriveEntries: manager access for both members when acting). */
export function trashDeck(doc: DeckRow, actor: SlidesFileActor): Promise<void> {
  return trashDriveEntries(entriesOf(doc, actor));
}

/** Restores the deck from the trash for the actor (restoreDriveEntries). */
export function restoreDeck(doc: DeckRow, actor: SlidesFileActor): Promise<void> {
  return restoreDriveEntries(entriesOf(doc, actor));
}

/**
 * Stars or unstars the deck for the signed-in account. A no-op while acting (the star would be the tablet account's)
 * and for a trashed deck (toggleDocumentStar rejects it with `[doc.trashed]`).
 */
export async function toggleDeckStar(doc: DeckRow & Pick<DocumentMeta, "trashedAt">, actor: SlidesFileActor): Promise<void> {
  if (doc.trashedAt || acting(actor) !== "") return;
  await toggleDocumentStar(doc.id);
}

/** The file commands that have no acting-aware reducer: offered only when nobody acts for another member. */
export interface SlidesFileCommands {
  share: boolean;
  makeCopy: boolean;
  star: boolean;
}

export function slidesFileCommands(actor: SlidesFileActor): SlidesFileCommands {
  const self = acting(actor) === "";
  return { share: self, makeCopy: self, star: self };
}
