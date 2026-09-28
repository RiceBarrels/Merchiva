/**
 * How the scenario eval (merchiva-scenarios.ts) reads a Mr. Merchiva reply and judges it.
 *
 * A reply is parsed the way the chat client parses a finished ai_job (contract C): the ack
 * sentinel first, then the tool frames, then the text, whose action blocks and /ask cards go
 * through the app's own parsers (lib/merchiva/skills). Everything else is a small detector for one
 * failure the user reported: asking for an id or a code, an /ask card with no options, a
 * prerequisite nobody asked for.
 */

import { ACK_CLOSE, ACK_OPEN } from "@/lib/ai/reply-text";
import { getAction } from "@/lib/merchiva/action-registry";
import { extractActionBlocks } from "@/lib/merchiva/skills/actions";
import { parseAllSkills } from "@/lib/merchiva/skills/registry";
import { extractBalancedArray } from "@/lib/merchiva/skills/utils";
import { splitToolEvents, type ToolEvent } from "@/lib/merchiva/tool-events";

export type ActionBlock = Record<string, unknown>;

export interface ParsedReply {
  ack: string;
  events: ToolEvent[];
  /** The reply text with the ack and tool frames removed (what the client feeds its parsers). */
  text: string;
  /** Text left once action blocks, /ask cards and commands are taken out. */
  cleanText: string;
  /** cleanText with typographic spaces and hyphens made plain, for matching names, dates and numbers. */
  prose: string;
  /** Every action block, addRole and addRoleTask included, in reply order. */
  actions: ActionBlock[];
  /** ```action fences in the text; more than `actions` means a block the client drops as unparseable. */
  actionFences: number;
  /** /ask choice cards the client would render. */
  questions: Array<{ q: string; a: string[] }>;
  /** /ask questions with fewer than two options — the card the user saw with only "其他…". */
  emptyAsks: string[];
}

/** The chat client's splitAck (components/merchiva-chat-dashboard.tsx). */
function splitAck(raw: string): { ack: string; rest: string } {
  if (!raw.startsWith(ACK_OPEN)) return { ack: "", rest: raw };
  const close = raw.indexOf(ACK_CLOSE);
  if (close === -1) return { ack: raw.slice(ACK_OPEN.length), rest: "" };
  return { ack: raw.slice(ACK_OPEN.length, close), rest: raw.slice(close + ACK_CLOSE.length) };
}

function optionlessAsks(text: string): string[] {
  const out: string[] = [];
  const re = /\/ask\s+['"`]?(?=\[)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const json = extractBalancedArray(text, text.indexOf("[", m.index));
    if (!json) {
      out.push("(unterminated /ask)");
      continue;
    }
    try {
      const items: unknown = JSON.parse(json);
      for (const item of Array.isArray(items) ? items : []) {
        const { q, a } = (item ?? {}) as { q?: unknown; a?: unknown };
        const options = Array.isArray(a) ? a.map(String).filter((o) => o.trim()) : [];
        if (options.length < 2) out.push(String(q ?? "(no question)"));
      }
    } catch {
      out.push("(unparseable /ask JSON)");
    }
  }
  return out;
}

/**
 * The models write "Muheng Fan" with a narrow no-break space and "2026‑09‑21" with non-breaking
 * hyphens; both read the same to a person, so the checks compare plain ones.
 */
export function plainText(text: string): string {
  return text.replace(/[     　]/g, " ").replace(/[‐-―−－]/g, "-");
}

