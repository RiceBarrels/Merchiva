"use client";

/**
 * Frame for the editor's desktop side panels (docs-editor-ui spec §4.4): comments list, version history,
 * and the outline when the canvas is too narrow for the gutter.
 *
 * Props:
 * - `title` — stable, translated heading (e.g. `t("docs.comments.title")`), also the landmark label.
 * - `onClose` — the header X button.
 * - `side` — `"end"` (default) sits on the inline-end edge with `border-s`; `"start"` (outline overlay) uses `border-e`.
 */
import { useId } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export interface SidePanelFrameProps {
  title: string;
  onClose(): void;
  children: React.ReactNode;
  side?: "start" | "end";
  className?: string;
}

export function SidePanelFrame({ title, onClose, children, side = "end", className }: SidePanelFrameProps): React.JSX.Element {
  const t = useT();
  const headingId = useId();
  return (
    <aside
      aria-labelledby={headingId}
      data-side={side}
      className={cn(
        "flex w-[320px] shrink-0 flex-col border-border bg-background",
        side === "end" ? "border-s" : "border-e",
        className,
      )}
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Eyebrow as="h3" id={headingId} className="min-w-0 flex-1 truncate">
          {title}
        </Eyebrow>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("common.close")} onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}
