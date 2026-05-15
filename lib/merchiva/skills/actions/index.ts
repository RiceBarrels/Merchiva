import type { MerchivaSkill, PendingAction } from "../types";
import { getAction, generateActionsPrompt } from "@/lib/merchiva/action-registry";
import { toast } from "sonner";

interface ActionsData {
  actions: Record<string, unknown>[];
  listAll: boolean;
}

// Walk text and pull out every action JSON object — fenced (```action {...}```),
// bare ("action {...}"), or a standalone JSON object containing "action": "...".
// Uses brace counting so nested objects/arrays survive (regex with [^{}] does not).
// Also strips matched ranges out of cleanText so they don't show as raw text.
export function extractActionBlocks(text: string): {
  actions: Record<string, unknown>[];
  cleanText: string;
} {
  const actions: Record<string, unknown>[] = [];
  const out: string[] = [];
  let i = 0;

  function readJsonObject(start: number): number {
    if (text[start] !== "{") return -1;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let j = start; j < text.length; j++) {
      const ch = text[j];
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return j + 1;
      }
    }
    return -1;
  }

  while (i < text.length) {
    const rest = text.slice(i);

    // ```action ... ```
    const fenced = rest.match(/^```action\b\s*\n?/);
    if (fenced) {
      const afterTag = i + fenced[0].length;
      const objStart = text.indexOf("{", afterTag);
      if (objStart !== -1 && /^\s*$/.test(text.slice(afterTag, objStart))) {
        const objEnd = readJsonObject(objStart);
        if (objEnd !== -1) {
          try {
            const obj = JSON.parse(text.slice(objStart, objEnd));
            if (obj && obj.action) actions.push(obj);
          } catch (e) {
            console.warn("[parseActions] fenced JSON parse failed:", text.slice(objStart, objEnd).slice(0, 100), e);
          }
          // Skip optional closing ``` (may be missing if stream truncated)
          let after = objEnd;
          const closing = text.slice(after).match(/^\s*```/);
          if (closing) after += closing[0].length;
          i = after;
          continue;
        }
      }
      // Unclosed/malformed — drop the rest of the text rather than show partial JSON
      i = text.length;
      continue;
    }

    // bare:  action {"action": "...", ...}    (model sometimes omits backticks)
    const bare = rest.match(/^action\s+(?=\{)/);
    if (bare) {
      const objStart = i + bare[0].length;
      const objEnd = readJsonObject(objStart);
      if (objEnd !== -1) {
        try {
          const obj = JSON.parse(text.slice(objStart, objEnd));
          if (obj && obj.action) actions.push(obj);
          i = objEnd;
          continue;
        } catch {}
      }
      // Bare keyword that didn't parse — drop to end so we don't show JSON noise
      i = text.length;
      continue;
    }

    // Standalone JSON: { "action": "name", ... } — must be a complete top-level object
    if (rest.startsWith("{")) {
      const objEnd = readJsonObject(i);
      if (objEnd !== -1) {
        const candidate = text.slice(i, objEnd);
        if (/"action"\s*:\s*"/.test(candidate)) {
          try {
            const obj = JSON.parse(candidate);
            if (obj && obj.action) {
              actions.push(obj);
              i = objEnd;
              continue;
            }
          } catch {}
        }
      }
    }

    out.push(text[i]);
    i++;
  }

  return { actions, cleanText: out.join("").trim() };
}

function parseActions(text: string): { cleanText: string; data: ActionsData | null } {
  const { actions, cleanText: stripped } = extractActionBlocks(text);
  let listAll = false;
  const cleanText = stripped.replace(/\/actions?\s+(?:list(?:\s+all)?|all)\b/gi, () => {
    listAll = true;
    return "";
  }).trim();

  return { cleanText, data: actions.length > 0 || listAll ? { actions, listAll } : null };
}

export async function executeAction(act: Record<string, unknown>): Promise<void> {
  const actionName = String(act.action ?? "unknown");
  const def = getAction(actionName);

  if (!def) {
    toast.error(`Action "${actionName}" not recognized`);
    throw new Error(`Action not recognized: ${actionName}`);
  }

  try {
    await def.execute(act);
    toast.success(def.toastMessage(act));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    toast.error(`Action failed: ${msg}`);
    throw err;
  }
}

export function toPendingActions(actions: Record<string, unknown>[]): PendingAction[] {
  return actions.map((a, i) => ({
    id: `act-${Date.now()}-${i}`,
    action: a,
    status: "pending" as const,
  }));
}

export const actionsSkill: MerchivaSkill<ActionsData> = {
  id: "actions",
  parse: parseActions,
  get promptSegment() {
    return generateActionsPrompt();
  },
};
