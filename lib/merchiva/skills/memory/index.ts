import type { MerchivaSkill } from "../types";

// Memory skill doesn't parse AI output — it manages context sent TO the AI
export const memorySkill: MerchivaSkill<null> = {
  id: "memory",
  title: "Memory",
  description: "Persist durable store facts and user preferences from assistant output.",
  category: "memory",
  enabledByDefault: true,
  parse: (text: string) => ({ cleanText: text, data: null }),
  promptSegment: `MEMORY SYSTEM:
You have access to persistent memory about this store and user:
- CONVERSATION SUMMARY: A compressed summary of all past conversations. Use it for continuity.
- STORE OVERVIEW: Key facts about the store (business type, operating hours, priorities, etc.)
- USER PREFERENCES: How the user likes to interact (language, detail level, areas of focus).

When you learn something important about the store or user preferences that should persist, output a memory command:
- /memory store_overview '<text>' — update the store overview with new facts
- /memory user_preferences '<text>' — update user preferences

Only update these when you learn genuinely new, persistent information — not every message.
Examples:
- /memory store_overview 'Coffee shop in downtown Seattle. Opens 6am-9pm. 8 staff. Peak hours 7-9am and 12-2pm. Uses Square POS.'
- /memory user_preferences 'Prefers Chinese responses. Wants detailed inventory alerts. Focuses on staffing optimization.'`,
};

interface MemoryUpdate {
  field: "storeOverview" | "userPreferences";
  value: string;
}

export function parseMemoryCommands(text: string): { cleanText: string; updates: MemoryUpdate[] } {
  const updates: MemoryUpdate[] = [];

  let cleaned = text.replace(/\/memory\s+store_overview\s+['"`]([\s\S]*?)['"`]/g, (_m, val) => {
    updates.push({ field: "storeOverview", value: val.trim() });
    return "";
  });

  cleaned = cleaned.replace(/\/memory\s+user_preferences\s+['"`]([\s\S]*?)['"`]/g, (_m, val) => {
    updates.push({ field: "userPreferences", value: val.trim() });
    return "";
  });

  return { cleanText: cleaned.trim(), updates };
}
