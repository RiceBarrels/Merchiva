// Who is where in a deck (slides.md §4.7): the other people's slides awareness, grouped for the UI. The rail puts a
// dot on each slide someone is on; the stage outlines each element someone has selected or is typing in (a table
// cell's editor `${tableId}/${cellKey}` counts for the table). Pure: use-slides-presence.ts feeds it.
import type { PeerSlides } from "@/lib/slides/presence";

export interface SlidesPeersState {
  /** Everyone else with a valid slides state, sorted by client id. */
  list: readonly PeerSlides[];
  /** slideId → the peers on it. */
  bySlide: ReadonlyMap<string, readonly PeerSlides[]>;
  /** elementId → the peers that selected it or edit it (a peer appears once per element). */
  byElement: ReadonlyMap<string, readonly PeerSlides[]>;
}

export const NO_SLIDES_PEERS: SlidesPeersState = Object.freeze({
  list: Object.freeze([]) as readonly PeerSlides[],
  bySlide: new Map(),
  byElement: new Map(),
});

/** The element an `edit` value names: an element id, or the table of `${tableId}/${cellKey}`. */
export function editedElementId(edit: string | null): string | null {
  if (!edit) return null;
  const slash = edit.indexOf("/");
  return slash < 0 ? edit : edit.slice(0, slash);
}

function push(map: Map<string, PeerSlides[]>, key: string, peer: PeerSlides): void {
  const list = map.get(key);
  if (!list) map.set(key, [peer]);
  else if (!list.includes(peer)) list.push(peer);
}

export function groupPeers(list: readonly PeerSlides[]): SlidesPeersState {
  if (list.length === 0) return NO_SLIDES_PEERS;
  const bySlide = new Map<string, PeerSlides[]>();
  const byElement = new Map<string, PeerSlides[]>();
  for (const peer of list) {
    if (peer.slideId === null) continue;
    push(bySlide, peer.slideId, peer);
    const edited = editedElementId(peer.edit);
    if (edited) push(byElement, edited, peer);
    for (const id of peer.sel) push(byElement, id, peer);
  }
  return { list, bySlide, byElement };
}

function samePeer(a: PeerSlides, b: PeerSlides): boolean {
  return (
    a.yClientId === b.yClientId &&
    a.memberId === b.memberId &&
    a.name === b.name &&
    a.color === b.color &&
    a.slideId === b.slideId &&
    a.edit === b.edit &&
    a.sel.length === b.sel.length &&
    a.sel.every((id, i) => id === b.sel[i])
  );
}

/** True when two peer lists show the same thing (so a new awareness event can keep the old state object). */
export function samePeerLists(a: readonly PeerSlides[], b: readonly PeerSlides[]): boolean {
  return a.length === b.length && a.every((peer, i) => samePeer(peer, b[i]));
}
