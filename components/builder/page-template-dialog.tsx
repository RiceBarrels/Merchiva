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
import { PAGE_TEMPLATES, type PageTemplateId } from "@/lib/builder/page-templates";

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
          <DynamicUIElementTitle className="text-sm">Add a page</DynamicUIElementTitle>
        </DynamicUIElementHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Page name</Label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setTouched(true); }}
              placeholder="New Page"
              autoFocus
              className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            />
            <p className="text-[10px] text-muted-foreground">
              /{slugify(name) || "—"}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Template</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PAGE_TEMPLATES.map((tpl) => {
                const active = tpl.id === templateId;
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
                    <span className="text-xs font-medium text-foreground">{tpl.label}</span>
                    <span className="text-[10px] leading-snug text-muted-foreground">
                      {tpl.description}
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
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="text-xs"
          >
            Create page
          </Button>
        </DynamicUIElementFooter>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
