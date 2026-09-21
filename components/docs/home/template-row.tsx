"use client";

import { useId, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus } from "lucide-react";
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
  /** Phone / device panel: one "New document" button with the templates behind a toggle. */
  compact?: boolean;
}

type TilesProps = Pick<TemplateRowProps, "pendingId" | "disabled" | "onPick" | "compact"> & {
  listId: string;
  hidden: boolean;
};

/** The sideways-scrolling strip of template thumbnails, shared by both bands. */
function TemplateTiles({ listId, hidden, pendingId, disabled, onPick, compact = false }: TilesProps) {
  const t = useT();
  return (
    <ul id={listId} hidden={hidden} className="no-scrollbar -mx-1 mt-2.5 flex gap-3 overflow-x-auto px-1 pt-0.5 pb-1">
      {DOC_TEMPLATES.map((template) => {
        const pending = pendingId === template.id;
        const blocked = disabled || (pendingId !== null && !pending);
        return (
          <li key={template.id} className={cn("shrink-0", compact ? "w-[88px]" : "w-[112px]")}>
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
  );
}

/** "Start a new document" band: blank plus the store templates, scrolling sideways on narrow screens. */
export function TemplateRow({ collapsed, onToggle, pendingId, disabled, onPick, compact = false }: TemplateRowProps) {
  const t = useT();
  const headingId = useId();
  const listId = useId();
  // The compact band opens closed every time; the stored preference belongs to
  // the back office, where the templates are the point of the row.
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const busyLabel = (
    <span role="status" className="sr-only">
      {pendingId ? t("docs.home.creating") : ""}
    </span>
  );

  if (compact) {
    return (
      <section aria-labelledby={headingId} className="border-b border-border bg-muted/40 px-4 py-2.5">
        <h2 id={headingId} className="sr-only">
          {t("docs.home.startNew")}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            disabled={disabled || pendingId !== null}
            aria-busy={pendingId === "blank" || undefined}
            onClick={() => onPick("blank")}
            className="h-11 flex-1"
          >
            {pendingId === "blank" ? <Loader2 aria-hidden className="animate-spin" /> : <Plus aria-hidden />}
            {t("docs.home.newDocument")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setTemplatesOpen((open) => !open)}
            aria-expanded={templatesOpen}
            aria-controls={listId}
            className="h-11"
          >
            {templatesOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
            {templatesOpen ? t("docs.home.hideTemplates") : t("docs.home.showTemplates")}
          </Button>
        </div>
        {busyLabel}
        <TemplateTiles
          listId={listId}
          hidden={!templatesOpen}
          pendingId={pendingId}
          disabled={disabled}
          onPick={onPick}
          compact
        />
      </section>
    );
  }

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
        {busyLabel}
        <TemplateTiles listId={listId} hidden={collapsed} pendingId={pendingId} disabled={disabled} onPick={onPick} />
      </div>
    </section>
  );
}
