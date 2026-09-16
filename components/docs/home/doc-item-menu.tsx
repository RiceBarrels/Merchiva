"use client";

// Per-document actions, shared by the "⋮" dropdown and the right-click / long-press
// context menu on cards and rows. Both render the same Base UI menu items
// (ContextMenu reuses Menu's Popup/Item parts, and its positioner falls back to
// the pointer anchor when no `anchor` is given).

import { Fragment } from "react";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import {
  Copy,
  ExternalLink,
  FileText,
  MoreVertical,
  Pencil,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
  UserPlus,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DocMenu, DocMenuContent, DocMenuItem, DocMenuSeparator, DocMenuTrigger } from "@/components/docs/ui/doc-menu";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { docItemActionGroups, type DocItemAction, type DocListItem } from "./doc-list-model";

const ACTIONS: Readonly<Record<DocItemAction, { labelKey: string; icon: LucideIcon; destructive?: boolean }>> = {
  open: { labelKey: "docs.menu.open", icon: FileText },
  openNewTab: { labelKey: "docs.menu.openInNewTab", icon: ExternalLink },
  rename: { labelKey: "docs.menu.rename", icon: Pencil },
  star: { labelKey: "docs.menu.star", icon: Star },
  unstar: { labelKey: "docs.menu.unstar", icon: StarOff },
  share: { labelKey: "docs.menu.share", icon: UserPlus },
  copy: { labelKey: "docs.menu.makeCopy", icon: Copy },
  trash: { labelKey: "docs.menu.moveToTrash", icon: Trash2 },
  restore: { labelKey: "docs.menu.restore", icon: RotateCcw },
  deleteForever: { labelKey: "docs.menu.deleteForever", icon: XCircle, destructive: true },
};

function DocItemMenuItems({ item, onAction }: { item: DocListItem; onAction(action: DocItemAction): void }) {
  const t = useT();
  return (
    <>
      {docItemActionGroups(item).map((group, index) => (
        <Fragment key={group.join(",")}>
          {index > 0 && <DocMenuSeparator />}
          {group.map((action) => {
            const meta = ACTIONS[action];
            return (
              <DocMenuItem key={action} icon={meta.icon} destructive={meta.destructive} onClick={() => onAction(action)}>
                {t(meta.labelKey)}
              </DocMenuItem>
            );
          })}
        </Fragment>
      ))}
    </>
  );
}

export interface DocItemMenuProps {
  item: DocListItem;
  onAction(action: DocItemAction): void;
  className?: string;
  /** Id of the element naming the document, so "More actions" is announced with its title. */
  describedBy?: string;
}

export function DocItemMenu({ item, onAction, className, describedBy }: DocItemMenuProps) {
  const t = useT();
  if (docItemActionGroups(item).length === 0) return null;
  return (
    <DocMenu>
      <DocMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("docs.menu.moreActions")}
            aria-describedby={describedBy}
            className={cn(
              "text-muted-foreground hover:text-foreground data-popup-open:bg-muted data-popup-open:text-foreground",
              className,
            )}
          />
        }
      >
        <MoreVertical aria-hidden className="h-4 w-4" />
      </DocMenuTrigger>
      <DocMenuContent align="end">
        <DocItemMenuItems item={item} onAction={onAction} />
      </DocMenuContent>
    </DocMenu>
  );
}

export interface DocItemContextMenuProps {
  item: DocListItem;
  onAction(action: DocItemAction): void;
  className?: string;
  /** Element to render instead of the default `<div>` (a table row, for example). */
  render?: ContextMenuPrimitive.Trigger.Props["render"];
  children: React.ReactNode;
}

export function DocItemContextMenu({ item, onAction, className, render, children }: DocItemContextMenuProps) {
  return (
    <ContextMenuPrimitive.Root>
      <ContextMenuPrimitive.Trigger className={className} render={render}>
        {children}
      </ContextMenuPrimitive.Trigger>
      <DocMenuContent>
        <DocItemMenuItems item={item} onAction={onAction} />
      </DocMenuContent>
    </ContextMenuPrimitive.Root>
  );
}
