"use client";

import { useState, useEffect } from "react";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
  DynamicUIElementFooter,
} from "@/components/ui/dynamic-ui-element";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";
import { PAGE_TEMPLATES, type PageTemplateId } from "@/lib/builder/page-templates";

// Maps the kebab-case template id to the camelCase i18n key
const TEMPLATE_KEY: Record<PageTemplateId, string> = {
  "blank": "blank",
  "product-detail": "productDetail",
  "login": "login",
  "register": "register",
  "forgot-password": "forgotPassword",
  "cart": "cart",
  "membership": "membershipTpl",
  "my-account": "myAccount",
  "settings": "settingsTpl",
  "checkout": "checkout",
  "menu": "menuTpl",
};

interface PageTemplateDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existingNames: string[];
  onCreate: (name: string, templateId: PageTemplateId) => void;
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function PageTemplateDialog({
  open,
  onOpenChange,
  existingNames,
  onCreate,
}: PageTemplateDialogProps) {
  const t = useT();
  const [templateId, setTemplateId] = useState<PageTemplateId>("blank");
  const [name, setName] = useState("New Page");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) {
      setTemplateId("blank");
      setName("New Page");
      setTouched(false);
    }
  }, [open]);

  // Auto-fill the name from the chosen template until the user edits it.
  useEffect(() => {
    if (touched) return;
    const meta = PAGE_TEMPLATES.find((t) => t.id === templateId);
    if (!meta) return;
    let candidate = meta.defaultName;
    let i = 2;
    const taken = new Set(existingNames.map((n) => n.toLowerCase()));
    while (taken.has(candidate.toLowerCase())) {
      candidate = `${meta.defaultName} ${i++}`;
    }
    setName(candidate);
  }, [templateId, touched, existingNames]);

  function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, templateId);
    onOpenChange(false);
  }

  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent className="sm:max-w-2xl">
        <DynamicUIElementHeader>
          <DynamicUIElementTitle className="text-sm">{t("builder.pageTemplate.title")}</DynamicUIElementTitle>
        </DynamicUIElementHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t("builder.pageTemplate.pageName")}</Label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setTouched(true); }}
              placeholder={t("builder.pageTemplate.pageNamePlaceholder")}
              autoFocus
              className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
            <p className="text-[10px] text-muted-foreground">
              /{slugify(name) || "—"}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t("builder.pageTemplate.template")}</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PAGE_TEMPLATES.map((tpl) => {
                const active = tpl.id === templateId;
                const keyBase = `builder.pageTemplates.${TEMPLATE_KEY[tpl.id]}`;
                return (
                  <button
                    type="button"
                    key={tpl.id}
                    onClick={() => setTemplateId(tpl.id)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-[0.3rem] border p-2.5 text-left transition-colors",
                      active
                        ? "border-foreground bg-accent"
                        : "border-border hover:border-foreground/60 hover:bg-accent/40"
                    )}
                  >
                    <span className="text-xs font-medium text-foreground">{t(keyBase)}</span>
                    <span className="text-[10px] leading-snug text-muted-foreground">
                      {t(`${keyBase}Description`)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DynamicUIElementFooter>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            {t("builder.pageTemplate.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="text-xs"
          >
            {t("builder.pageTemplate.createPage")}
          </Button>
        </DynamicUIElementFooter>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
