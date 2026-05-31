"use client";

import { useMemo } from "react";
import { Building, LayoutGrid, Map as MapIcon, MousePointerClick, Settings2, Store, Trash2, User, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import {
  ORG_GROUP_PRESETS,
  ORG_PERMS,
  ORG_PERMS_FLAT,
  initials,
  type EdgeLayout,
  type GroupNode,
  type OrgNode,
  type PermLeaf,
  type PersonNode,
} from "./data";
import type { RoleRow } from "./use-org-graph";

const GROUP_ICON_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  store: Store,
  map: MapIcon,
  building: Building,
  "users-round": Users,
};

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

const GROUP_KIND_LABEL: Record<string, string> = {
  store: "门店团队",
  region: "区域团队",
  ops: "总部",
  custom: "自定义",
};

interface InspectorProps {
  node: OrgNode | null;
  edges: EdgeLayout[];
  nodes: OrgNode[];
  roles: RoleRow[];
  isMobile: boolean;
  canEdit: boolean;
  onUpdateNode: (id: string, patch: Partial<PersonNode> & Partial<GroupNode> & { role?: string; perms?: string[] }) => void;
  onDeleteNode: (id: string) => void;
  onSelect: (id: string) => void;
  onTidyGroup: (id: string) => void;
  onOpenRoleManager: () => void;
  onClose: () => void;
  onOpenEditMember?: (member: PersonNode) => void;
  onRemoveMember?: (member: PersonNode) => void;
}

