import type { MerchivaSkill, QAItem } from "../types";
import { extractBalancedArray } from "../utils";

interface AskData {
  questions: QAItem[];
}

/** A choice card needs at least this many options; below it there is nothing to pick. */
const MIN_OPTIONS = 2;

/**
 * Parses `/ask '[{"q":…,"a":[…]}]'` into choice cards. A question with fewer
 * than two options is not a choice: it would render as a card with only
 * "Other…" and a disabled submit, so it is kept as a plain-text line instead.
 */
function parseAskCommands(text: string): { cleanText: string; data: AskData | null } {
  const questions: QAItem[] = [];
  const asText: string[] = [];
  let cleanText = text;
  const askRe = /\/ask\s+['"`]?(?=\[)/g;
  const matches: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = askRe.exec(text)) !== null) {
    const bracketStart = text.indexOf("[", m.index + m[0].length - 1);
    if (bracketStart === -1) continue;
    const json = extractBalancedArray(text, bracketStart);
    if (!json) continue;
    let end = bracketStart + json.length;
    if (end < text.length && /['"`]/.test(text[end])) end++;
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item?.q) continue;
          const options = Array.isArray(item.a) ? item.a.map(String).map((a: string) => a.trim()).filter(Boolean) : [];
          if (options.length >= MIN_OPTIONS) questions.push({ q: String(item.q), a: options });
          else asText.push(String(item.q).trim());
        }
        matches.push({ start: m.index, end });
      }
    } catch {}
  }
  for (let i = matches.length - 1; i >= 0; i--) {
    cleanText = cleanText.slice(0, matches[i].start) + cleanText.slice(matches[i].end);
  }
  cleanText = [cleanText.trim(), ...asText].filter(Boolean).join("\n\n");
  return { cleanText, data: questions.length > 0 ? { questions } : null };
}

export const askSkill: MerchivaSkill<AskData> = {
  id: "ask",
  title: "Ask",
  description: "Render structured clarification questions as clickable choices.",
  category: "workflow",
  enabledByDefault: true,
  parse: parseAskCommands,
  promptSegment: `Q&A COMMAND (choice cards):
Use /ask ONLY when the user must pick between 2–6 concrete options — which supplier, which role, which shift. Every question needs 2–6 options.
Format: /ask '[{"q":"Which role should Ann work?","a":["Barista","Cashier"]}]'
Several choices at once: /ask '[{"q":"Q1?","a":["A","B"]},{"q":"Q2?","a":["X","Y","Z"]}]'
The user sees a button per option; their pick comes back as a message.
Never use /ask for free-form information (a name, a date, an amount, availability) — ask that in one short sentence of plain text. Never ask for ids, codes or anything you can look up with your tools, and never ask before an action you can simply propose as an action block.`,
};
