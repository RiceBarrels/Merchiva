"use client";

import { useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import type { ViewLayout } from "./data";

export type ViewMode = "graph" | "list";

interface ToolbarProps {
  onInviteMember: () => void;
  onAddGroup: () => void;
  onAutoLayout: () => void;
  onResetView: () => void;
  onFocusMode: () => void;
  focusMode: boolean;
  view: ViewLayout;
  onZoom: (z: number) => void;
  q: string;
  onQuery: (q: string) => void;
  matchCount: number;
  totals: { persons: number; groups: number; edges: number };
  viewMode: ViewMode;
  onViewMode: (m: ViewMode) => void;
  onOpenRoleManager: () => void;
  isMobile: boolean;
  canEdit: boolean;
}

export function OrgToolbar({
  onInviteMember,
  onAddGroup,
  onAutoLayout, onResetView,
  onFocusMode, focusMode,
  view, onZoom,
  q, onQuery, matchCount,
  totals,
  viewMode, onViewMode,
  onOpenRoleManager,
  isMobile,
  canEdit,
}: ToolbarProps) {
  const [mSearchOpen, setMSearchOpen] = useState(false);
  const [mMenuOpen, setMMenuOpen] = useState(false);

  return (
    <div className="shrink-0 z-30 flex items-center gap-1.5 sm:gap-2 flex-wrap px-2.5 sm:px-3 py-2 border-b border-border bg-background">
      {/* Title block */}
      <div className="flex items-center gap-2">
        <GitFork className="h-3.5 w-3.5 text-foreground" strokeWidth={1.75} />
        <div>
          <div className="text-[12.5px] font-semibold leading-tight">
            团队<span className="hidden sm:inline"> · Team</span>
          </div>
          <div className="text-[10px] text-muted-foreground leading-tight">
            {totals.persons} 人 · {totals.groups} 组
            <span className="hidden sm:inline"> · {totals.edges} 关系</span>
          </div>
        </div>
      </div>

      <span className="hidden sm:block h-6 w-px bg-border" />

      {/* View toggle */}
      <SegmentedControl<ViewMode>
        size="sm"
        aria-label="视图"
        value={viewMode}
        onChange={onViewMode}
        options={[
          { value: "graph", label: <span className="hidden sm:inline">图谱</span>, icon: GitFork },
          { value: "list", label: <span className="hidden sm:inline">列表</span>, icon: List },
        ]}
      />

      {/* Search */}
      {(!isMobile || mSearchOpen) ? (
        <div className="border border-border rounded-lg px-2 py-1.5 flex items-center gap-1.5 flex-1 sm:flex-none min-w-0">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" strokeWidth={1.75} />
          <Input
            value={q}
            autoFocus={isMobile}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="搜索姓名、邮箱、角色…"
            className="h-6 w-full sm:w-[200px] text-[12px] outline-none bg-transparent border-0 px-0 focus-visible:ring-0 min-w-0"
          />
          {q && <span className="text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">{matchCount}</span>}
          {(q || isMobile) && (
            <Button variant="ghost" size="icon-xs" onClick={() => { onQuery(""); if (isMobile) setMSearchOpen(false); }} className="h-5 w-5 text-muted-foreground shrink-0">
              <X className="h-2.5 w-2.5" strokeWidth={1.75} />
            </Button>
          )}
        </div>
      ) : (
        <Button variant="outline" size="icon" onClick={() => setMSearchOpen(true)} className="text-muted-foreground">
          <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
        </Button>
      )}

      {/* Add actions */}
      {!isMobile ? (
        canEdit && (
          <div className="border border-border rounded-lg px-2 py-1.5 flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onInviteMember} className="text-[12px]">
              <UserPlus className="h-3 w-3" strokeWidth={1.75} />
              邀请成员
            </Button>
            <span className="h-4 w-px bg-border" />
            <Button variant="ghost" size="sm" onClick={onAddGroup} className="text-[12px]">
              <UsersRound className="h-3 w-3" strokeWidth={1.75} />
              加分组
            </Button>
            <span className="h-4 w-px bg-border" />
            <Button variant="ghost" size="sm" onClick={onOpenRoleManager} className="text-[12px]" title="编辑岗位角色">
              <ShieldPlus className="h-3 w-3" strokeWidth={1.75} />
              角色
            </Button>
          </div>
        )
      ) : (
        canEdit && (
          <div className="relative">
            <Button size="icon" onClick={() => setMMenuOpen((o) => !o)} title="添加">
              <Plus className="h-4 w-4" strokeWidth={1.75} />
            </Button>
            {mMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-40 w-40 bg-background border border-border rounded-lg shadow-md py-1">
                  <Button variant="ghost" onClick={() => { setMMenuOpen(false); onInviteMember(); }} className="w-full justify-start rounded-none px-3 text-[13px] font-normal">
                    <UserPlus className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />邀请成员
                  </Button>
                  <Button variant="ghost" onClick={() => { setMMenuOpen(false); onAddGroup(); }} className="w-full justify-start rounded-none px-3 text-[13px] font-normal">
                    <UsersRound className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />加分组
                  </Button>
                  <Button variant="ghost" onClick={() => { setMMenuOpen(false); onOpenRoleManager(); }} className="w-full justify-start rounded-none px-3 text-[13px] font-normal">
                    <ShieldPlus className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />管理角色
                  </Button>
                </div>
              </>
            )}
          </div>
        )
      )}

      {/* View tools — graph only */}
      <div className="border border-border rounded-lg px-1.5 sm:px-2 py-1.5 flex items-center gap-1 ml-auto">
        {viewMode === "graph" && (
          <>
            <Button variant="ghost" size="sm" onClick={onAutoLayout} className="text-[12px] font-normal" title="自动整理">
              <LayoutGrid className="h-3 w-3" strokeWidth={1.75} />
              <span className="hidden sm:inline">整理</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onFocusMode}
              className={cn("text-[12px] font-normal", focusMode && "bg-foreground text-background hover:bg-foreground hover:text-background")}
              title="只看选中节点的上下级"
            >
              <Target className="h-3 w-3" strokeWidth={1.75} />
              <span className="hidden sm:inline">聚焦</span>
            </Button>
            <span className="hidden sm:block h-4 w-px bg-border" />
            <Button variant="ghost" size="icon-sm" onClick={() => onZoom(view.zoom * 0.9)} className="hidden sm:inline-flex">
              <Minus className="h-3 w-3" strokeWidth={1.75} />
            </Button>
            <span className="hidden sm:block text-[10.5px] font-mono text-muted-foreground w-10 text-center tabular-nums">{Math.round(view.zoom * 100)}%</span>
            <Button variant="ghost" size="icon-sm" onClick={() => onZoom(view.zoom * 1.1)} className="hidden sm:inline-flex">
              <Plus className="h-3 w-3" strokeWidth={1.75} />
            </Button>
            <Button variant="ghost" size="sm" onClick={onResetView} className="text-muted-foreground text-[11px]" title="适配">
              <Maximize className="h-2.5 w-2.5" strokeWidth={1.75} />
              <span className="hidden sm:inline">适配</span>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
