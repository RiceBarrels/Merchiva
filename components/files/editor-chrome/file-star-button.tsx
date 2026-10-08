"use client";

/** Star toggle for the Sheets and Slides headers (slides spec §7.3); props-based twin of the Docs `StarButton`. */
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export interface FileStarButtonProps {
  starred: boolean;
  /** E.g. while the file is in the trash. */
  disabled?: boolean;
  onToggle(): void;
}

export function FileStarButton({ starred, disabled = false, onToggle }: FileStarButtonProps) {
  const t = useT();
  const label = starred ? t("docs.menu.unstar") : t("docs.menu.star");
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-pressed={starred}
            disabled={disabled}
            aria-label={label}
            className={cn(starred ? "text-foreground" : "text-muted-foreground")}
            onClick={() => onToggle()}
          />
        }
      >
        <Star className={cn("h-4 w-4", starred && "fill-current")} />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