export function parseReply(raw: string): ParsedReply {
  const { ack, rest } = splitAck(raw);
  const { events, text } = splitToolEvents(rest);
  const parsed = parseAllSkills(text);
  return {
    ack,
    events,
    text,
    cleanText: parsed.cleanText,
    prose: plainText(parsed.cleanText),
    actions: extractActionBlocks(text).actions,
    actionFences: (text.match(/```action\b/g) ?? []).length,
    questions: parsed.questions,
    emptyAsks: optionlessAsks(text),
  };
}

// ── Asking ──────────────────────────────────────────────────────────────────

const ID_WORD = /\bIDs?\b|\bid\b|编号|标识|identifier|工号/i;
const CODE_WORD = /打卡码|打卡密码|\bPIN\b|punch[- ]?in code/i;
const AVAILABILITY_WORD = /可上班时间|可上班的时间|可用时间|空闲时间|可排班时间|availability/i;
const ASK_CUE =
  /请(?:你|您)?(?:提供|告诉|给出|给我|输入|发|填写|补充)|能否|可否|麻烦|需要(?:你|您)(?:提供|告诉|给)|告诉我|提供一下|是多少|please (?:provide|share|send|tell)|can you (?:give|provide|share|tell)|what(?:'s| is) (?:the|his|her|their|your)/i;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?\n])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Sentences that ask the user for an id or a code. */
export function asksForIdOrCode(text: string): string[] {
  return sentences(text).filter(
    (s) => (ID_WORD.test(s) && (ASK_CUE.test(s) || /[？?]$/.test(s))) || (CODE_WORD.test(s) && ASK_CUE.test(s)),
  );
}

/** Sentences that ask the user for availability. */
export function asksForAvailability(text: string): string[] {
  return sentences(text).filter((s) => AVAILABILITY_WORD.test(s) && (ASK_CUE.test(s) || /[？?]$/.test(s)));
}

export function mentionsPunchCode(text: string): boolean {
  return CODE_WORD.test(text);
}

const PREREQUISITE_CUE = /(?:需要|必须|得|要)先|(?:排班|安排)?之前|才能(?:排班|安排|生成)|before (?:I|we) can|first (?:need|have) to|must first/i;
const SETUP_WORD = /设置|设定|创建|录入|添加|提供|填写|配置|完成|准备|set up|create|add|enter|provide|complete/i;
const ROLE_WORD = /岗位|角色|职位|\brole\b|addRole/i;

/**
 * Sentences that put a setup step in front of the request ("需要先设置…才能排班") — the reported
 * failure. Creating the missing job role is the engine's own proposal, so role sentences pass.
 */
export function inventedPrerequisites(text: string): string[] {
  return sentences(text).filter((s) => PREREQUISITE_CUE.test(s) && SETUP_WORD.test(s) && !ROLE_WORD.test(s));
}

// ── Action blocks against the registry ──────────────────────────────────────

function typeMatches(type: string, value: unknown): boolean {
  if (type === "array") return Array.isArray(value);
  if (type === "object") return !!value && typeof value === "object" && !Array.isArray(value);
  return typeof value === type;
}

/**
 * What is wrong with one block: an unknown action, a missing required parameter, a wrong type, a
 * value outside the enum, or an id that is not one of the store's (`ids`, per parameter name).
 */
export function registryProblems(block: ActionBlock, ids: Readonly<Record<string, readonly string[]>>): string[] {
  const name = String(block.action ?? "");
  const def = getAction(name);
  if (!def) return [`unknown action "${name}"`];
  const problems: string[] = [];
  for (const [param, spec] of Object.entries(def.parameters)) {
    const value = block[param];
    const missing = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    if (missing) {
      if (spec.required) problems.push(`${name}.${param} is missing`);
      continue;
    }
    if (!typeMatches(spec.type, value)) problems.push(`${name}.${param} should be ${spec.type}, got ${JSON.stringify(value)}`);
    if (spec.enum && !spec.enum.includes(String(value))) problems.push(`${name}.${param}=${JSON.stringify(value)} is not one of ${spec.enum.join("/")}`);
    if (/Id$/.test(param) && typeof value === "string") {
      const known = ids[param];
      if (known && !known.includes(value)) problems.push(`${name}.${param}=${value} is not an id in this store`);
    }
  }
  return problems;
}

// ── Numbers and dates in prose ──────────────────────────────────────────────

/** Every number the text states, in cents (thousands separators and markdown ignored). */
export function amountsInCents(text: string): number[] {
  const plain = text.replace(/\*+/g, "").replace(/(\d),(?=\d{3}\b)/g, "$1");
  return [...plain.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Math.round(Number(m[0]) * 100));
}

/** Calendar days the text mentions, as MM-DD: 2026-09-21, 9月21日, 9/21. */
export function monthDaysMentioned(text: string): string[] {
  const out = new Set<string>();
  const add = (month: string, day: string) => {
    const mm = Number(month);
    const dd = Number(day);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) out.add(`${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`);
  };
  for (const m of text.matchAll(/\b\d{4}-(\d{2})-(\d{2})\b/g)) add(m[1], m[2]);
  for (const m of text.matchAll(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/g)) add(m[1], m[2]);
  for (const m of text.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/g)) add(m[1], m[2]);
  return [...out];
}

// ── Recording ───────────────────────────────────────────────────────────────

/** A hyphenated uuid, as the tools return ids. */
export const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

/**
 * Collects PASS/FAIL/WARN/INFO lines. Every FAIL is also a problem and fails the scenario; a WARN
 * is a defect outside what the scenario is testing, reported without failing it.
 */
export class Checker {
  readonly checks: string[] = [];
  readonly problems: string[] = [];
  readonly warnings: string[] = [];

  check(label: string, ok: boolean, detail = ""): void {
    this.checks.push(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
    if (!ok) this.problems.push(detail ? `${label}: ${detail}` : label);
  }

  warn(label: string, detail = ""): void {
    this.checks.push(`WARN ${label}${detail ? ` — ${detail}` : ""}`);
    this.warnings.push(detail ? `${label}: ${detail}` : label);
  }

  info(label: string): void {
    this.checks.push(`INFO ${label}`);
  }
}
