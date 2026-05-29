"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
  DynamicUIElementDescription,
} from "@/components/ui/dynamic-ui-element";
import { cn } from "@/lib/utils";
import { ORG_PERMS, ORG_PERMS_FLAT, type PermLeaf } from "./data";
import type { RoleRow, UseOrgGraphResult } from "./use-org-graph";
import type { OrgNode, PersonNode } from "./data";

const ROLE_COLOR_SWATCHES = [
  "#1c1917", "#44403c", "#78716c", "#a8a29e",
  "#7c3aed", "#0891b2", "#0d9488", "#16a34a",
  "#ea580c", "#dc2626", "#db2777", "#2563eb",
  "#ca8a04", "#65a30d", "#9333ea", "#0369a1",
];

const PERM_LABEL: Record<string, string> = {
  "team.view": "查看团队",
  "team.edit": "编辑成员",
  "team.invite": "邀请成员",
  "staffing.view": "查看排班",
  "staffing.edit": "编辑排班",
  "training_grading.view": "查看培训记录",
  "training_grading.edit": "评估学员",
  "sales.view": "查看销售",
  "pos.view": "查看 POS",
  "pos.edit": "操作 POS",
  "inventory.view": "查看库存",
  "inventory.edit": "编辑库存",
  "dashboard.view": "仪表盘",
  "products.view": "查看商品",
  "products.edit": "编辑商品",
  "settings.view": "设置",
  "website.view": "查看网站",
  "website.edit": "编辑网站",
};

const PERM_GROUP_LABEL: Record<string, string> = {
  groupPeople: "人员",
  groupStore: "门店",
  groupOps: "运营",
  groupSite: "网站",
};

