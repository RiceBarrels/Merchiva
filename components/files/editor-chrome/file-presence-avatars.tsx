"use client";

/**
 * Collaborators in a Sheets or Slides file (slides spec §7.3); props-based twin of the Docs `PresenceAvatars`.
 * One avatar per member (several tabs collapse), excluding yourself, with a 2px ring in their presence colour.
 * With `onJump` each avatar is a button that takes you to that member (their slide, their selection); without it
 * the avatars only show who is here.
 */
import { useMemo } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DocPeer } from "@/lib/docs/sync-types";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";

const HEX_RE = /^#[0-9a-f]{6}$/i;
const FALLBACK_COLOR = "#57534e";

/** Other members only: drops yourself, peers without a member id, and every tab after a member's first. */
export function uniqueFilePeers(peers: readonly DocPeer[]): DocPeer[] {
  const seen = new Set<string>();
  const out: DocPeer[] = [];
  for (const peer of peers) {
    if (peer.isSelf || !peer.memberId || seen.has(peer.memberId)) continue;
    seen.add(peer.memberId);
    out.push(peer);
  }
  return out;
}

export interface FilePresenceAvatarsProps {
  peers: readonly DocPeer[];
  /** Avatars shown before the "+N" chip. */
  max: number;
  onJump?(memberId: string): void;
}

export function FilePresenceAvatars({ peers, max, onJump }: FilePresenceAvatarsProps) {
  const t = useT();
  const users = useMemo(() => uniqueFilePeers(peers), [peers]);
  if (users.length === 0) return null;

  const shown = users.slice(0, Math.max(0, Math.floor(max)));
  const extra = users.length - shown.length;
  const moreLabel = fmt(t("docs.presence.more"), { n: extra });

  return (
    <div role="group" aria-label={t("docs.presence.label")} className="flex items-center ps-1.5">
      {shown.map((user) => {
        const name = user.name || t("docs.presence.anonymous");
        const color = HEX_RE.test(user.color) ? user.color : FALLBACK_COLOR;
        const trigger = onJump ? (
          <button
            type="button"
            className="-ms-1.5 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            aria-label={fmt(t("docs.presence.jumpTo"), { name })}
            onClick={() => onJump(user.memberId)}
          />
        ) : (
          <span role="img" aria-label={name} className="-ms-1.5 inline-flex rounded-full" />
        );
        return (
          <Tooltip key={user.memberId}>
            <TooltipTrigger render={trigger}>
              <Avatar
                name={name}
                size="sm"
                aria-hidden
                style={{ outline: `2px solid ${color}`, outlineOffset: 1 }}
              />
            </TooltipTrigger>
            <TooltipContent side="bottom">{name}</TooltipContent>
          </Tooltip>
        );
      })}
      {extra > 0 && (
        <span
          className="-ms-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-border bg-muted px-1 font-mono text-[10px] tabular-nums text-muted-foreground"
          title={moreLabel}
        >
          <span aria-hidden>+{extra}</span>
          <span className="sr-only">{moreLabel}</span>
        </span>
      )}
    </div>
  );
}
