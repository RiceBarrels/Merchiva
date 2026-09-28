"use client";

// The management-visibility notice: "your store's management can see what you store here".
//
//   ManagementNoticeBanner  info callout with "Learn more" (the dialog in info mode, closable)
//   ManagementNoticeGate    /manager: blocking dialog until acknowledged; only its two buttons end
//                           it ("I understand", or "Not now", which leaves the screen)
//   LiteNoticeGate          /store and /personal: a full lite screen instead of the app until
//                           acknowledged; the panel's own close button stays usable
//
// Acknowledgements are per member and per surface (use-notice-ack.ts). A lite host already
// gates everything inside it, so ManagementNoticeGate renders nothing under NoticeGateScope.
// Copy: drive.disclosure.* (legally reviewed) plus the two lite / manager button labels.

import { createContext, useContext, useState, type ReactNode } from "react";
import { Eye } from "lucide-react";
import { LiteButton, LiteLoading, LiteScreen } from "@/components/device/apps/lite";
import { useDocsOpenUrl } from "@/components/docs/docs-open-context";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Eyebrow } from "@/components/ui/eyebrow";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { guardNoticeOpenChange, liteNoticeGate } from "./notice-ack-state";
import { useManagementNoticeAck, type ManagementNoticeAck } from "./use-notice-ack";

/** True below a LiteNoticeGate: the lite host has already gated, so nested manager gates stay away. */
export const NoticeGateScope = createContext<boolean>(false);
NoticeGateScope.displayName = "NoticeGateScope";

/** Where "Not now" goes on /manager when the host passes no onDecline. */
const DECLINE_HREF = "/manager/dashboard";

export function ManagementNoticeBanner({ compact, className }: { compact?: boolean; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className={className} data-drive-notice="banner">
      <Callout
        tone="info"
        icon={Eye}
        className={cn(compact && "gap-2 px-2.5 py-2")}
        action={
          <Button variant="link" size={compact ? "xs" : "sm"} className="h-auto px-0" onClick={() => setOpen(true)}>
            {t("drive.disclosure.learnMore")}
          </Button>
        }
      >
        <span className={cn(compact && "text-xs")}>{t("drive.disclosure.short")}</span>
      </Callout>
      <ManagementNoticeDialog open={open} onOpenChange={setOpen} mode="info" />
    </div>
  );
}

export function ManagementNoticeDialog({
  open,
  onOpenChange,
  mode,
  busy,
  onAcknowledge,
  onDecline,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  mode: "acknowledge" | "info";
  busy?: boolean;
  onAcknowledge?(): void;
  onDecline?(): void;
}) {
  const t = useT();
  const blocking = mode === "acknowledge";
  return (
    <AlertDialog open={open} onOpenChange={guardNoticeOpenChange(mode, onOpenChange)}>
      <AlertDialogContent data-drive-notice={blocking ? "gate" : "info"}>
        <AlertDialogHeader>
          {blocking && <Eyebrow>{t("drive.disclosure.ackTitle")}</Eyebrow>}
          <AlertDialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            {t("drive.disclosure.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("drive.disclosure.body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {blocking ? (
            <>
              <Button variant="outline" disabled={busy} onClick={() => onDecline?.()}>
                {t("drive.home.noticeDecline")}
              </Button>
              <Button disabled={busy} onClick={() => onAcknowledge?.()}>
                {t("drive.disclosure.ackConfirm")}
              </Button>
            </>
          ) : (
            <AlertDialogCancel>{t("common.close")}</AlertDialogCancel>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Blocking first-open notice on /manager screens. Renders null inside a lite host (NoticeGateScope). */
export function ManagementNoticeGate({ onDecline }: { onDecline?: () => void } = {}) {
  const scoped = useContext(NoticeGateScope);
  if (scoped) return null;
  return <ManagerNoticeGate onDecline={onDecline} />;
}

function ManagerNoticeGate({ onDecline }: { onDecline?: () => void }) {
  const notice = useManagementNoticeAck();
  const openUrl = useDocsOpenUrl();
  const decline = () => {
    if (onDecline) onDecline();
    else openUrl(DECLINE_HREF, "current");
  };
  return (
    <ManagementNoticeDialog
      open={notice.needsAck}
      onOpenChange={() => {}}
      mode="acknowledge"
      onAcknowledge={() => void notice.acknowledge()}
      onDecline={decline}
    />
  );
}

/** Device surfaces: until acknowledged, the notice screen replaces the app, so nothing can be uploaded or created. */
export function LiteNoticeGate({ children }: { children: ReactNode }) {
  const notice = useManagementNoticeAck();
  return (
    <NoticeGateScope.Provider value={true}>
      <LiteNoticeScreen notice={notice}>{children}</LiteNoticeScreen>
    </NoticeGateScope.Provider>
  );
}

/**
 * LiteNoticeGate's body for a given acknowledgement state: loading, the notice, or the app. Once the app has shown
 * for the person, it stays mounted while `ready` drops on a reconnect (liteNoticeGate).
 */
export function LiteNoticeScreen({ notice, children }: { notice: ManagementNoticeAck; children: ReactNode }) {
  const t = useT();
  const [clearedScope, setClearedScope] = useState<string | null>(null);
  const gate = liteNoticeGate(notice, clearedScope);
  if (gate.clearedScope !== clearedScope) setClearedScope(gate.clearedScope);
  if (gate.view === "loading") return <LiteLoading />;
  if (gate.view === "app") return <>{children}</>;
  return (
    <div data-drive-notice="lite-gate" className="flex min-h-full flex-col">
      <LiteScreen className="flex-1 justify-center">
        <span className="grid h-12 w-12 place-items-center rounded-lg bg-muted text-foreground">
          <Eye className="h-6 w-6" aria-hidden />
        </span>
        <div className="space-y-2">
          <h2 className="text-[20px] font-semibold leading-tight">{t("drive.disclosure.ackTitle")}</h2>
          <p className="text-[15px] font-medium">{t("drive.disclosure.title")}</p>
          <p className="text-[15px] leading-relaxed text-muted-foreground">{t("drive.disclosure.body")}</p>
        </div>
        <LiteButton icon={Eye} label={t("drive.disclosure.ackConfirm")} onClick={() => void notice.acknowledge()} />
        <p className="text-center text-[13px] text-muted-foreground">{t("device.lite.drive.noticeLeave")}</p>
      </LiteScreen>
    </div>
  );
}
