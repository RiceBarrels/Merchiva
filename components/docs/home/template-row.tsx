"use client";

import { useId } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { DOC_TEMPLATES, type DocTemplateId } from "@/lib/docs/templates";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { TemplateThumb } from "./template-thumb";

export interface TemplateRowProps {
  collapsed: boolean;
  onToggle(): void;
  /** Template currently being created (shows a spinner and blocks the other tiles). */
  pendingId: DocTemplateId | null;
  /** Creation unavailable (backend not ready). */
  disabled: boolean;
  onPick(id: DocTemplateId): void;
}

/** "Start a new document" band: blank plus the store templates, scrolling sideways on narrow screens. */
export function TemplateRow({ collapsed, onToggle, pendingId, disabled, onPick }: TemplateRowProps) {
  const t = useT();
  const headingId = useId();
  const listId = useId();

  return (
    <section aria-labelledby={headingId} className="-mx-2 border-b border-border bg-muted/40">
      <div className="mx-auto w-full max-w-[1100px] px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id={headingId} className="leading-none">
            <Eyebrow as="span">{t("docs.home.startNew")}</Eyebrow>
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-controls={listId}
            className="-me-2 text-muted-foreground"
          >
            {collapsed ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
            {collapsed ? t("docs.home.showTemplates") : t("docs.home.hideTemplates")}
          </Button>
        </div>
        <span role="status" className="sr-only">
          {pendingId ? t("docs.home.creating") : ""}
        </span>
        <ul id={listId} hidden={collapsed} className="no-scrollbar -mx-1 mt-2.5 flex gap-3 overflow-x-auto px-1 pt-0.5 pb-1">
          {DOC_TEMPLATES.map((template) => {
            const pending = pendingId === template.id;
            const blocked = disabled || (pendingId !== null && !pending);
            return (
              <li key={template.id} className="w-[112px] shrink-0">
                <button
                  type="button"
                  disabled={blocked}
                  aria-busy={pending || undefined}
                  onClick={() => {
                    if (!pending) onPick(template.id);
                  }}
                  className="group block w-full rounded-lg text-start outline-none disabled:cursor-not-allowed"
                >
                  <span
                    className={cn(
                      "relative block aspect-[8.5/11] rounded-lg border border-border bg-white p-2 transition-colors",
                      "group-hover:border-foreground/40 group-focus-visible:border-ring group-focus-visible:ring-3 group-focus-visible:ring-ring/50",
                      blocked && "opacity-60 group-hover:border-border",
                    )}
                  >
                    <TemplateThumb id={template.id} />
                    {pending && (
                      <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/70">
                        <Loader2 aria-hidden className="h-4 w-4 animate-spin text-neutral-700" />
                      </span>
                    )}
                  </span>
                  <span className="mt-1.5 block truncate text-[12px] font-medium text-foreground">{t(template.titleKey)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
