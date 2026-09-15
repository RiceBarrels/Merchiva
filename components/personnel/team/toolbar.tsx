"use client";

import { Fragment, useRef, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import {
  GitFork,
  LayoutGrid,
  List,
  Maximize,
  Minus,
  Plus,
  Search,
  ShieldPlus,
  Target,
  UserPlus,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { MAX_ZOOM, MIN_ZOOM, fmt } from "./data";

export type ViewMode = "graph" | "list";

export interface OrgToolbarProps {
  viewMode: ViewMode;
  onViewMode(m: ViewMode): void;
  q: string;
  onQuery(q: string): void;
  matchCount: number;
  totals: { persons: number; groups: number; edges: number };
  isMobile: boolean;
  canInvite: boolean;
  canEditLayout: boolean;
  canManageRoles: boolean;
  onInviteMember(): void;
  onAddGroup(): void;
  onOpenRoleManager(): void;
  // graph-only tools
  zoom: number;
  onZoomIn(): void;
  onZoomOut(): void;
  onFit(): void;
  onAutoLayout(): void;
  focusActive: boolean;
  focusDisabled: boolean;
  onFocusMode(): void;
}

const K = "personnel.team.org.toolbar";
const ZOOM_EPS = 0.001;

interface AddAction {
  key: string;
  label: string;
  title?: string;
  icon: LucideIcon;
  onClick: () => void;
}

export function OrgToolbar({
  viewMode, onViewMode,
  q, onQuery, matchCount,
  totals,
  isMobile,
  canInvite, canEditLayout, canManageRoles,
  onInviteMember, onAddGroup, onOpenRoleManager,
  zoom, onZoomIn, onZoomOut, onFit, onAutoLayout,
  focusActive, focusDisabled, onFocusMode,
}: OrgToolbarProps) {
  const t = useT();
  // Phones start with search collapsed; it only expands (and focuses) on tap.
  const [searchOpen, setSearchOpen] = useState(false);
  // Return focus to the search opener after the phone search closes.
  const restoreOpenerFocus = useRef(false);

  const hasQuery = q.trim() !== "";
  const searchExpanded = !isMobile || searchOpen || q !== "";
  const matchesText = fmt(t(`${K}.matches`), { n: matchCount });

  const closeSearch = () => {
    onQuery("");
    setSearchOpen(false);
    restoreOpenerFocus.current = true;
  };

  const actions: AddAction[] = [];
  if (canInvite) {
    actions.push({ key: "invite", label: t("personnel.team.invite"), icon: UserPlus, onClick: onInviteMember });
  }
  if (canEditLayout) {
    actions.push({ key: "group", label: t(`${K}.addGroup`), icon: UsersRound, onClick: onAddGroup });
  }
  if (canManageRoles) {
    actions.push({
      key: "roles",
      label: isMobile ? t(`${K}.manageRoles`) : t(`${K}.roles`),
      title: t(`${K}.manageRoles`),
      icon: ShieldPlus,
      onClick: onOpenRoleManager,
    });
  }

  const isGraph = viewMode === "graph";
  const zoomPct = Math.round(zoom * 100);

  const searchField = (
    <div className={cn("relative min-w-0", isMobile ? "flex-1" : "w-[220px]")}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        strokeWidth={1.75}
      />
      <Input
        value={q}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          if (q !== "") onQuery("");
          else if (isMobile) closeSearch();
        }}
        // Only autofocus the field that mounts because the user tapped search.
        autoFocus={isMobile && searchOpen}
        autoComplete="off"
        enterKeyHint="search"
        aria-label={t("personnel.team.searchMobile")}
        placeholder={t(`${K}.searchPlaceholder`)}
        className={cn(
          "pl-8!",
          q !== "" ? (isMobile ? "pr-10!" : "pr-14!") : isMobile ? "pr-3!" : "pr-2.5!",
        )}
      />
      {q !== "" && (
        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          {hasQuery && (
            <span
              aria-hidden
              title={matchesText}
              className="pointer-events-none px-1 font-mono text-[10.5px] tabular-nums text-muted-foreground"
            >
              {matchCount}
            </span>
          )}
          {!isMobile && q !== "" && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t(`${K}.clearSearch`)}
              title={t(`${K}.clearSearch`)}
              onClick={() => onQuery("")}
              className="text-muted-foreground"
            >
              <X className="h-3 w-3" strokeWidth={1.75} />
            </Button>
          )}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {hasQuery ? matchesText : ""}
      </span>
    </div>
  );

  const toolSize = isMobile ? "icon-sm" : "sm";

  return (
    <div className="shrink-0 z-30 flex flex-wrap items-center gap-1.5 border-b border-border bg-background px-2.5 py-2 sm:gap-2 sm:px-3">
      {/* Title block */}
      <div className="flex min-w-0 items-center gap-2">
        <GitFork aria-hidden className="h-4 w-4 shrink-0 text-foreground" strokeWidth={1.75} />
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-semibold leading-tight">{t("personnel.team.title")}</div>
          <div className="truncate text-[10px] leading-tight text-muted-foreground tabular-nums">
            {fmt(t("personnel.team.org.peopleCount"), { n: totals.persons })}
            {" · "}
            {fmt(t(`${K}.groupsCount`), { n: totals.groups })}
            <span className="hidden sm:inline">
              {" · "}
              {fmt(t(`${K}.edgesCount`), { n: totals.edges })}
            </span>
          </div>
        </div>
      </div>

      <span aria-hidden className="hidden h-6 w-px bg-border sm:block" />

      {/* View toggle — labels stay in the accessibility tree on phones */}
      <SegmentedControl<ViewMode>
        size="sm"
        aria-label={t(`${K}.viewLabel`)}
        value={viewMode}
        onChange={onViewMode}
        options={[
          { value: "graph", label: <span className="sr-only sm:not-sr-only">{t(`${K}.viewGraph`)}</span>, icon: GitFork },
          { value: "list", label: <span className="sr-only sm:not-sr-only">{t(`${K}.viewList`)}</span>, icon: List },
        ]}
      />

      {/* Search */}
      {!isMobile ? (
        searchField
      ) : searchExpanded ? (
        <div className="flex min-w-0 flex-1 basis-40 items-center gap-1">
          {searchField}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t(`${K}.closeSearch`)}
            onClick={closeSearch}
            className="text-muted-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        </div>
      ) : (
        <Button
          ref={(el: HTMLButtonElement | null) => {
            if (el && restoreOpenerFocus.current) {
              restoreOpenerFocus.current = false;
              el.focus();
            }
          }}
          variant="outline"
          size="icon"
          aria-label={t("personnel.team.searchMobile")}
          onClick={() => setSearchOpen(true)}
          className="text-muted-foreground"
        >
          <Search className="h-4 w-4" strokeWidth={1.75} />
        </Button>
      )}

      {/* Right cluster: add actions + graph tools */}
      {(actions.length > 0 || isGraph) && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          {actions.length > 0 &&
            (isMobile ? (
              <MobileAddMenu actions={actions} label={t(`${K}.add`)} />
            ) : (
              <div
                role="group"
                aria-label={t(`${K}.add`)}
                className="flex items-center gap-0.5 rounded-lg border border-border p-0.5"
              >
                {actions.map((a, i) => {
                  const Icon = a.icon;
                  return (
                    <Fragment key={a.key}>
                      {i > 0 && <span aria-hidden className="h-4 w-px bg-border" />}
                      <Button variant="ghost" size="sm" onClick={a.onClick} title={a.title} className="text-[12px]">
                        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                        {a.label}
                      </Button>
                    </Fragment>
                  );
                })}
              </div>
            ))}

          {/* View tools — graph only, so list mode has no empty box */}
          {isGraph && (
            <div
              role="group"
              aria-label={t(`${K}.graphTools`)}
              className={cn(
                "flex items-center rounded-lg border border-border",
                isMobile ? "gap-0 p-0" : "gap-0.5 p-0.5",
              )}
            >
              {canEditLayout && (
                <Button
                  variant="ghost"
                  size={toolSize}
                  onClick={onAutoLayout}
                  aria-label={t(`${K}.autoLayout`)}
                  title={t(`${K}.autoLayoutHint`)}
                  className="text-[12px] font-normal"
                >
                  <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {!isMobile && <span>{t(`${K}.autoLayout`)}</span>}
                </Button>
              )}
              <Button
                variant="ghost"
                size={toolSize}
                onClick={onFocusMode}
                disabled={focusDisabled}
                aria-pressed={focusActive}
                aria-label={t(`${K}.focus`)}
                title={focusDisabled ? t(`${K}.focusNeedsSelection`) : t(`${K}.focusHint`)}
                className={cn(
                  "text-[12px] font-normal",
                  focusActive && "bg-foreground text-background hover:bg-foreground/90 hover:text-background",
                )}
              >
                <Target className="h-3.5 w-3.5" strokeWidth={1.75} />
                {!isMobile && <span>{t(`${K}.focus`)}</span>}
              </Button>
              {!isMobile && <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onZoomOut}
                disabled={zoom <= MIN_ZOOM + ZOOM_EPS}
                focusableWhenDisabled
                className="data-disabled:opacity-50"
                aria-label={t(`${K}.zoomOut`)}
                title={t(`${K}.zoomOut`)}
              >
                <Minus className="h-3.5 w-3.5" strokeWidth={1.75} />
              </Button>
              {!isMobile && (
                <span className="w-10 text-center font-mono text-[10.5px] tabular-nums text-muted-foreground">
                  {zoomPct}%
                </span>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onZoomIn}
                disabled={zoom >= MAX_ZOOM - ZOOM_EPS}
                focusableWhenDisabled
                className="data-disabled:opacity-50"
                aria-label={t(`${K}.zoomIn`)}
                title={t(`${K}.zoomIn`)}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              </Button>
              <Button
                variant="ghost"
                size={toolSize}
                onClick={onFit}
                aria-label={t(`${K}.fit`)}
                title={t(`${K}.fitHint`)}
                className="text-[12px] font-normal text-muted-foreground"
              >
                <Maximize className="h-3.5 w-3.5" strokeWidth={1.75} />
                {!isMobile && <span>{t(`${K}.fit`)}</span>}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Phone add-actions. One action → a direct icon button; several → a Base UI
 * menu (menu roles, Escape / outside click to dismiss, focus returns to the +).
 */
function MobileAddMenu({ actions, label }: { actions: AddAction[]; label: string }) {
  if (actions.length === 1) {
    const only = actions[0];
    const Icon = only.icon;
    return (
      <Button size="icon" aria-label={only.label} title={only.title ?? only.label} onClick={only.onClick}>
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </Button>
    );
  }

  return (
    <Menu.Root>
      <Menu.Trigger render={<Button size="icon" aria-label={label} title={label} />}>
        <Plus className="h-4 w-4" strokeWidth={1.75} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="end" sideOffset={4} className="isolate z-50 outline-none">
          <Menu.Popup
            className={cn(
              "z-50 min-w-44 origin-(--transform-origin) rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            )}
          >
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <Menu.Item
                  key={a.key}
                  onClick={a.onClick}
                  className="flex min-h-11 cursor-default select-none items-center gap-2 rounded-md px-3 text-sm outline-none data-highlighted:bg-muted focus:bg-muted"
                >
                  <Icon aria-hidden className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                  {a.label}
                </Menu.Item>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
