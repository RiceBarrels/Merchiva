"use client";

// New ▸ From a template on the Drive page: the Docs store templates (components/drive/store-templates.ts) in a
// submenu.

import { LayoutTemplate } from "lucide-react";
import { DocMenuItem, DocMenuSub, DocMenuSubContent, DocMenuSubTrigger } from "@/components/docs/ui/doc-menu";
import { STORE_TEMPLATE_IDS, type StoreTemplateId } from "@/components/drive/store-templates";
import { docTemplateTitleKey } from "@/lib/docs/templates";
import { useT } from "@/lib/i18n/context";

export interface NewMenuTemplatesProps {
  /** Shown next to each template while the Docs plugin is missing (already translated). */
  missingHint?: string;
  onPick(templateId: StoreTemplateId): void;
}

export function NewMenuTemplates({ missingHint, onPick }: NewMenuTemplatesProps) {
  const t = useT();
  return (
    <DocMenuSub>
      <DocMenuSubTrigger icon={LayoutTemplate}>{t("drive.home.newFromTemplate")}</DocMenuSubTrigger>
      <DocMenuSubContent>
        {STORE_TEMPLATE_IDS.map((id) => (
          <DocMenuItem key={id} hint={missingHint} onClick={() => onPick(id)}>
            {t(docTemplateTitleKey(id))}
          </DocMenuItem>
        ))}
      </DocMenuSubContent>
    </DocMenuSub>
  );
}
