"use client";

// Layout pieces of the Slides toolbar (slides.md §7.3), on the Docs toolbar primitives (roving focus through Base UI
// Toolbar, buttons that don't take focus on mouse down): a text-labelled trigger (zoom level, font name) and the
// overflow row. Groups are laid out by fixed widths; the groups that don't fit move, whole, into a ⋮ popover, as in
// the Docs toolbar.
import { Fragment, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { Toolbar } from "@base-ui/react/toolbar";
import { MoreVertical } from "lucide-react";

import { TOOLBAR_ICON_CLASS, ToolbarIconButton, ToolbarPlacementContext } from "@/components/docs/toolbar/toolbar-button";
import { visibleGroupCount } from "@/components/slides/chrome/toolbar-layout";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

/** A ghost button with a text label (a menu trigger showing the current value); keeps focus where it was on press. */
export function ToolbarTextButton({ className, ...props }: ComponentProps<typeof Button>) {
  const placement = useContext(ToolbarPlacementContext);
  const classes = cn(TOOLBAR_ICON_CLASS, "h-7 gap-1 px-1.5 text-[12.5px] font-normal text-foreground", className);
  if (placement === "row") {
    return (
      <Toolbar.Button
        render={<Button type="button" variant="ghost" size="sm" />}
        className={classes}
        onMouseDown={(event) => event.preventDefault()}
        {...(props as ComponentProps<typeof Toolbar.Button>)}
      />
    );
  }
  return <Button type="button" variant="ghost" size="sm" className={classes} onMouseDown={(event) => event.preventDefault()} {...props} />;
}

export interface ToolbarGroupDef {
  readonly id: string;
  /** Laid-out width (px) used to decide what fits. */
  readonly width: number;
  render(): ReactNode;
}

export function OverflowToolbar({ label, groups }: { label: string; groups: readonly ToolbarGroupDef[] }) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect.width ?? 0);
      setWidth((prev) => (prev === next ? prev : next));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const count = visibleGroupCount(groups.map((g) => g.width), width);
  const visible = groups.slice(0, count);
  const hidden = groups.slice(count);

  return (
    <div ref={containerRef} className="min-w-0 flex-1">
      <Toolbar.Root aria-label={label} className="flex h-10 items-center gap-0.5 overflow-hidden px-2">
        {visible.map((group, index) => (
          <Fragment key={group.id}>
            {index > 0 && <Toolbar.Separator className="mx-1 h-5 w-px shrink-0 bg-border" />}
            <Toolbar.Group className="flex shrink-0 items-center gap-0.5">{group.render()}</Toolbar.Group>
          </Fragment>
        ))}
        {hidden.length > 0 && (
          <Popover>
            <PopoverTrigger render={<ToolbarIconButton aria-label={t("docs.toolbar.more")} title={t("docs.toolbar.more")} className="ms-auto" />}>
              <MoreVertical className="h-4 w-4" />
            </PopoverTrigger>
            <PopoverContent align="end" className="flex max-w-[360px] flex-wrap items-center gap-1 p-1.5" data-slides-picker="">
              <ToolbarPlacementContext.Provider value="overflow">
                {hidden.map((group) => (
                  <div key={group.id} className="flex items-center gap-0.5">
                    {group.render()}
                  </div>
                ))}
              </ToolbarPlacementContext.Provider>
            </PopoverContent>
          </Popover>
        )}
      </Toolbar.Root>
    </div>
  );
}
