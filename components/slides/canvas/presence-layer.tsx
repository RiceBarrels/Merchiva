"use client";

// Other people on this slide (slides.md §4.7): a coloured outline around each element someone has selected or is
// typing in, with that person's name (or "{name} is editing") on a tag above it. Drawn over the stage in screen px
// (pt × scale) so the lines stay 2 px at any zoom; it never takes pointer events. Names and colours come from the
// validated awareness (readPeerSlides), and colours only ever reach an inline style as a checked #rrggbb.
import type { CSSProperties } from "react";

import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { editedElementId, type SlidesPeersState } from "@/lib/slides/editor/peers";
import { elementBounds } from "@/lib/slides/geometry/arrange";
import type { SlideSnapshot } from "@/lib/slides/model/types";

export interface PresenceLayerProps {
  slide: SlideSnapshot;
  peers: SlidesPeersState;
  scale: number;
}

export function PresenceLayer({ slide, peers, scale }: PresenceLayerProps) {
  const t = useT();
  if (peers.byElement.size === 0) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {slide.elements.map((el) => {
        const here = (peers.byElement.get(el.id) ?? []).filter((peer) => peer.slideId === slide.id);
        if (here.length === 0) return null;
        const first = here[0];
        const editing = editedElementId(first.edit) === el.id;
        const box = el.type === "line" ? elementBounds(el) : el;
        const rot = el.type === "line" ? 0 : el.rot;
        const outline: CSSProperties = {
          position: "absolute",
          left: box.x * scale - 2,
          top: box.y * scale - 2,
          width: Math.max(1, box.w * scale) + 4,
          height: Math.max(1, box.h * scale) + 4,
          border: `2px solid ${first.color}`,
          transform: rot ? `rotate(${rot}deg)` : undefined,
        };
        const bounds = elementBounds(el);
        const tag: CSSProperties = {
          position: "absolute",
          left: bounds.x * scale - 2,
          top: bounds.y * scale - 2,
          transform: "translateY(-100%)",
          backgroundColor: first.color,
        };
        // A peer without a name still gets the outline, just no tag.
        const label = first.name === "" ? "" : editing ? fmt(t("slides.presence.editing"), { name: first.name }) : first.name;
        return (
          <div key={el.id}>
            <div style={outline} />
            {label ? (
              <div style={tag} className="max-w-48 truncate px-1 text-[11px] leading-4 font-medium whitespace-nowrap text-white">
                {here.length > 1 ? `${label} +${here.length - 1}` : label}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
