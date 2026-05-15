import type { MerchivaSkill, RoleAddCmd } from "../types";
import { extractBalancedObject } from "../utils";

interface RolesData {
  rolesAdd: RoleAddCmd[];
  rolesList: boolean;
}

function parseRolesCommands(text: string): { cleanText: string; data: RolesData | null } {
  const rolesAdd: RoleAddCmd[] = [];
  let rolesList = false;
  const removals: { start: number; end: number }[] = [];

  const addRe = /\/roles\s+add\s+['"`]?(?=\{)/g;
  let m: RegExpExecArray | null;
  while ((m = addRe.exec(text)) !== null) {
    const braceStart = text.indexOf("{", m.index + m[0].length - 1);
    if (braceStart === -1) continue;
    const json = extractBalancedObject(text, braceStart);
    if (!json) continue;
    let end = braceStart + json.length;
    if (end < text.length && /['"`]/.test(text[end])) end++;
    try {
      const parsed = JSON.parse(json);
      if (parsed.title) {
        rolesAdd.push({
          title: String(parsed.title ?? ""),
          des: String(parsed.des ?? parsed.description ?? ""),
          tasks: String(parsed.tasks ?? ""),
          icon: String(parsed.icon ?? "user"),
          color: String(parsed.color ?? "#44403c"),
        });
        removals.push({ start: m.index, end });
      }
    } catch {}
  }

  const listRe = /\/roles\s+list/g;
  while ((m = listRe.exec(text)) !== null) {
    rolesList = true;
    removals.push({ start: m.index, end: m.index + m[0].length });
  }

  let cleaned = text;
  removals.sort((a, b) => b.start - a.start);
  for (const r of removals) {
    cleaned = cleaned.slice(0, r.start) + cleaned.slice(r.end);
  }

  const hasData = rolesAdd.length > 0 || rolesList;
  return { cleanText: cleaned.trim(), data: hasData ? { rolesAdd, rolesList } : null };
}

export const rolesSkill: MerchivaSkill<RolesData> = {
  id: "roles",
  parse: parseRolesCommands,
  promptSegment: `LEGACY ROLES COMMANDS (prefer action blocks instead):
- /roles list — displays all current staff roles as visual cards.
- /roles add '{"title":"...","des":"...","tasks":"...","icon":"...","color":"..."}' — legacy format, still supported.
PREFERRED: Use action blocks for role management — addRole, updateRole, deleteRole, addRoleTask, updateRoleTask, deleteRoleTask.`,
};

