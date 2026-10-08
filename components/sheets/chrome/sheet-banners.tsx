"use client";

// The one banner that matters most right now (sheets.md §10.6), in this order: access lost > update required >
// trashed > load failed > reloading > lease lost > skipped changes > too large to save > log full > near the size
// limit > offline for more than 30 s. The save status next to the title already shows a short offline spell.

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { useSheetEditor } from "@/components/sheets/editor/sheet-editor-context";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import type { StatusTone } from "@/components/ui/status-badge";
import { DOC_ERROR_I18N_KEYS } from "@/lib/docs/errors";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";

const OFFLINE_BANNER_MS = 30_000;

export interface SheetLeaseLostNotice {
  byName: string;
  discardedOps: number;
}

interface Banner {
  key: string;
  tone: StatusTone;
  title?: string;
  text: string;
  action?: React.ReactNode;
}

/** True once the session has been offline for 30 s without a break. */
function useOfflineForLong(offline: boolean): boolean {
  const [episode, setEpisode] = useState(0);
  const [wasOffline, setWasOffline] = useState(offline);
  if (offline !== wasOffline) {
    setWasOffline(offline);
    if (offline) setEpisode((n) => n + 1);
  }
  const current = offline ? episode : null;
  const [expired, setExpired] = useState<number | null>(null);
  useEffect(() => {
    if (current === null) return;
    const timer = window.setTimeout(() => setExpired(current), OFFLINE_BANNER_MS);
    return () => window.clearTimeout(timer);
  }, [current]);
  return current !== null && expired === current;
}

export function SheetBanners({ leaseLost, onDismissLeaseLost }: { leaseLost: SheetLeaseLostNotice | null; onDismissLeaseLost(): void }) {
  const t = useT();
  const { doc, access, facade, actions, mobile } = useSheetEditor();
  const offlineLong = useOfflineForLong(facade.status === "offline");

  const small = (label: string, onClick: () => void) => (
    <Button type="button" size="xs" variant="outline" onClick={onClick}>
      {label}
    </Button>
  );

  const banners: Banner[] = [];
  if (facade.accessLost) {
    banners.push({ key: "access", tone: "danger", title: t("sheets.editor.accessLost"), text: t(DOC_ERROR_I18N_KEYS[facade.accessLost]) });
  }
  if (facade.updateRequired) {
    banners.push({ key: "update", tone: "warning", text: t("sheets.editor.updateRequired"), action: small(t("sheets.editor.reload"), () => window.location.reload()) });
  }
  if (doc.trashedAt) {
    banners.push({
      key: "trashed",
      tone: "warning",
      text: t("sheets.editor.trashed"),
      action: access.canManage ? small(t("sheets.editor.restore"), () => void actions.restoreFromTrash()) : undefined,
    });
  }
  if (facade.loadState === "load_failed") {
    banners.push({
      key: "load",
      tone: "danger",
      title: t("sheets.editor.loadFailedTitle"),
      text: t("sheets.editor.loadFailedDescription"),
      action: (
        <div className="flex flex-wrap gap-1.5">
          {small(t("sheets.editor.retry"), () => void actions.reload())}
          {access.canEdit && small(t("sheets.editor.restoreEarlier"), actions.showVersionHistory)}
        </div>
      ),
    });
  }
  if (facade.reloading) banners.push({ key: "reloading", tone: "info", text: t("sheets.editor.reloading") });
  if (leaseLost) {
    banners.push({
      key: "lost",
      tone: "warning",
      text: fmt(t(leaseLost.discardedOps > 0 ? "sheets.lease.lostUnsaved" : "sheets.lease.lost"), { name: leaseLost.byName }),
      action: (
        <Button type="button" size="icon-xs" variant="ghost" aria-label={t("common.close")} onClick={onDismissLeaseLost}>
          <X />
        </Button>
      ),
    });
  }
  if (facade.diverged) {
    banners.push({ key: "diverged", tone: "warning", text: t("sheets.editor.skippedChanges"), action: small(t("sheets.editor.reload"), () => void actions.reload()) });
  }
  if (facade.sizeWarning === "too_large") {
    banners.push({ key: "tooLarge", tone: "danger", text: t("sheets.size.tooLarge"), action: small(t("sheets.size.discard"), () => void actions.discardChanges()) });
  } else if (facade.sizeWarning === "log_full") {
    banners.push({ key: "logFull", tone: "warning", text: t("sheets.size.logFull") });
  } else if (facade.sizeWarning === "near_limit") {
    banners.push({ key: "nearLimit", tone: "neutral", text: t("sheets.size.nearLimit") });
  }
  if (offlineLong) banners.push({ key: "offline", tone: "warning", text: t("sheets.errors.offline") });

  const top = banners[0];
  if (!top) return null;
  return (
    <div className={cn("shrink-0 border-b border-border bg-background", mobile ? "px-2 py-1.5" : "px-3 py-2")} data-sheet-banner={top.key}>
      <Callout tone={top.tone} title={top.title} action={top.action} className="py-2">
        {top.text}
      </Callout>
    </div>
  );
}