export function Inspector({
  node, edges, nodes, roles,
  isMobile, canEdit,
  onUpdateNode, onDeleteNode, onSelect,
  onTidyGroup, onOpenRoleManager, onClose,
  onOpenEditMember, onRemoveMember,
}: InspectorProps) {
  const rolesByKey = useMemo(() => Object.fromEntries(roles.map((r) => [r.key, r])), [roles]);

  if (!node) {
    if (isMobile) return null;
    return (
      <aside className="w-[340px] shrink-0 border-l border-border bg-background flex flex-col">
        <div className="px-5 py-5 text-[12.5px] text-muted-foreground leading-relaxed">
          <div className="flex items-center gap-2 text-stone-700 dark:text-stone-200 font-semibold text-[13px] mb-2">
            <MousePointerClick className="h-3.5 w-3.5" strokeWidth={1.75} />
            选择一个节点
          </div>
          点击画布上的人员卡或团队组以查看和编辑权限。<br />
          拖动卡片底部的圆点连接到另一个节点，建立&ldquo;管理&rdquo;关系。
          <div className="mt-5 grid grid-cols-2 gap-2 text-[11px]">
            <Tip title="拖人到组" body="放到虚线框内即加入" />
            <Tip title="拖组头" body="整组一起搬走" />
            <Tip title="scroll" body="缩放" />
            <Tip title="点连线" body="删除连接" />
          </div>
        </div>
      </aside>
    );
  }

  const isGroup = node.kind === "group";
  const permSet = new Set(node.perms);
  const role = isGroup ? null : (rolesByKey[(node as PersonNode).role] ?? roles[0]);
  const preset = isGroup ? (ORG_GROUP_PRESETS[(node as GroupNode).groupKind] || ORG_GROUP_PRESETS.custom) : null;
  const PresetIcon = preset ? (GROUP_ICON_MAP[preset.icon] || Users) : Users;
  const groupMembers = isGroup
    ? nodes.filter((n): n is PersonNode => n.kind === "person" && n.groupId === node.id)
    : [];
  const managers = edges.filter((e) => e.to === node.id).map((e) => nodes.find((n) => n.id === e.from)).filter(Boolean) as OrgNode[];
  const reports = edges.filter((e) => e.from === node.id).map((e) => nodes.find((n) => n.id === e.to)).filter(Boolean) as OrgNode[];

  const togglePerm = (pid: string, on: boolean) => {
    if (!canEdit) return;
    const next = on ? [...node.perms, pid] : node.perms.filter((p) => p !== pid);
    onUpdateNode(node.id, { perms: next });
  };

  const baseAside = (
    <>
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-border flex items-center gap-3">
        {isGroup ? (
          <div className="h-10 w-10 rounded-[0.3rem] inline-flex items-center justify-center text-white shrink-0" style={{ background: preset!.color }}>
            <PresetIcon className="h-4 w-4" strokeWidth={1.75} />
          </div>
        ) : (
          <div
            className="h-10 w-10 rounded-full inline-flex items-center justify-center font-semibold text-[12px] shrink-0"
            style={{ background: (role?.color ?? "#78716c") + "20", color: role?.color ?? "#78716c" }}
          >
            {initials(node.name)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <Input
            value={node.name}
            onChange={(e) => onUpdateNode(node.id, { name: e.target.value })}
            disabled={!canEdit || !isGroup}
            className="h-7 text-[14px] font-semibold tracking-[-0.01em] border-0 px-1 -mx-1 bg-transparent focus-visible:bg-muted/40 focus-visible:ring-0"
          />
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {isGroup
              ? `${GROUP_KIND_LABEL[(node as GroupNode).groupKind] ?? "Group"} · ${groupMembers.length} 人`
              : `${role?.name ?? ""} · ${(node as PersonNode).email}`}
          </div>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} title="关闭" className="rounded-[0.2rem]">
          <X strokeWidth={1.75} />
        </Button>
      </div>

      {/* Person body */}
      {!isGroup ? (
        <div className="px-4 py-3 border-b border-border space-y-2.5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground">岗位角色</div>
              <button
                onClick={onOpenRoleManager}
                className="text-[10.5px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <Settings2 className="h-2.5 w-2.5" strokeWidth={1.75} />
                管理角色
              </button>
            </div>
            <Select
              value={(node as PersonNode).role}
              onValueChange={(v) => {
                if (v == null) return;
                const r = rolesByKey[v];
                if (!r) return;
                onUpdateNode(node.id, { role: v, perms: r.perms.length > 0 ? r.perms : node.perms });
              }}
              disabled={!canEdit}
            >
              <SelectTrigger className="h-8 text-[12.5px] w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.key} value={r.key} className="text-[12.5px]">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                      {r.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground mb-1">状态</div>
              <div className="h-8 px-2 inline-flex items-center text-[12.5px] rounded-[0.3rem] border border-border bg-muted/30 w-full">
                {(node as PersonNode).status === "active" ? "在职"
                  : (node as PersonNode).status === "invited" ? "待入职"
                  : "已停用"}
              </div>
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground mb-1">所在组</div>
              <Select
                value={(node as PersonNode).groupId ?? "__none"}
                onValueChange={(v) => {
                  if (v == null) return;
                  onUpdateNode(node.id, { groupId: v === "__none" ? null : v });
                }}
                disabled={!canEdit}
              >
                <SelectTrigger className="h-8 text-[12.5px] w-full">
                  <SelectValue placeholder="— 无组 —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— 无组 —</SelectItem>
                  {nodes.filter((n): n is GroupNode => n.kind === "group").map((g) => (
                    <SelectItem key={g.id} value={g.id} className="text-[12.5px]">{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <div className="text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground mb-1">邮箱</div>
            <Input value={(node as PersonNode).email} readOnly disabled className="font-mono h-8 text-[12.5px]" />
          </div>

          {onOpenEditMember && canEdit && !node.id.startsWith("inv-") && (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-[12px] rounded-[0.3rem]"
              onClick={() => onOpenEditMember(node as PersonNode)}
            >
              在弹窗中编辑（角色/权限/移除）
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="px-4 py-3 border-b border-border space-y-2.5">
            <div>
              <div className="text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground mb-1">类型</div>
              <Select
                value={(node as GroupNode).groupKind}
                onValueChange={(v) => {
                  if (v == null) return;
                  onUpdateNode(node.id, { groupKind: v as GroupNode["groupKind"] });
                }}
              >
                <SelectTrigger className="h-8 text-[12.5px] w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="store">门店团队</SelectItem>
                  <SelectItem value="region">区域团队</SelectItem>
                  <SelectItem value="ops">总部</SelectItem>
                  <SelectItem value="custom">自定义</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground mb-1">描述</div>
              <Input
                value={(node as GroupNode).desc}
                onChange={(e) => onUpdateNode(node.id, { desc: e.target.value })}
                placeholder="给这个组写一句说明"
                className="h-8 text-[12.5px]"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onTidyGroup(node.id)}
              className="w-full h-8 text-[12px] rounded-[0.3rem]"
            >
              <LayoutGrid className="h-3 w-3" strokeWidth={1.75} />
              整理成员排列
            </Button>
          </div>
          <div className="px-4 py-3 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground">成员</div>
              <span className="text-[10.5px] font-mono text-muted-foreground tabular-nums">{groupMembers.length}</span>
            </div>
            {groupMembers.length === 0 ? (
              <div className="text-[11.5px] text-muted-foreground italic">还没有成员 · 把人员卡拖到这个组里</div>
            ) : (
              <ul className="space-y-0.5 -mx-1">
                {groupMembers.map((m) => {
                  const r = rolesByKey[m.role] ?? roles[0];
                  return (
                    <li key={m.id}>
                      <button
                        onClick={() => onSelect(m.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[0.3rem] hover:bg-muted/40 text-left"
                      >
                        <div
                          className="h-6 w-6 rounded-full inline-flex items-center justify-center font-semibold text-[9.5px] shrink-0"
                          style={{ background: (r?.color ?? "#78716c") + "20", color: r?.color ?? "#78716c" }}
                        >
                          {initials(m.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12px] font-medium text-stone-800 dark:text-stone-100 truncate">{m.name}</div>
                          <div className="text-[10.5px] text-muted-foreground truncate">{r?.name ?? ""} · {m.email}</div>
                        </div>
                        {m.status === "invited" && (
                          <Badge variant="outline" className="h-4 px-1 text-[9px] rounded-[0.2rem] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50">
                            待入职
                          </Badge>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {/* Relationships */}
      <div className="px-4 py-3 border-b border-border grid grid-cols-2 gap-3 text-[11.5px]">
        <div>
          <div className="text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground mb-1.5">↑ 谁管它 · {managers.length}</div>
          {managers.length === 0 ? <div className="text-stone-400 italic">无</div> : (
            <ul className="space-y-1">
              {managers.map((m) => (
                <li key={m.id}>
                  <button onClick={() => onSelect(m.id)} className="flex items-center gap-1.5 text-stone-700 dark:text-stone-200 hover:text-foreground truncate w-full text-left">
                    {m.kind === "group" ? <Users className="h-2.5 w-2.5 text-stone-400 shrink-0" strokeWidth={1.75} /> : <User className="h-2.5 w-2.5 text-stone-400 shrink-0" strokeWidth={1.75} />}
                    <span className="truncate">{m.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-wider font-mono text-muted-foreground mb-1.5">↓ 它管谁 · {reports.length}</div>
          {reports.length === 0 ? <div className="text-stone-400 italic">无</div> : (
            <ul className="space-y-1">
              {reports.map((m) => (
                <li key={m.id}>
                  <button onClick={() => onSelect(m.id)} className="flex items-center gap-1.5 text-stone-700 dark:text-stone-200 hover:text-foreground truncate w-full text-left">
                    {m.kind === "group" ? <Users className="h-2.5 w-2.5 text-stone-400 shrink-0" strokeWidth={1.75} /> : <User className="h-2.5 w-2.5 text-stone-400 shrink-0" strokeWidth={1.75} />}
                    <span className="truncate">{m.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Permissions */}
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 px-4 pt-3 pb-2 bg-background border-b border-border z-10">
          <div className="flex items-center justify-between">
            <div className="text-[12.5px] font-semibold text-stone-800 dark:text-stone-100">权限 · Permissions</div>
            <div className="text-[10.5px] font-mono text-muted-foreground tabular-nums">{permSet.size} / {ORG_PERMS_FLAT.length}</div>
          </div>
          {canEdit && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px] rounded-[0.2rem]" onClick={() => onUpdateNode(node.id, { perms: ORG_PERMS_FLAT.map((p) => p.id) })}>全选</Button>
              <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px] rounded-[0.2rem]" onClick={() => onUpdateNode(node.id, { perms: [] })}>清空</Button>
              {!isGroup && (role?.perms.length ?? 0) > 0 && (
                <Button variant="outline" size="sm" className="h-6 px-2 text-[10.5px] rounded-[0.2rem]" onClick={() => onUpdateNode(node.id, { perms: role!.perms })}>
                  重置为角色默认
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="px-2 py-2">
          {ORG_PERMS.map((g) => (
            <div key={g.group} className="mb-2">
              <div className="px-2 pt-1 pb-1 text-[10px] uppercase tracking-wider font-mono text-muted-foreground">{PERM_GROUP_LABEL[g.i18nKey] ?? g.group}</div>
              {g.items.map((p: PermLeaf) => (
                <label
                  key={p.id}
                  className={cn(
                    "flex items-start gap-2.5 py-1.5 px-2 rounded-[0.3rem] hover:bg-muted/40 cursor-pointer",
                    !canEdit && "cursor-default",
                  )}
                >
                  <Checkbox
                    checked={permSet.has(p.id)}
                    disabled={!canEdit}
                    onCheckedChange={(v) => togglePerm(p.id, !!v)}
                    className="mt-[2px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-medium text-stone-800 dark:text-stone-100">{PERM_LABEL[p.id] ?? p.id}</span>
                      {p.sensitive && (
                        <Badge variant="outline" className="h-4 px-1 text-[9px] rounded-[0.2rem] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900/50">敏感</Badge>
                      )}
                    </div>
                  </div>
                  <span className="text-[9.5px] uppercase font-mono text-stone-400 mt-1 shrink-0">{p.id}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex items-center gap-2">
        {isGroup ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => { if (confirm(`删除分组 ${node.name}？所有连接也会被删除。`)) onDeleteNode(node.id); }}
            className="h-8 px-2.5 text-[12px] rounded-[0.3rem] text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3" strokeWidth={1.75} />
            删除分组
          </Button>
        ) : onRemoveMember && canEdit && !node.id.startsWith("inv-") && (node as PersonNode).orgRole !== "owner" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRemoveMember(node as PersonNode)}
            className="h-8 px-2.5 text-[12px] rounded-[0.3rem] text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3" strokeWidth={1.75} />
            移除成员
          </Button>
        )}
        <div className="ml-auto text-[10.5px] font-mono text-muted-foreground truncate">{node.id}</div>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={!!node} onOpenChange={(o) => { if (!o) onClose(); }} direction="bottom">
        <DrawerContent className="bg-background max-h-[85vh]">
          <DrawerTitle className="sr-only">{node.name}</DrawerTitle>
          <DrawerDescription className="sr-only">编辑节点权限与信息</DrawerDescription>
          {baseAside}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <aside className="w-[340px] shrink-0 border-l border-border bg-background flex flex-col">
      {baseAside}
    </aside>
  );
}

function Tip({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-border rounded-[0.3rem] p-2.5">
      <div className="font-mono text-muted-foreground uppercase tracking-wider text-[9.5px] mb-1">{title}</div>
      <div className="text-stone-700 dark:text-stone-200">{body}</div>
    </div>
  );
}
