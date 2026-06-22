import type { MerchivaSkill, QAItem } from "../types";
import { extractBalancedArray } from "../utils";

interface AskData {
  questions: QAItem[];
}

function parseAskCommands(text: string): { cleanText: string; data: AskData | null } {
  const questions: QAItem[] = [];
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
          if (item.q && Array.isArray(item.a)) {
            questions.push({ q: String(item.q), a: item.a.map(String) });
          }
        }
        matches.push({ start: m.index, end });
      }
    } catch {}
  }
  for (let i = matches.length - 1; i >= 0; i--) {
    cleanText = cleanText.slice(0, matches[i].start) + cleanText.slice(matches[i].end);
  }
  return { cleanText: cleanText.trim(), data: questions.length > 0 ? { questions } : null };
}

export const askSkill: MerchivaSkill<AskData> = {
  id: "ask",
  title: "Ask",
  description: "Render structured clarification questions as clickable choices.",
  category: "workflow",
  enabledByDefault: true,
  parse: parseAskCommands,
  promptSegment: `Q&A COMMAND:
When you need the user to choose between options or answer a question, output a /ask command with a JSON array.
Format: /ask '[{"q":"Your question here?","a":["Option A","Option B","Option C"]}]'
You can ask multiple questions at once: /ask '[{"q":"Q1?","a":["A","B"]},{"q":"Q2?","a":["X","Y","Z"]}]'
The user will see clickable buttons for each option. Their choice will be sent back as a message.
Use this when:
- You need clarification before taking action
- Offering the user a choice (e.g. which supplier, which shift type, which product)
- Confirming preferences`,
};
