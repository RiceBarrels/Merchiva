"use client";

// The management-visibility notice inside the Drive lite app (drive-ui §12, integration-legal §6.6): a row at the
// top of the home screen ("Store management can see everything you save here"), which opens the full text, and,
// on the shared store tablet, the line next to the upload buttons that says the tablet is shared. The blocking
// first-open acknowledgement is LiteNoticeGate's (components/drive/notice), around the whole app.

import { Eye, TabletSmartphone } from "lucide-react";
import { DeviceDrawer } from "@/components/device/device-drawer";
import { hapticLight } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { useLiteDriveContext } from "./lite-context";

export function LiteNoticeRow() {
  const t = useT();
  const { panels } = useLiteDriveContext();
  return (
    <button
      type="button"
      data-drive-notice="lite-row"
      onClick={() => {
        hapticLight();
        panels.openNotice();
      }}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-start active:bg-muted"
    >
      <Eye className="h-5 w-5 flex-none text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 text-[14px] leading-snug">{t("device.lite.drive.noticeShort")}</span>
    </button>
  );
}

/** /store only: the tablet is one account for everyone who uses it. */
export function LiteSharedDeviceNote() {
  const t = useT();
  return (
    <p data-drive-notice="shared-device" className="flex items-start gap-2 text-[13px] leading-snug text-muted-foreground">
      <TabletSmartphone className="mt-0.5 h-4 w-4 flex-none" aria-hidden />
      <span>{t("drive.disclosure.sharedDeviceNote")}</span>
    </p>
  );
}

export function LiteNoticeDrawer() {
  const t = useT();
  const { drive, panels } = useLiteDriveContext();
  return (
    <DeviceDrawer
      open={panels.state.open === "notice"}
      onOpenChange={(open) => { if (!open) panels.close(); }}
      title={t("drive.disclosure.title")}
      cancelLabel={t("common.close")}
    >
      <div className="flex flex-col gap-3 pb-1 text-[15px] leading-relaxed">
        <p>{t("drive.disclosure.body")}</p>
        <p className="text-muted-foreground">{t("drive.disclosure.storeFilesHint")}</p>
        {drive.surface === "store" && <p className="text-muted-foreground">{t("drive.disclosure.sharedDeviceNote")}</p>}
      </div>
    </DeviceDrawer>
  );
}
