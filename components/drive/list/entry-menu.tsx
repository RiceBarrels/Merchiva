"use client";

// Per-entry actions on the Drive manager page, shared by the "⋮" dropdown (cards, rows, the
// preview header) and the right-click / long-press context menu. The items come only from
// driveActionGroups (components/drive/model/actions.ts), which reads the entry's access flags,
// so a menu never offers what the module would refuse. Right-clicking an entry that is part of
// a multi-selection offers the selection's actions instead (selectionActions, the rule the
// selection bar and the Delete key use: offline, only downloading).
//
// Same structure as components/docs/home/doc-item-menu.tsx: both menus render the same Base UI
// items (ContextMenu reuses Menu's Popup/Item parts and anchors to the pointer).

import { Fragment } from "react";
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import {
  AppWindow,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderInput,
  FolderOpen,
  HardDrive,
  Info,
  MoreVertical,
  Pencil,
  Presentation,
  RotateCcw,
  Sheet,
  SquareCheck,
  Star,
  StarOff,
  Store,
  Trash2,
  UserPlus,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DocMenu,
  DocMenuContent,
  DocMenuGroup,
  DocMenuItem,
  DocMenuLabel,
  DocMenuSeparator,
  DocMenuTrigger,
} from "@/components/docs/ui/doc-menu";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { cn } from "@/lib/utils";
import {
  driveActionGroups,
  type ActionContext,
  type DriveAction,
  type DriveBulkAction,
} from "@/components/drive/model/actions";
import type { DriveEntry, DriveSection } from "@/components/drive/model/types";
import { selectionActions } from "@/components/drive/toolbar/selection-actions";

interface ActionMeta { labelKey: string; icon: LucideIcon; destructive?: boolean }

const ACTIONS: Readonly<Record<DriveAction, ActionMeta>> = {
  open: { labelKey: "drive.menu.open", icon: FolderOpen },
  openNewTab: { labelKey: "drive.menu.openNewTab", icon: ExternalLink },
  preview: { labelKey: "drive.menu.preview", icon: Eye },
  download: { labelKey: "drive.menu.download", icon: Download },
  openAsDoc: { labelKey: "drive.menu.openAsDoc", icon: FileText },
  openAsSheet: { labelKey: "drive.menu.openAsSheet", icon: Sheet },
  openAsSlides: { labelKey: "drive.menu.openAsSlides", icon: Presentation },
  rename: { labelKey: "drive.menu.rename", icon: Pencil },
  move: { labelKey: "drive.menu.move", icon: FolderInput },
  moveToStore: { labelKey: "drive.menu.moveToStore", icon: Store },
  moveToMy: { labelKey: "drive.menu.moveToMy", icon: HardDrive },
  share: { labelKey: "drive.menu.share", icon: UserPlus },
  star: { labelKey: "drive.menu.star", icon: Star },
  unstar: { labelKey: "drive.menu.unstar", icon: StarOff },
  details: { labelKey: "drive.menu.details", icon: Info },
  openOriginal: { labelKey: "drive.menu.openOriginal", icon: AppWindow },
  select: { labelKey: "drive.menu.select", icon: SquareCheck },
  trash: { labelKey: "drive.menu.trash", icon: Trash2 },
  restore: { labelKey: "drive.menu.restore", icon: RotateCcw },
  deleteForever: { labelKey: "drive.menu.deleteForever", icon: XCircle, destructive: true },
};

const BULK_ACTIONS: Readonly<Record<DriveBulkAction, ActionMeta>> = {
  move: ACTIONS.move,
  download: ACTIONS.download,
  trash: ACTIONS.trash,
  restore: ACTIONS.restore,
  deleteForever: ACTIONS.deleteForever,
};

/** Documents open in an editor, folders open in place. */
function openIcon(entry: DriveEntry): LucideIcon {
  if (entry.type === "doc") return FileText;
  if (entry.type === "sheet") return Sheet;
  if (entry.type === "slides") return Presentation;
  return FolderOpen;
}

/** `drive.menu.openOriginal` names the app the file came from. */
function actionLabel(action: DriveAction, entry: DriveEntry, t: (key: string) => string): string {
  if (action === "openOriginal" && entry.type === "virtual") {
    return fmt(t(ACTIONS.openOriginal.labelKey), { app: t(`drive.apps.sources.${entry.source}`) });
  }
  return t(ACTIONS[action].labelKey);
}

