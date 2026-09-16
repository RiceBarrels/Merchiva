"use client";

/**
 * Collaborators in this document (docs-editor-ui spec §4.5): one avatar per member (several tabs collapse),
 * excluding yourself, with a 2px ring in their caret colour (lead decision Q3). Clicking scrolls to their caret.
 */
import { useMemo } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { DocPeer } from "@/lib/docs/sync-types";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useDocEditor } from "./doc-editor-context";

const HEX_RE = /^#[0-9a-f]{6}$/i;

export function uniquePeers(peers: readonly DocPeer[]): DocPeer[] {
  const seen = new Set<string>();
  const out: DocPeer[] = [];
  for (const peer of peers) {
    if (peer.isSelf || !peer.memberId || seen.has(peer.memberId)) continue;
    seen.add(peer.memberId);
    out.push(peer);
  }
  return out;
}

export function scrollToCaret(memberId: string): void {
  const selector = `.collaboration-carets__caret[data-member-id="${CSS.escape(memberId)}"]`;
  document.querySelector(selector)?.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function PresenceAvatars({ max }: { max: number }) {
  const t = useT();
  const { collab } = useDocEditor();
  const users = useMemo(() => uniquePeers(collab.peers), [collab.peers]);
  if (users.length === 0) return null;

  const shown = users.slice(0, max);
  const extra = users.length - shown.length;

  return (
    <div role="group" aria-label={t("docs.presence.label")} className="flex items-center ps-1.5">
      {shown.map((user) => {
        const name = user.name || t("docs.presence.anonymous");
        const color = HEX_RE.test(user.color) ? user.color : "#57534e";
        return (
          <Tooltip key={user.memberId}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className="-ms-1.5 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label={fmt(t("docs.presence.jumpTo"), { name })}
                  onClick={() => scrollToCaret(user.memberId)}
                />
              }
            >
              <Avatar name={name} size="sm" style={{ outline: `2px solid ${color}`, outlineOffset: 1 }} />
            </TooltipTrigger>
            <TooltipContent side="bottom">{name}</TooltipContent>
          </Tooltip>
        );
      })}
      {extra > 0 && (
        <span
          className="-ms-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-border bg-muted px-1 font-mono text-[10px] tabular-nums text-muted-foreground"
          title={fmt(t("docs.presence.more"), { n: extra })}
        >
          +{extra}
          <span className="sr-only">{fmt(t("docs.presence.more"), { n: extra })}</span>
        </span>
      )}
    </div>
  );
}
