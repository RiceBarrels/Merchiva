"use client";

import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { useDocEditor } from "./doc-editor-context";

export function StarButton() {
  const t = useT();
  const { doc, isStarred, actions } = useDocEditor();
  const label = isStarred ? t("docs.menu.unstar") : t("docs.menu.star");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-pressed={isStarred}
            disabled={!!doc.trashedAt}
            aria-label={label}
            className={cn(isStarred ? "text-foreground" : "text-muted-foreground")}
            onClick={() => void actions.toggleStar()}
          />
        }
      >
        <Star className={cn("h-4 w-4", isStarred && "fill-current")} />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