export interface EntryMenuActionsProps {
  entry: DriveEntry;
  ctx: ActionContext;
  /** moveRoots(...) for this entry: whether the Store root and the owner's My-files root are offered. */
  move: { toStore: boolean; toMy: boolean };
  onAction(action: DriveAction): void;
}

function EntryMenuItems({ entry, ctx, move, onAction }: EntryMenuActionsProps) {
  const t = useT();
  return (
    <>
      {driveActionGroups(entry, ctx, move).map((group, index) => (
        <Fragment key={group.join(",")}>
          {index > 0 && <DocMenuSeparator />}
          {group.map((action) => {
            const meta = ACTIONS[action];
            return (
              <DocMenuItem
                key={action}
                icon={action === "open" ? openIcon(entry) : meta.icon}
                destructive={meta.destructive}
                onClick={() => onAction(action)}
              >
                {actionLabel(action, entry, t)}
              </DocMenuItem>
            );
          })}
        </Fragment>
      ))}
    </>
  );
}

export interface EntryMenuProps extends EntryMenuActionsProps {
  className?: string;
  /** Id of the element naming the entry, so "More actions" is announced with its name. */
  describedBy?: string;
  /** An action on this entry is running. */
  disabled?: boolean;
}

/** The "⋮" button. Renders nothing when the entry offers no action. */
export function EntryMenu({ entry, ctx, move, onAction, className, describedBy, disabled = false }: EntryMenuProps) {
  const t = useT();
  if (driveActionGroups(entry, ctx, move).length === 0) return null;
  return (
    <DocMenu disabled={disabled}>
      <DocMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("drive.menu.moreActions")}
            aria-describedby={describedBy}
            disabled={disabled}
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
        <EntryMenuItems entry={entry} ctx={ctx} move={move} onAction={onAction} />
      </DocMenuContent>
    </DocMenu>
  );
}

/** A multi-selection the right-clicked entry belongs to. */
export interface EntryMenuBulk {
  entries: readonly DriveEntry[];
  section: DriveSection;
  onAction(action: DriveBulkAction): void;
}

function BulkMenuItems({ count, actions, onAction }: { count: number; actions: readonly DriveBulkAction[]; onAction(action: DriveBulkAction): void }) {
  const t = useT();
  return (
    <DocMenuGroup>
      <DocMenuLabel>{fmt(t("drive.list.selected"), { count })}</DocMenuLabel>
      {actions.map((action) => {
        const meta = BULK_ACTIONS[action];
        return (
          <DocMenuItem key={action} icon={meta.icon} destructive={meta.destructive} onClick={() => onAction(action)}>
            {t(meta.labelKey)}
          </DocMenuItem>
        );
      })}
    </DocMenuGroup>
  );
}

export interface EntryContextMenuProps extends EntryMenuActionsProps {
  /**
   * Set when the entry is part of a selection of two or more: the menu then offers the selection's actions
   * (selectionActions with ctx.offline) for the whole selection. Pass null otherwise.
   */
  bulk?: EntryMenuBulk | null;
  /** No context menu (an action on this entry is running); the browser's own menu shows. */
  disabled?: boolean;
  className?: string;
  /** Element to render instead of the default `<div>` (a table row, for example). */
  render?: ContextMenuPrimitive.Trigger.Props["render"];
  children: React.ReactNode;
}

/** Right-click / long-press menu around a card or row. */
export function EntryContextMenu({ entry, ctx, move, onAction, bulk = null, disabled = false, className, render, children }: EntryContextMenuProps) {
  const showBulk = bulk !== null && bulk.entries.length > 1;
  const bulkActions = showBulk ? selectionActions(bulk.entries, bulk.section, ctx.offline) : [];
  const empty = showBulk ? bulkActions.length === 0 : driveActionGroups(entry, ctx, move).length === 0;
  return (
    <ContextMenuPrimitive.Root disabled={disabled || empty}>
      <ContextMenuPrimitive.Trigger className={className} render={render}>
        {children}
      </ContextMenuPrimitive.Trigger>
      <DocMenuContent>
        {showBulk ? (
          <BulkMenuItems count={bulk.entries.length} actions={bulkActions} onAction={bulk.onAction} />
        ) : (
          <EntryMenuItems entry={entry} ctx={ctx} move={move} onAction={onAction} />
        )}
      </DocMenuContent>
    </ContextMenuPrimitive.Root>
  );
}