export function RoleManager({
  open, onClose,
  roles, nodes,
  upsertRole, createRole, deleteRole,
}: {
  open: boolean;
  onClose: () => void;
  roles: RoleRow[];
  nodes: OrgNode[];
  upsertRole: UseOrgGraphResult["upsertRole"];
  createRole: UseOrgGraphResult["createRole"];
  deleteRole: UseOrgGraphResult["deleteRole"];
}) {
  const [editingKey, setEditingKey] = useState<string | null>(roles[0]?.key ?? null);
  const editing = editingKey ? roles.find((r) => r.key === editingKey) ?? null : null;

  const usage = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of nodes) {
      if (n.kind === "person") c[(n as PersonNode).role] = (c[(n as PersonNode).role] || 0) + 1;
    }
    return c;
  }, [nodes]);

  async function patch(p: Partial<RoleRow>) {
    if (!editing) return;
    await upsertRole(editing.key, p);
  }

  async function togglePerm(pid: string, on: boolean) {
    if (!editing) return;
    const next = on ? [...editing.perms, pid] : editing.perms.filter((id) => id !== pid);
    await patch({ perms: next });
  }

  async function handleAdd() {
    const key = await createRole();
    if (key) setEditingKey(key);
  }

  async function handleDelete(key: string) {
    const r = roles.find((x) => x.key === key);
    if (!r) return;
    const count = usage[key] || 0;
    const ok = count > 0
      ? confirm(`有 ${count} 名成员正在使用「${r.name}」。删除后他们会回退为「员工」。继续？`)
      : confirm(`删除角色「${r.name}」？`);
    if (!ok) return;
    await deleteRole(key);
    if (editingKey === key) setEditingKey(roles.find((x) => x.key !== key)?.key ?? null);
  }

  return (
    <DynamicUIElement open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DynamicUIElementContent className="sm:max-w-[840px] sm:h-[600px] flex flex-col p-0 overflow-hidden">
        <DynamicUIElementHeader className="px-5 py-3.5 border-b border-border">
          <DynamicUIElementTitle mobileTitle="岗位角色">岗位角色 · Roles</DynamicUIElementTitle>
          <DynamicUIElementDescription>
            编辑各岗位的颜色与默认权限。修改不会影响已分配此角色的成员。
          </DynamicUIElementDescription>
        </DynamicUIElementHeader>

        <div className="flex-1 min-h-0 flex">
          {/* Left list */}
          <div className="w-[260px] border-r border-border flex flex-col">
            <div className="flex-1 overflow-y-auto py-1">
              {roles.map((r) => {
                const sel = r.key === editingKey;
                return (
                  <button
                    key={r.key}
                    onClick={() => setEditingKey(r.key)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                      sel ? "bg-muted/60" : "hover:bg-muted/40",
                    )}
                  >
                    <span
                      className="h-7 w-7 rounded-[0.3rem] inline-flex items-center justify-center text-white font-semibold text-[11px] shrink-0"
                      style={{ background: r.color }}
                    >
                      {(r.name || "?").slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="text-[12.5px] font-medium text-stone-800 dark:text-stone-100 truncate">{r.name}</div>
                        {r.isBuiltin && (
                          <span className="text-[8.5px] uppercase tracking-wider font-mono text-stone-400 shrink-0">内置</span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-muted-foreground truncate">{r.perms.length} 权限</div>
                    </div>
                    <span className="text-[9.5px] font-mono text-muted-foreground tabular-nums shrink-0">{usage[r.key] || 0}</span>
                  </button>
                );
              })}
            </div>
            <div className="px-3 py-2 border-t border-border">
              <Button
                onClick={handleAdd}
                size="sm"
                className="w-full h-8 rounded-[0.3rem] text-[12px]"
              >
                <Plus className="h-3 w-3" strokeWidth={1.75} />
                新增角色
              </Button>
            </div>
          </div>

          {/* Right editor */}
          {!editing ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-[12.5px]">
              选择左侧角色或新增一个
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-w-0">
              <div className="px-5 py-3.5 border-b border-border flex items-center gap-3">
                <span
                  className="h-10 w-10 rounded-[0.3rem] inline-flex items-center justify-center text-white font-semibold text-[14px] shrink-0"
                  style={{ background: editing.color }}
                >
                  {(editing.name || "?").slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <div className="text-[14px] font-semibold tracking-[-0.01em]">{editing.name}</div>
                    {editing.isBuiltin ? (
                      <span className="text-[9.5px] uppercase tracking-wider font-mono text-stone-400">内置角色</span>
                    ) : (
                      <Badge variant="outline" className="h-4 px-1 text-[9px] rounded-[0.2rem] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50">自定义</Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{usage[editing.key] || 0} 人正在使用 · key {editing.key}</div>
                </div>
                {!editing.isBuiltin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(editing.key)}
                    className="h-8 px-2.5 text-[12px] rounded-[0.3rem] text-destructive border-destructive/30 hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" strokeWidth={1.75} />
                    删除
                  </Button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Name + color */}
                <div className="px-5 py-4 border-b border-border grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <div className="text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground mb-1">名称</div>
                    <Input
                      value={editing.name}
                      onChange={(e) => patch({ name: e.target.value })}
                      className="h-8 text-[12.5px]"
                    />
                  </div>
                  <div className="col-span-2">
                    <div className="text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground mb-1">描述</div>
                    <Input
                      value={editing.description}
                      onChange={(e) => patch({ description: e.target.value })}
                      placeholder="一句话说明此岗位"
                      className="h-8 text-[12.5px]"
                    />
                  </div>
                  <div className="col-span-2">
                    <div className="text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground mb-1.5">颜色</div>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {ROLE_COLOR_SWATCHES.map((c) => (
                        <button
                          key={c}
                          onClick={() => patch({ color: c })}
                          className={cn(
                            "h-7 w-7 rounded-[0.3rem] transition-transform",
                            c === editing.color ? "ring-2 ring-offset-2 ring-foreground scale-105" : "hover:scale-105",
                          )}
                          style={{ background: c }}
                          title={c}
                        />
                      ))}
                      <label className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                        <input
                          type="color"
                          value={editing.color}
                          onChange={(e) => patch({ color: e.target.value })}
                          className="h-7 w-9 rounded-[0.3rem] border border-border cursor-pointer"
                        />
                        <span className="font-mono">{editing.color}</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Default permissions */}
                <div className="px-5 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-[12.5px] font-semibold text-stone-800 dark:text-stone-100">默认权限</div>
                      <div className="text-[10.5px] text-muted-foreground">分配此角色时套用，可单独调整每个成员</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10.5px] font-mono text-muted-foreground tabular-nums">{editing.perms.length} / {ORG_PERMS_FLAT.length}</span>
                      <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px] rounded-[0.2rem]" onClick={() => patch({ perms: ORG_PERMS_FLAT.map((p) => p.id) })}>全选</Button>
                      <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px] rounded-[0.2rem]" onClick={() => patch({ perms: [] })}>清空</Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {ORG_PERMS.map((g) => (
                      <div key={g.group} className="mb-1.5">
                        <div className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground mb-0.5">{PERM_GROUP_LABEL[g.i18nKey] ?? g.group}</div>
                        {g.items.map((p: PermLeaf) => {
                          const checked = editing.perms.includes(p.id);
                          return (
                            <label key={p.id} className="flex items-start gap-2 py-1 px-1 rounded-[0.3rem] hover:bg-muted/40 cursor-pointer">
                              <Checkbox checked={checked} onCheckedChange={(v) => togglePerm(p.id, !!v)} className="mt-[3px]" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-[12px] text-stone-800 dark:text-stone-100">{PERM_LABEL[p.id] ?? p.id}</span>
                                  {p.sensitive && (
                                    <Badge variant="outline" className="h-4 px-1 text-[9px] rounded-[0.2rem] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50">敏感</Badge>
                                  )}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-muted/30">
                <div className="text-[11px] text-muted-foreground">
                  修改默认权限不会影响已分配此角色的成员；可在成员卡的右侧用「重置为角色默认」套用最新设置。
                </div>
                <Button size="sm" onClick={() => { toast.success("已保存"); onClose(); }} className="h-8 px-3 text-[12px] rounded-[0.3rem]">
                  完成
                </Button>
              </div>
            </div>
          )}
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
