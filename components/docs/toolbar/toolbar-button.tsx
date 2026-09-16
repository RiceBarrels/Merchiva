"use client";

/**
 * Toolbar icon button (docs-editor-ui spec §4.6). Inside the toolbar row it is a Base UI `Toolbar.Button` (roving
 * focus); in the overflow popover it renders a plain button. Pointer-down doesn't steal the editor's focus.
 */
import { createContext, useContext, type ComponentProps, type ComponentType } from "react";
import { Toolbar } from "@base-ui/react/toolbar";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** "row" inside Toolbar.Root, "overflow" inside the ⋮ popover. */
export const ToolbarPlacementContext = createContext<"row" | "overflow">("row");

export const TOOLBAR_ICON_CLASS =
  "text-muted-foreground hover:text-foreground data-[active]:bg-muted data-[active]:text-foreground aria-expanded:bg-muted";

/** A ghost icon button usable as a `render` target of menu / popover triggers in the toolbar. */
export function ToolbarIconButton({ className, ...props }: ComponentProps<typeof Button>) {
  const placement = useContext(ToolbarPlacementContext);
  const classes = cn(TOOLBAR_ICON_CLASS, className);
  if (placement === "row") {
    return (
      <Toolbar.Button
        render={<Button type="button" variant="ghost" size="icon-sm" />}
        className={classes}
        onMouseDown={(event) => event.preventDefault()}
        {...(props as ComponentProps<typeof Toolbar.Button>)}
      />
    );
  }
  return <Button type="button" variant="ghost" size="icon-sm" className={classes} onMouseDown={(event) => event.preventDefault()} {...props} />;
}

export interface ToolbarButtonProps {
  label: string;
  shortcut?: string;
  /** Toggle state; omit for plain actions. */
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
  icon: ComponentType<{ className?: string }>;
  className?: string;
}

export function ToolbarButton({ label, shortcut, active, disabled, onClick, icon: Icon, className }: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ToolbarIconButton
            aria-label={label}
            aria-pressed={active === undefined ? undefined : active}
            data-active={active ? "" : undefined}
            disabled={disabled}
            className={className}
            onClick={onClick}
          />
        }
      >
        <Icon className="h-4 w-4" />
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        {shortcut && (
          <span dir="ltr" className="ms-1.5 opacity-70">
            {shortcut}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
