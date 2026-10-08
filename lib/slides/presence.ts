// Slides presence over the provider's awareness (slides.md §4.7): which slide each person is on, what they have
// selected and what they are typing in. The provider mirrors awareness into document_presence and the server
// rewrites only `user`, so this field reaches every peer as written by that peer's client: untrusted. It is read
// back through a validator (ids must pass SLIDES_ID_RE, selections are capped), and anything else is dropped.
import type { Awareness } from "y-protocols/awareness";

import { SLIDES_ID_RE } from "@/lib/slides/constants";
import { asRecord } from "@/lib/slides/model/sanitize-parts";
import { cleanLabel, safeHex } from "@/lib/slides/model/safe-values";

/** `edit` is an element id, or `${tableId}/${rowId}:${colId}` for a table cell. */
export interface SlidesAwareness { v: 1; slideId: string | null; sel: readonly string[]; edit: string | null }
export const SLIDES_AWARENESS_FIELD = "slides";
/** Selections longer than this are cut (a peer outline per element is drawn). */
export const SLIDES_AWARENESS_MAX_SEL = 50;

export interface PeerSlides extends SlidesAwareness { yClientId: number; memberId: string; name: string; color: string }

const EDIT_RE = /^[0-9A-Za-z_]{1,40}(?:\/[0-9A-Za-z_]{1,40}:[0-9A-Za-z_]{1,40})?$/;
const MEMBER_ID_RE = /^[0-9A-Za-z_-]{1,64}$/;
/** Peer colour when the peer sent none we accept (neutral gray). */
const FALLBACK_COLOR = "#6b7280";

/** A clean SlidesAwareness, or null when `raw` is not one (wrong version or shape). */
export function sanitizeSlidesAwareness(raw: unknown): SlidesAwareness | null {
  const r = asRecord(raw);
  if (!r || r.v !== 1) return null;
  const id = (value: unknown) => (typeof value === "string" && SLIDES_ID_RE.test(value) ? value : null);
  const sel = Array.isArray(r.sel) ? r.sel.flatMap((value) => id(value) ?? []).slice(0, SLIDES_AWARENESS_MAX_SEL) : [];
  return {
    v: 1,
    slideId: id(r.slideId),
    sel: [...new Set(sel)],
    edit: typeof r.edit === "string" && EDIT_RE.test(r.edit) ? r.edit : null,
  };
}

function same(a: SlidesAwareness, b: SlidesAwareness): boolean {
  return a.slideId === b.slideId && a.edit === b.edit && a.sel.length === b.sel.length && a.sel.every((id, i) => id === b.sel[i]);
}

/** Publishes the local slides state (validated); a no-op when it equals the current one or presence is off. */
export function setLocalSlidesAwareness(awareness: Awareness, s: SlidesAwareness): void {
  const local = asRecord(awareness.getLocalState());
  if (!local) return; // presence inactive (idle cached session): nothing to announce
  const next = sanitizeSlidesAwareness(s) ?? { v: 1, slideId: null, sel: [], edit: null };
  const current = sanitizeSlidesAwareness(local[SLIDES_AWARENESS_FIELD]);
  if (current && same(current, next)) return;
  awareness.setLocalStateField(SLIDES_AWARENESS_FIELD, next);
}

/** Everyone else's slides state with who they are, sorted by client id; peers without a valid state are left out. */
export function readPeerSlides(awareness: Awareness, selfClientId: number): PeerSlides[] {
  const out: PeerSlides[] = [];
  awareness.getStates().forEach((state: unknown, yClientId: number) => {
    if (yClientId === selfClientId) return;
    const record = asRecord(state);
    const slides = sanitizeSlidesAwareness(record?.[SLIDES_AWARENESS_FIELD]);
    const user = asRecord(record?.user);
    if (!slides || !user) return;
    out.push({
      ...slides,
      yClientId,
      memberId: typeof user.memberId === "string" && MEMBER_ID_RE.test(user.memberId) ? user.memberId : "",
      name: cleanLabel(user.name, 100),
      color: safeHex(user.color) ?? FALLBACK_COLOR,
    });
  });
  return out.sort((a, b) => a.yClientId - b.yClientId);
}
