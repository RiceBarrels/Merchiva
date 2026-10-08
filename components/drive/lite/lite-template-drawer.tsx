"use client";

// New ▸ Doc from a template on the Drive lite home: the Docs store templates (all but blank, which is New ▸ Doc)
// in a bottom sheet. A tap closes the sheet and creates the Doc where the person is, through the same gate as
// New ▸ Doc (a missing Docs plugin asks to download it first); the new Doc then opens in its editor in the panel.

import { FileText } from "lucide-react";
import { DeviceDrawer, type DeviceDrawerOption } from "@/components/device/device-drawer";
import { STORE_TEMPLATE_IDS } from "@/components/drive/store-templates";
import { docTemplateTitleKey } from "@/lib/docs/templates";
import { useT } from "@/lib/i18n/context";
import { useLiteDriveContext } from "./lite-context";

export function LiteTemplateDrawer() {
  const t = useT();
  const { drive, panels } = useLiteDriveContext();
  const target = panels.state.templates;
  const open = panels.state.open === "templates";

  const options: DeviceDrawerOption[] = STORE_TEMPLATE_IDS.map((id) => ({
    id,
    icon: FileText,
    label: t(docTemplateTitleKey(id)),
    onSelect: () => {
      panels.close();
      if (target) drive.createFromTemplate(id, target);
    },
  }));

  return (
    <DeviceDrawer
      open={open}
      onOpenChange={(next) => {
        if (!next) panels.close();
      }}
      title={t("device.lite.drive.templatesTitle")}
      options={options}
    />
  );
}
