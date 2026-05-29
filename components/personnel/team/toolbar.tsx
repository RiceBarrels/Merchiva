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
        <GitFork className="h-3.5 w-3.5 text-stone-700 dark:text-stone-200" strokeWidth={1.75} />
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
      <div className="border border-border rounded-[0.3rem] p-0.5 flex items-center">
        <button
          onClick={() => onViewMode("graph")}
          className={cn(
            "h-7 px-2 sm:px-2.5 rounded-[0.2rem] inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors",
            viewMode === "graph" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
          )}
          title="图谱视图"
        >
          <GitFork className="h-3 w-3" strokeWidth={1.75} />
          <span className="hidden sm:inline">图谱</span>
        </button>
        <button
          onClick={() => onViewMode("list")}
          className={cn(
            "h-7 px-2 sm:px-2.5 rounded-[0.2rem] inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors",
            viewMode === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
          )}
          title="列表视图"
        >
          <List className="h-3 w-3" strokeWidth={1.75} />
          <span className="hidden sm:inline">列表</span>
        </button>
      </div>

      {/* Search */}
      {(!isMobile || mSearchOpen) ? (
        <div className="border border-border rounded-[0.3rem] px-2 py-1.5 flex items-center gap-1.5 flex-1 sm:flex-none min-w-0">
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
            <button onClick={() => { onQuery(""); if (isMobile) setMSearchOpen(false); }} className="h-5 w-5 rounded-[0.2rem] hover:bg-muted text-muted-foreground inline-flex items-center justify-center shrink-0">
              <X className="h-2.5 w-2.5" strokeWidth={1.75} />
            </button>
          )}
        </div>
      ) : (
        <button onClick={() => setMSearchOpen(true)} className="h-8 w-8 border border-border rounded-[0.3rem] inline-flex items-center justify-center text-muted-foreground">
          <Search className="h-3.5 w-3.5" strokeWidth={1.75} />
        </button>
      )}

      {/* Add actions */}
      {!isMobile ? (
        canEdit && (
          <div className="border border-border rounded-[0.3rem] px-2 py-1.5 flex items-center gap-1">
            <button onClick={onInviteMember} className="h-7 px-2 rounded-[0.2rem] hover:bg-muted text-stone-700 dark:text-stone-200 inline-flex items-center gap-1.5 text-[12px] font-medium">
              <UserPlus className="h-3 w-3" strokeWidth={1.75} />
              邀请成员
            </button>
            <span className="h-4 w-px bg-border" />
            <button onClick={onAddGroup} className="h-7 px-2 rounded-[0.2rem] hover:bg-muted text-stone-700 dark:text-stone-200 inline-flex items-center gap-1.5 text-[12px] font-medium">
              <UsersRound className="h-3 w-3" strokeWidth={1.75} />
              加分组
            </button>
            <span className="h-4 w-px bg-border" />
            <button onClick={onOpenRoleManager} className="h-7 px-2 rounded-[0.2rem] hover:bg-muted text-stone-700 dark:text-stone-200 inline-flex items-center gap-1.5 text-[12px] font-medium" title="编辑岗位角色">
              <ShieldPlus className="h-3 w-3" strokeWidth={1.75} />
              角色
            </button>
          </div>
        )
      ) : (
        canEdit && (
          <div className="relative">
            <button onClick={() => setMMenuOpen((o) => !o)} className="h-8 w-8 rounded-[0.3rem] bg-foreground text-background inline-flex items-center justify-center" title="添加">
              <Plus className="h-4 w-4" strokeWidth={1.75} />
            </button>
            {mMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMMenuOpen(false)} />
                <div className="absolute right-0 top-9 z-40 w-40 bg-background border border-border rounded-[0.3rem] shadow-lg py-1">
                  <button onClick={() => { setMMenuOpen(false); onInviteMember(); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-muted inline-flex items-center gap-2">
                    <UserPlus className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />邀请成员
                  </button>
                  <button onClick={() => { setMMenuOpen(false); onAddGroup(); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-muted inline-flex items-center gap-2">
                    <UsersRound className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />加分组
                  </button>
                  <button onClick={() => { setMMenuOpen(false); onOpenRoleManager(); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-muted inline-flex items-center gap-2">
                    <ShieldPlus className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />管理角色
                  </button>
                </div>
              </>
            )}
          </div>
        )
      )}

      {/* View tools — graph only */}
      <div className="border border-border rounded-[0.3rem] px-1.5 sm:px-2 py-1.5 flex items-center gap-1 ml-auto">
        {viewMode === "graph" && (
          <>
            <button onClick={onAutoLayout} className="h-7 px-2 rounded-[0.2rem] hover:bg-muted text-stone-700 dark:text-stone-200 inline-flex items-center gap-1.5 text-[12px]" title="自动整理">
              <LayoutGrid className="h-3 w-3" strokeWidth={1.75} />
              <span className="hidden sm:inline">整理</span>
            </button>
            <button
              onClick={onFocusMode}
              className={cn(
                "h-7 px-2 rounded-[0.2rem] inline-flex items-center gap-1.5 text-[12px]",
                focusMode ? "bg-foreground text-background" : "hover:bg-muted text-stone-700 dark:text-stone-200",
              )}
              title="只看选中节点的上下级"
            >
              <Target className="h-3 w-3" strokeWidth={1.75} />
              <span className="hidden sm:inline">聚焦</span>
            </button>
            <span className="hidden sm:block h-4 w-px bg-border" />
            <button onClick={() => onZoom(view.zoom * 0.9)} className="hidden sm:inline-flex h-7 w-7 rounded-[0.2rem] hover:bg-muted text-stone-700 dark:text-stone-200 items-center justify-center">
              <Minus className="h-3 w-3" strokeWidth={1.75} />
            </button>
            <span className="hidden sm:block text-[10.5px] font-mono text-muted-foreground w-10 text-center tabular-nums">{Math.round(view.zoom * 100)}%</span>
            <button onClick={() => onZoom(view.zoom * 1.1)} className="hidden sm:inline-flex h-7 w-7 rounded-[0.2rem] hover:bg-muted text-stone-700 dark:text-stone-200 items-center justify-center">
              <Plus className="h-3 w-3" strokeWidth={1.75} />
            </button>
            <Button variant="ghost" size="sm" onClick={onResetView} className="h-7 px-2 rounded-[0.2rem] text-muted-foreground text-[11px]" title="适配">
              <Maximize className="h-2.5 w-2.5" strokeWidth={1.75} />
              <span className="hidden sm:inline">适配</span>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
