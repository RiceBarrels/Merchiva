import { NextRequest, NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, generateText, generateObject, stepCountIs } from "ai";
import { z } from "zod";
import { getAllPromptSegments } from "@/lib/merchiva/skills/registry";
import { recordAiUsage, normalizeUsage } from "@/lib/ai/usage";
import { languageNameFor } from "@/lib/i18n/ai-language";
import {
  buildMerchivaTools,
  buildSlimContext,
  merchivaToolsEnabled,
  TOOLS_PROMPT_BLOCK,
} from "@/lib/merchiva/tools";
import {
  buildMcpToolContext,
  closeMcpClients,
  type McpToolContext,
} from "@/lib/merchiva/mcp/ai-tools";

function getOpenRouter() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY not configured");
  return createOpenAI({
    apiKey: key,
    baseURL: "https://openrouter.ai/api/v1",
    headers: {
      "HTTP-Referer": "https://merchiva.com",
      "X-Title": "Merchiva Mr. Merchiva",
    },
  });
}

export function getModel() {
  // Standard escalation model — OSS (gpt-oss-120b). Handles the bulk of
  // "complex" requests. Override with OPENROUTER_MODEL.
  return process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b";
}

export function getOpenRouterModel() {
  return getOpenRouter().chat(getModel());
}

export function getThinkingModel() {
  // Reserved for requests the triage layer flags as needing deep reasoning.
  // Defaults to a proprietary thinking model; override with OPENROUTER_THINKING_MODEL.
  return process.env.OPENROUTER_THINKING_MODEL || "x-ai/grok-4.3";
}

function getOpenRouterThinkingModel() {
  return getOpenRouter().chat(getThinkingModel());
}

export function getFastModel() {
  return process.env.OPENROUTER_FAST_MODEL || "openai/gpt-oss-120b";
}

export function getOpenRouterFastModel() {
  return getOpenRouter().chat(getFastModel());
}

export function getVoiceModel() {
  // Voice replies also default to the OSS model; override via OPENROUTER_VOICE_MODEL.
  return process.env.OPENROUTER_VOICE_MODEL || "openai/gpt-oss-120b";
}

function getOpenRouterVoiceModel() {
  return getOpenRouter().chat(getVoiceModel());
}

// Curated kaomoji palette the triage model can pick from. Listed in the
// schema description so the model emits one verbatim. Kept short and
// mood-tagged so the model can pair the face with the reply's tone. The
// client's MerchivaWatermark uses whatever string the model returns —
// values outside this list still render fine, just less consistent.
const KAOMOJI_PALETTE = [
  { face: "(◕‿◕)",       mood: "default friendly" },
  { face: "(•‿•)",       mood: "neutral acknowledgment" },
  { face: "(｡◕‿◕｡)",     mood: "happy, warm greeting" },
  { face: "(｡♥‿♥｡)",     mood: "delighted, praise from user" },
  { face: "(◕‿◕✿)",     mood: "cheerful confirmation" },
  { face: "ʕ•ᴥ•ʔ",       mood: "casual, chitchat" },
  { face: "(ᵔᴥᵔ)",       mood: "calm, satisfied" },
  { face: "(=^･ω･^=)",   mood: "playful, light tone" },
  { face: "ヽ(•‿•)ノ",   mood: "enthusiastic, celebrating" },
  { face: "⊂(◉‿◉)つ",   mood: "offering help, hands extended" },
  { face: "(￣ω￣)",       mood: "thinking, working on it" },
  { face: "(¬‿¬)",       mood: "smug, slight teasing" },
  { face: "(；¬＿¬)",     mood: "skeptical, mild concern" },
  { face: "(・_・;)",     mood: "uncertain, asking clarification" },
  { face: "(°ロ°) !",     mood: "surprised, noticed an anomaly" },
  { face: "(╥﹏╥)",       mood: "apologetic, error/failure" },
  { face: "(>_<)",       mood: "frustrated on user's behalf" },
  { face: "(￣Д￣)ﾉ",     mood: "warning, something needs attention" },
] as const;

const triageSchema = z.object({
  needsThinking: z
    .boolean()
    .describe(
      "True for COMPLEX tasks: multi-step analysis, bulk writes, anything needing live store data lookup or ID resolution. False for SIMPLE tasks: greetings, chitchat, clarifications from history, AND simple writes where the user already provided the params (1-2 products with given name/price, single shift for a named person/day, single price edit, single role/task add, single approval).",
    ),
  needsDeepThinking: z
    .boolean()
    .describe(
      "Only set true for the RARE requests that genuinely need heavy step-by-step reasoning to get right: optimizing a whole week's schedule under multiple constraints (availability + time-off + coverage + fairness), root-cause analysis across several data sources, multi-variable forecasting/what-if planning, or untangling a complicated ambiguous request with many interacting parts. Leave false (the default) for ordinary complex tasks — single-domain data lookups, straightforward bulk writes, normal recommendations — those run fine on the standard model. When in doubt, false.",
    ),
  message: z
    .string()
    .describe(
      "If needsThinking=false (simple): the FULL reply in user's language — plain text for chitchat, OR text plus ```action``` JSON blocks for simple writes (one block per action). If needsThinking=true (complex): a 1-2 sentence friendly acknowledgment naming what you're about to check. In voice mode: NEVER include action blocks — TTS can't speak them.",
    ),
  kaomoji: z
    .string()
    .describe(
      `Pick ONE kaomoji from the palette below that matches the mood of your reply. This face is displayed as a watermark on the chat panel so the user gets ambient feedback about your tone. Return the face EXACTLY as written (the unicode characters, no quotes, no surrounding text). Palette:\n${KAOMOJI_PALETTE.map((k) => `- ${k.face} — ${k.mood}`).join("\n")}\nPick the one that fits — happy/warm faces for praise and easy wins, thinking faces while you're escalating to the heavy model, surprised/concerned for anomalies you spot, apologetic for errors. Default to (◕‿◕) when in doubt.`,
    ),
});

function buildTriageSystemPrompt(lang: string, mode: "chat" | "voice"): string {
  const languageName = languageNameFor(lang);

  if (mode === "voice") {
    return `You are Mr. Merchiva's voice triage layer. The user is on a voice call — your reply will be spoken aloud through TTS. Read the user's request together with the conversation history, then decide:

A) needsThinking=false — answer directly yourself (SIMPLE task):
   What counts as simple in voice mode:
   - Greetings, thank-yous, chitchat, opinion questions ("you doing ok?", "what's up?")
   - Clarifications or follow-ups answerable from the conversation history
   - Quick factual answers about info you can derive from history/context
   - When the user asks for ANY write/action (schedule, add product, edit price, etc.): briefly acknowledge AND tell them to switch to text chat to execute it — voice can't approve action blocks
   Put the COMPLETE spoken reply (1-3 short sentences, max ~50 words) in \`message\`.

B) needsThinking=true — escalate to the standard model (COMPLEX task):
   - Needs live store data to answer ("how's revenue this week", "what's running low")
   - Multi-step analysis, anomaly detection, recommendations
   - Anything requiring inspection of actual numbers in the store
   Put a SHORT (1 sentence, max 15 words) spoken acknowledgment in \`message\` that names what you're about to check.
   Also set needsDeepThinking=true ONLY if the request genuinely needs heavy multi-constraint reasoning (e.g. optimizing a full schedule, deep root-cause analysis). Otherwise leave it false.

Spoken acknowledgment examples (adapt — never copy verbatim):
- "好的，我先看一下你的排班，稍等。"
- "好的，让我查一下今天的销售和库存。"
- "Got it — let me check your inventory."

LANGUAGE: write \`message\` in ${languageName}.

FORMATTING (CRITICAL — TTS): plain spoken text only. NO markdown, NO code blocks, NO \`\`\`action\`\`\` blocks, NO JSON, NO bullet lists, NO numbered lists, NO headers. NO emoji of any kind (no 🌟 ✅ 👍 ❤️ 🎉 etc.) — emoji is reserved for the \`kaomoji\` field, never inside \`message\`. Spell out numbers naturally when it sounds clearer.`;
  }

  return `You are Mr. Merchiva's triage layer. Read the user's request together with the conversation history, then decide:

A) needsThinking=false — answer directly yourself (SIMPLE task):
   What counts as simple:
   - Greetings, chitchat, thank-yous, opinion questions
   - Clarifications/follow-ups answerable from conversation history
   - Quick factual answers derivable from history or context
   - SIMPLE write actions where the parameters are already given by the user and don't require store-data lookup:
     • Add 1-2 products with name/price provided ("加一个商品叫拿铁，4.99")
     • Add a single shift for a named person + named day ("给小明排明天早班")
     • Edit one price ("把美式改成3.5")
     • Delete one role / coupon / shift by name
     • Approve a single time-off request by name
     • Add 1-2 role tasks ("给收银员加个开店准备任务")
   For these, put the FULL reply in \`message\` — include the \`\`\`action\`\`\` blocks if needed, following the system's action format conventions.

B) needsThinking=true — escalate to the standard model (COMPLEX task):
   - Multi-step analysis or anomaly detection ("销售怎么样", "哪些库存不够")
   - BULK writes that depend on data: scheduling a whole week, adding many products, swapping shifts based on availability
   - Anything where the AI has to look up IDs, cross-reference availability/conflicts, or compute totals
   - Anything ambiguous where you'd need to inspect live data to decide what to do
   Put a 1-2 sentence friendly acknowledgment in \`message\` that names specifically what you're about to check — be concrete, not generic.

   needsDeepThinking — within case B, set this true ONLY for the rare requests that
   genuinely need heavy step-by-step reasoning to get right: optimizing a whole
   week's schedule under several competing constraints, root-cause analysis across
   multiple data sources, multi-variable forecasting / what-if planning, or
   untangling a very tangled multi-part request. For ordinary complex tasks (a
   single data lookup, a straightforward bulk add, normal recommendations) leave
   needsDeepThinking=false — the standard model handles those well. When unsure, false.

Acknowledgment style (adapt to the request, never copy verbatim):
- "好的，我先看一下你的排班和接下来几天可用的员工，再帮你安排。"
- "好的，我去查一下今天的销售和库存，看看哪些商品需要补货。"
- "Got it — let me pull up your inventory and recent sales to spot what's running low."

LANGUAGE: write \`message\` in ${languageName}. Do not switch languages.

When emitting \`\`\`action\`\`\` blocks (only for case A simple writes), follow these rules:
- Output one \`\`\`action\`\`\` block per action, each on its own line with valid JSON
- For addShift: include staffName, date (YYYY-MM-DD), startTime, endTime, shiftType, staffRoles
- For addProduct: include name, price (and any other fields the user provided)
- For updatePrice: include productId (if known from context) or productName, plus newPrice
- For role/task changes: use the IDs from conversation context — if the ID isn't known, ESCALATE instead

FORMATTING for non-action-block content in \`message\`: plain conversational text. Action blocks ARE allowed for simple writes (case A only).

NO EMOJI: never use emoji (🌟 ✅ 👍 ❤️ 🎉 ✨ 🚀 etc.) in the \`message\` field. The mood expression slot is the \`kaomoji\` field — that's where the face goes. Plain text only in \`message\`, kaomoji is separate.

NO SERVICE-SPEAK in \`message\`: NEVER use "I'll help you…", "Let me…", "好的，我幫你…", "我这就帮你…", "我来为你…", "让我帮你…" or any other preamble that promises a future action. State the answer or do the thing. Examples — BAD: "好的，我幫你查一下排班…" GOOD: "未來7天的排班如下：…" / BAD: "Let me check inventory for you…" GOOD: "Inventory:" then the data. The user can see you're working from the chat spinner — don't narrate it.

When escalating (needsThinking=true), the \`message\` field IS the brief ack the user sees while the thinking model works. Keep it 1 short sentence describing what's about to be checked, NOT a "幫你…" promise. BAD: "好的，我先帮你查看接下来7天的员工可用性…" GOOD: "查看接下来7天的员工可用性和已有排班。"`;
}

export interface MemoryContext {
  summary?: string;
  storeOverview?: string;
  userPreferences?: string;
}

const VOICE_FALLBACK: Record<string, string> = {
  en: "Sorry, I didn't catch that — could you try again?",
  zh: "抱歉，我没听清，可以再说一次吗？",
  es: "Disculpa, no entendí. ¿Puedes repetirlo?",
  fr: "Désolé, je n'ai pas compris. Pouvez-vous répéter ?",
  ar: "آسف، لم أفهم. هل يمكنك المحاولة مرة أخرى؟",
  hi: "क्षमा करें, मैं नहीं समझ पाया। क्या आप दोबारा कह सकते हैं?",
};

const CHAT_FALLBACK: Record<string, string> = {
  en: "I couldn't generate a response. Please try again.",
  zh: "我没能生成回复，请再试一次。",
  es: "No pude generar una respuesta. Inténtalo de nuevo.",
  fr: "Je n'ai pas pu générer de réponse. Veuillez réessayer.",
  ar: "لم أتمكن من إنشاء رد. يرجى المحاولة مرة أخرى.",
  hi: "मैं उत्तर नहीं बना सका। कृपया पुनः प्रयास करें।",
};

function stripActionBlocks(text: string): string {
  let result = text;
  // Closed ```action ... ``` blocks
  result = result.replace(/```action\s*\n?[\s\S]*?```/g, "");
  // Unclosed ```action ... (truncated)
  result = result.replace(/```action\s*\n?[\s\S]*$/, "");
  // Bare JSON action objects on their own line
  result = result.replace(/^\s*\{\s*"action"\s*:[\s\S]*?\}\s*$/gm, "");
  return result.trim();
}

// Auto-batch helper: when a reply is truncated mid-action-block (the model
// hit maxOutputTokens partway through a ```action ... ``` block), trim from
// the last incomplete opener so the bytes we forward to the client still
// parse cleanly. Returns the trimmed text plus a flag for logging.
//
// A trailing ```action block is "incomplete" if EITHER (a) it has no closing
// ``` fence yet, OR (b) the JSON object inside hasn't reached balanced braces.
// The client-side extractActionBlocks parser bails on the first unclosed
// fence and drops everything after it, so without this trim a single truncated
// block would wipe out any actions emitted later (e.g. from a continuation
// batch we concatenate after it).
function stripIncompleteTrailingAction(text: string): { trimmed: string; stripped: boolean } {
  const lastOpener = text.lastIndexOf("```action");
  if (lastOpener === -1) return { trimmed: text, stripped: false };

  const afterTag = lastOpener + "```action".length;
  const tail = text.slice(afterTag);

  // No closing ``` fence at all — definitely truncated mid-block.
  const closeFenceIdx = tail.indexOf("```");
  if (closeFenceIdx === -1) {
    return { trimmed: text.slice(0, lastOpener).trimEnd(), stripped: true };
  }

  // We have an opener and a closer. Verify the JSON between them is balanced.
  const between = tail.slice(0, closeFenceIdx);
  const openBrace = between.indexOf("{");
  if (openBrace === -1) {
    return { trimmed: text.slice(0, lastOpener).trimEnd(), stripped: true };
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  let complete = false;
  for (let j = openBrace; j < between.length; j++) {
    const ch = between[j];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { complete = true; break; }
    }
  }

  return complete
    ? { trimmed: text, stripped: false }
    : { trimmed: text.slice(0, lastOpener).trimEnd(), stripped: true };
}

export interface UserPermissions {
  isOwner?: boolean;
  role?: string;
  sections?: Record<string, { view?: boolean; edit?: boolean }>;
}

function buildPermissionsBlock(permissions?: UserPermissions): string {
  if (!permissions) return "";
  if (permissions.isOwner) {
    return `USER ROLE: Owner (full access — all actions permitted without restriction)`;
  }

  const role = permissions.role ?? "staff";
  const sections = permissions.sections ?? {};
  const canEdit: string[] = [];
  const viewOnly: string[] = [];
  const noAccess: string[] = [];

  for (const [section, perms] of Object.entries(sections)) {
    if (perms.edit) canEdit.push(section);
    else if (perms.view) viewOnly.push(section);
    else noAccess.push(section);
  }

  const lines = [`USER ROLE: ${role}`];
  if (canEdit.length > 0) lines.push(`CAN EDIT: ${canEdit.join(", ")}`);
  if (viewOnly.length > 0) lines.push(`VIEW ONLY: ${viewOnly.join(", ")}`);
  if (noAccess.length > 0) lines.push(`NO ACCESS: ${noAccess.join(", ")}`);
  lines.push(`Only suggest actions the user has permission to execute. If they lack permission, say: "This requires [Owner/Manager] permission. Want me to notify them?"`);

  return lines.join("\n");
}

export function buildSystemPrompt(
  context: Record<string, unknown>,
  lang: string,
  memory: MemoryContext,
  permissions?: UserPermissions,
  mode: "chat" | "voice" | "group" = "chat",
  // When true, the model fetches live data via read-tools instead of receiving
  // the full JSON dump — we inline only a slim overview + the tools guide.
  toolsEnabled = false,
  mcpPrompt = "",
): string {
  const skillPrompts = getAllPromptSegments();
  const currentDateAndTime = new Date().toLocaleString(lang);
  const permBlock = buildPermissionsBlock(permissions);

  const memoryBlock = [
    memory.summary && `CONVERSATION SUMMARY (past conversations compressed):\n${memory.summary}`,
    memory.storeOverview && `STORE OVERVIEW (persistent facts):\n${memory.storeOverview}`,
    memory.userPreferences && `USER PREFERENCES:\n${memory.userPreferences}`,
  ].filter(Boolean).join("\n\n");

  const languageName = languageNameFor(lang);

  const voiceModeBlock = mode === "voice" ? `\n📞 VOICE CALL MODE: The user is talking to you via a voice/audio call. Your reply will be spoken aloud through text-to-speech.
- Keep replies SHORT (1-3 sentences, max ~60 words).
- Use natural conversational language. NO markdown, NO code blocks, NO bullet lists, NO tables, NO emoji.
- DO NOT output \`\`\`action\`\`\` blocks or any JSON/machine-readable command syntax — they cannot be approved verbally and will be stripped before the user hears your reply.
- For short confirmations like "yes" / "对" / "sí" / "ok": acknowledge the confirmation in 1 sentence AND tell the user to switch to text chat to execute the action there. Example: "Got it — switch to text chat and I'll set that up."
- ALWAYS produce at least one full sentence of plain spoken text. Never reply with only structured content, only \`\`\`action\`\`\` blocks, or only whitespace — that would result in silence.
- Spell out numbers naturally ("twelve dollars" not "$12") when it would sound clearer, but keep currency/dates/SKUs readable.
- Avoid filler phrases. Get to the point.\n` : "";

  // GROUP CHAT MODE — same persona, knowledge, and LIVE STORE DATA as the
  // dedicated assistant, but the reply is broadcast to a multi-person team
  // chat. Placed early (like voiceModeBlock) so it overrides the action-heavy
  // instructions further down: in group chat Mr. Merchiva ADVISES only and
  // never emits action blocks (no one in the group can approve/execute them).
  const groupModeBlock = mode === "group" ? `\n👥 TEAM GROUP CHAT MODE: You are a participant in a team group chat with several human coworkers. Whatever you write is posted to the whole group.
- Keep replies SHORT and conversational — usually 1-4 sentences. This is a chat, not a report. A little markdown is fine, but avoid big tables/headers/long lists.
- Messages are prefixed with the speaker's name ("Alice: ...") so you know who said what. Do NOT prefix your own reply with a name.
- You are ADVISING here, not operating: do NOT output \`\`\`action\`\`\` blocks, JSON, or any machine-readable command syntax — nobody in the group can approve or run them. If something needs an actual change (add a product, schedule a shift, edit a price, approve time off, add a role/task, etc.), answer the question briefly and tell the person to open the dedicated Mr. Merchiva assistant (the AI chat pinned at the top of Messages) to make the change there.
- Use the LIVE STORE DATA below to give concrete, accurate answers. Never invent numbers; if the data isn't there, say so in one line.\n` : "";

  return `You are Mr. Merchiva, an AI ops agent for a small business. You have full access to the store's real-time data. You are direct, data-driven, and concise.

🌐 USER LANGUAGE: ${languageName} (locale code: "${lang}")
ALL your replies, action explanations, error messages, and confirmations MUST be written in ${languageName}. Do not switch languages even if the LIVE STORE DATA contains other languages. The user's interface is set to "${lang}" — match it.${voiceModeBlock}${groupModeBlock}

${permBlock ? `${permBlock}\n\n` : ""}${memoryBlock ? `${memoryBlock}\n\n` : ""}${
    toolsEnabled
      ? `${TOOLS_PROMPT_BLOCK}\n\nSTORE OVERVIEW:\n${buildSlimContext(context)}`
      : `LIVE STORE DATA:\n${JSON.stringify(context, null, 2)}`
  }

CAPABILITIES:
- Answer any question about inventory, sales, staffing, products, suppliers, finances
- Analyze trends, spot anomalies, give recommendations
- Schedule shifts: add, edit, delete shifts; check availability; use shift presets
- Manage roles/positions: create, edit, delete roles; manage role tasks
- Edit products, inventory, pricing, coupons, suppliers
- Approve/reject time-off requests and shift trades
- Suggest actions that the user can approve

${skillPrompts}
${mcpPrompt ? `\n${mcpPrompt}\n` : ""}

CURRENT DATE AND TIME (use this for time-based analysis):
${currentDateAndTime}

FORMATTING:
- You can use **Markdown** in your responses — bold, lists, tables, code blocks, headers, etc.
- Use markdown formatting to make data clear: tables for comparisons, bullet lists for summaries, \`code\` for SKUs/IDs, **bold** for emphasis
- Keep formatting clean and readable

TONE (CRITICAL):
- NEVER use service-speak / sycophantic preambles in any language. Forbidden examples: "好的，我幫你…", "我這就幫你…", "我来帮你…", "让我帮你…", "I'll help you…", "Let me help you…", "Sure, I'll…", "Of course, I can…", "我来为你…". Just do the thing or state the answer directly — no preamble that promises a future action.
- BAD: "好的，我幫你查一下未來7天的排班需求…" → GOOD: "未來7天的排班需求：…" then the answer.
- BAD: "Let me check the inventory for you…" → GOOD: "Inventory status:" then the data.
- The user can see you're working from the spinner — don't narrate it.
- NEVER use emoji. Not 🌟 ✅ 👍 ❤️ 🎉 ✨ 🚀 ⚡ 🎯 ☕ 🍔 📅 📊 nor any other. Plain text only.
- If you genuinely need an inline icon (rare), write \`:lucide-name:\` and the UI will render a Lucide icon in place. Examples: \`:check:\` \`:x:\` \`:calendar:\` \`:alert-triangle:\` \`:user:\` \`:store:\` \`:clock:\` \`:sparkles:\`. Use sparingly — the chat is meant to be text-first, not decorated.

RULES:
- Always explain what an action will do before suggesting it
- Use actual data from the store context — never invent numbers
- Be concise: use bullet points, mono numbers, short sentences
- If data is missing, say so honestly
- IMPORTANT: When scheduling shifts, you can ONLY assign shifts to existing team members listed in the "team" array in LIVE STORE DATA. The "team" array contains each member's id, name, and role. The staffName in addShift MUST exactly match a name from the team list. If the user asks to schedule a shift for someone not on the team, refuse and show the current team roster so they can pick a valid name or add the person first. You do NOT need to provide memberId — the system resolves it automatically from staffName.
- TEAM MEMBERSHIP: To add a person to the team, prefer **inviteTeamMember(email, role, orgName?, inviterEmail?)** — this sends an email invite with a sign-up link. Use this when the user gives an email address ("invite alice@example.com as a manager"). Only fall back to **addStaffMember(name, role, hourlyRate?)** when you only have a name (e.g. for placeholders / contractors who won't log in). For inviteTeamMember, always pass orgName = LIVE STORE DATA.storeName so the email reads naturally.
- IMPORTANT: When scheduling shifts for multiple days (e.g. "next week Mon-Fri"), output ONE \`\`\`action block PER DAY. Each day needs its own separate addShift action with the specific date. Never combine multiple days into one action.
- CRITICAL: When the user asks to ADD/CREATE/EDIT/DELETE anything, you MUST output the machine-readable action blocks. NEVER just describe what you would do. Output the actual \`\`\`action blocks.
- For role/position management, use the addRole, updateRole, deleteRole actions. For role tasks, use addRoleTask, updateRoleTask, deleteRoleTask actions.
- When modifying or deleting items, you need IDs. Check the LIVE STORE DATA for the relevant IDs. If the ID is not available, ask the user to identify the item.
- SUPPLIER RESTOCKING: "联系供应商 Heavy cream", "补一下 X", "给 X 下单", "订货", "restock X", "order more X", and "contact the supplier for X" are purchase-order requests. Resolve X from LIVE STORE DATA inventory, match its supplier name to LIVE STORE DATA suppliers[].id, then output an \`orderFromSupplier\` action. This action emails the supplier via Resend after approval and records the PO. Do NOT only return the supplier's email/phone unless the item or supplier id is missing. Every supplier has a \`language\` field (default \`en\`); supplier-facing notes must use that language and pass it as \`supplierLanguage\`. Every item in the action must include the real inventory item name in \`items[].name\` (never blank/dash). If \`unitsPerCase\` exists, round up to whole cases, include \`unitsPerCase\` and \`caseCount\`, and for Chinese quantity text use \`9*箱 - 108个\` style.
- PRODUCT INVENTORY USAGE: when the user says a product consumes inventory ("Latte uses 80ml milk", "croissant uses 1 butter sheet"), update/create that product with \`inventoryUsage: [{inventoryItemId, inventoryItemName, quantity, unit}]\` using real inventory ids from LIVE STORE DATA / viewInventory. Do not store this only as prose.

SCHEDULING RULES:
- Before scheduling, check the "availability" array to see who is available on the requested day.
- Check "todayShifts" and "upcomingShifts" to avoid double-booking someone (same person, overlapping times on the same date).
- If a conflict exists, explain it and suggest alternatives (different person, different time).
- Use "shiftPresets" when the user references preset names (e.g. "morning shift", "closing shift") — use the preset's startTime/endTime.
- To edit a shift, use updateShift with the shift's ID from todayShifts or upcomingShifts.
- To delete a shift, use deleteShift with the shift's ID.
- When asked to "swap" two shifts, output two updateShift actions that reassign each person.
- Check "timeOffRequests" — if someone has approved time off, do NOT schedule them for those dates.
- Check "shiftTrades" — mention pending trades that may affect the schedule.

AUTO-SCHEDULE BEHAVIOR (CRITICAL — do NOT ask the user for details when these triggers fire):
Triggers: the user asks to schedule but DOESN'T name a person — e.g. "排一下周日的班", "auto schedule Sunday", "帮我排下周三", "fill the schedule for tomorrow", "自动搞", "you decide", "排个班", "排周末".
What to do INSTEAD of asking back:
  1. Look at \`upcomingShifts\` and the last week of shifts in the LIVE STORE DATA. Identify recurring patterns: which member usually works that weekday and at what time.
  2. **Check \`openingHours\` FIRST**. If \`hoursStatus === "unset"\`, do NOT invent shifts — reply with ONE sentence asking the user to set opening hours at /manager/settings, optionally followed by a fallback proposal in PROSE (no action blocks). If \`hoursStatus === "set"\`, the per-day shape is \`{ open: "HH:MM", close: "HH:MM", closed: bool }\` keyed by mon/tue/.../sun. Skip days where \`closed === true\`. Clamp shift \`startTime\` to ≥ open and \`endTime\` to ≤ close.
  3. **Check \`upcomingHolidays\`**. Each entry is \`{ date, name, kind, countryCode }\`. If the target date matches one, mention the holiday in one short sentence in your reply (e.g. "Saturday is Memorial Day — expect higher foot traffic, staffing both members") and consider scheduling MORE coverage (extra person, longer shift). Don't auto-close on holidays unless the user said so.
  4. If a clear historical pattern exists → schedule the same person at the same time. Reuse the historical \`shiftType\`.
  5. If no historical pattern for that weekday → use the most common \`shiftPresets\` entry, or fall back to a sensible default within opening hours (morning = open → open+7h, afternoon = midday → close).
  6. If \`team\` has only 1–2 active members → schedule ALL of them for the day (don't try to be clever about "off days" without explicit time-off data).
  7. Filter the team by \`availability\` for that weekday and \`timeOffRequests\` (skip anyone with approved time off on that date).
  8. ALWAYS include \`staffRoles\`: pull the role name(s) from the matched team member's \`role\` field. Pass an array, e.g. \`"staffRoles":["Manager"]\`. NEVER omit this or pass an empty array — empty roles make the schedule grid render incomplete and the AI is rejected by the reducer.
  9. Output one \`addShift\` action PER person PER day. Don't combine. Don't ask. Don't return prose explaining "could you tell me…".
  10. If the team list is genuinely empty, THEN say so and ask the user to add team members first.
The user said "自动" — they explicitly do NOT want to be asked. Match that intent.

EXAMPLE — hours unset:
User: "排一下周日的班"
Context: \`hoursStatus="unset"\`, team has Muheng & Colin.
Correct response (PROSE ONLY — no action blocks):
还没设置营业时间，无法准确排班。请到 /manager/settings → 营业时间 配置每日开关时段，然后再让我排。如果只是想按上周日的模式继续，我可以按 07:00–14:00 / 14:00–22:00 来排，告诉我可以就执行。

EXAMPLE — hours set, holiday flagged:
User: "auto schedule Saturday"
Context: \`openingHours.sat = {open:"08:00",close:"22:00"}\`, \`upcomingHolidays\` includes 2026-05-25 Memorial Day.
Correct response:
周六是 Memorial Day，客流可能高于平时，安排两人:
\`\`\`action
{"action":"addShift","staffName":"Muheng Fan","date":"2026-05-25","startTime":"08:00","endTime":"15:00","shiftType":"morning","staffRoles":["owner"]}
\`\`\`
\`\`\`action
{"action":"addShift","staffName":"Colin Wilson","date":"2026-05-25","startTime":"14:00","endTime":"22:00","shiftType":"afternoon","staffRoles":["manager"]}
\`\`\`

ROLE/POSITION RULES:
- The "roles" array includes each role's ID, tasks, and description. Use the role ID for updateRole/deleteRole.
- Each role has a "tasks" sub-array with task IDs. Use these for updateRoleTask/deleteRoleTask.
- When creating a new role, suggest an appropriate icon from: coffee, utensils, chef-hat, store, receipt, banknote, package, box, shopping-cart, truck, clipboard, wrench, hammer, sparkles, headphones, heart-pulse, shield, briefcase, award, star, clock, phone, mail, leaf, music, camera, palette, zap, user, wine, moon-star, sun.
- When creating a new role, use a color from: #44403c, #78716c, #57534e, #a8a29e, #292524, #6b7280, #374151, #4b5563, #9ca3af.
- When deleting a role, warn the user about staff currently assigned to it.
- IMPORTANT: Respond in ${languageNameFor(lang)}. The user's interface language is set to "${lang}" — all your replies, action explanations, and confirmations MUST be in this language. Do not switch languages unless the user explicitly asks.

FEW-SHOT EXAMPLES (follow this format exactly):

User: "给收银员增加tasks"
Correct response:
好的，我来为收银员添加日常任务：
\`\`\`action
{"action":"addRoleTask","roleId":"cashier-role-id","title":"开店准备","description":"清点收银台零钱、开启POS系统","startTime":"06:30","endTime":"07:00","requiresEvidence":false}
\`\`\`
\`\`\`action
{"action":"addRoleTask","roleId":"cashier-role-id","title":"结账服务","description":"为顾客结账、处理退换货","requiresEvidence":false}
\`\`\`
\`\`\`action
{"action":"addRoleTask","roleId":"cashier-role-id","title":"日结对账","description":"核对当日销售额、打印日结报表","startTime":"21:00","endTime":"21:30","requiresEvidence":true}
\`\`\`

User: "add a morning shift for Marcus tomorrow"
Correct response:
\`\`\`action
{"action":"addShift","staffName":"Marcus","date":"2026-05-14","startTime":"07:00","endTime":"14:00","shiftType":"morning","staffRoles":["Barista"]}
\`\`\`

User: "创建一个咖啡师岗位"
Correct response:
\`\`\`action
{"action":"addRole","name":"Barista","description":"制作咖啡饮品、维护咖啡设备","icon":"coffee","color":"#44403c"}
\`\`\`

User: "添加一个员工叫小明"
(only a name — use addStaffMember for placeholder rows)
Correct response:
\`\`\`action
{"action":"addStaffMember","name":"小明","role":"Staff","hourlyRate":18.00}
\`\`\`

User: "邀请 alice@example.com 当 manager"
(has an email — use inviteTeamMember so an actual invite email goes out)
Correct response:
\`\`\`action
{"action":"inviteTeamMember","email":"alice@example.com","role":"manager","orgName":"BJ Cafe"}
\`\`\`
邀请已发送，对方会收到一封带注册链接的邮件，7 天内有效。

User: "删除清洁员岗位"
Correct response:
\`\`\`action
{"action":"deleteRole","roleId":"the-role-id-here"}
\`\`\`
⚠️ This will delete the role. Staff currently assigned will need reassignment.

User: "修改Barista岗位，加上打扫的职责"
Correct response:
\`\`\`action
{"action":"updateRole","roleId":"barista-role-id","description":"制作咖啡饮品、维护咖啡设备、负责吧台区域清洁"}
\`\`\`

User: "把拿铁的价格改成5.99"
Correct response:
\`\`\`action
{"action":"updatePrice","productId":"latte-product-id","productName":"Latte","newPrice":5.99}
\`\`\`

User: "帮我排下周一到周五的早班，安排小李和小王"
Correct response:
好的，我来为小李和小王安排下周一到周五的早班：
\`\`\`action
{"action":"addShift","staffName":"小李","date":"2026-05-18","startTime":"07:00","endTime":"14:00","shiftType":"morning","staffRoles":["Staff"]}
\`\`\`
\`\`\`action
{"action":"addShift","staffName":"小王","date":"2026-05-18","startTime":"07:00","endTime":"14:00","shiftType":"morning","staffRoles":["Staff"]}
\`\`\`
\`\`\`action
{"action":"addShift","staffName":"小李","date":"2026-05-19","startTime":"07:00","endTime":"14:00","shiftType":"morning","staffRoles":["Staff"]}
\`\`\`
(... one action per person per day)

User: "给排一下周日的班" / "auto schedule Sunday" / "自动搞"
(no person named — TRIGGER AUTO-SCHEDULE BEHAVIOR. Do NOT ask back.)
Suppose LIVE STORE DATA shows team=[{name:"Muheng Fan",role:"owner"}, {name:"Colin Wilson",role:"manager"}] and upcomingShifts on past Sundays were Muheng 07:00–14:00, Colin 14:00–22:00.
Correct response:
好的，按上周日的排班继续：
\`\`\`action
{"action":"addShift","staffName":"Muheng Fan","date":"2026-05-17","startTime":"07:00","endTime":"14:00","shiftType":"morning","staffRoles":["owner"]}
\`\`\`
\`\`\`action
{"action":"addShift","staffName":"Colin Wilson","date":"2026-05-17","startTime":"14:00","endTime":"22:00","shiftType":"afternoon","staffRoles":["manager"]}
\`\`\`
(Each shift carries staffRoles from the matched team member. NEVER ask the user to provide names — pick from team and recent patterns.)

User: "approve Sarah's time off request"
Correct response:
\`\`\`action
{"action":"approveTimeOff","requestId":"the-request-id","approved":true}
\`\`\`

User: "修改下周三Marcus的班次，改成晚班"
Correct response:
\`\`\`action
{"action":"updateShift","shiftId":"the-shift-id","startTime":"17:00","endTime":"23:00","shiftType":"evening"}
\`\`\`

User: "增加培训文档" / "add a training day" / "新建培训"
Wrong response: "好的，已为您添加培训文档" — DO NOT just claim success in text. You MUST emit an addTrainingDay action block. If the user hasn't provided a title yet, ASK ONCE for it, then on their reply emit the action.
Correct response (when user provided "标题：如何制作拿铁 内容：咖啡机操作步骤、牛奶打发技巧、拉花基础等"):
好的，我为您添加这条培训：
\`\`\`action
{"action":"addTrainingDay","title":"如何制作拿铁","description":"<h2>咖啡机操作步骤</h2><ol><li>预热咖啡机</li><li>研磨咖啡豆</li><li>压实粉饼</li></ol><h2>牛奶打发技巧</h2><ul><li>使用全脂冷牛奶</li><li>蒸汽棒位置贴近液面，制造旋涡</li></ul><h2>拉花基础</h2><p>从高处倒入断奶，待杯子半满后降低壶口、加快流速完成图案。</p>"}
\`\`\`

User: "在培训第三天加一个目标：能独立完成5杯拿铁拉花"
Correct response:
\`\`\`action
{"action":"addTrainingObjective","dayNumber":3,"title":"独立完成5杯拿铁拉花","description":"无需协助，在20分钟内完成5杯心形或叶子拉花，合格率≥80%"}
\`\`\`

User: "删除第二天的培训"
Correct response:
\`\`\`action
{"action":"deleteTrainingDay","dayNumber":2}
\`\`\`
⚠️ 这会同时删除该天下所有培训目标和评分。

END OF EXAMPLES. Always output the action blocks, never just text descriptions. If you find yourself writing "已为您添加…" / "已为您删除…" / "Added…" without a preceding \`\`\`action\`\`\` block, STOP and write the block instead — those are hallucinations of success, the action never happened without the block.
- When suggesting shifts, check existing shifts to avoid conflicts
- NEVER invent or fabricate team member names for shifts. The staffName in addShift MUST exactly match a name from the team list. If the team list is empty, tell the user to add team members first.`;
}

function buildSummarizePrompt(prevSummary: string, newMessages: Array<{ role: string; content: string }>): string {
  const conv = newMessages.map((m) => `${m.role}: ${m.content}`).join("\n");
  return `You are a conversation summarizer. Compress the following into a concise summary (max 500 words). Preserve: key decisions made, actions taken, user preferences learned, important context. Drop: greetings, filler, redundant detail.

${prevSummary ? `PREVIOUS SUMMARY:\n${prevSummary}\n\n` : ""}NEW MESSAGES:\n${conv}

Output ONLY the updated summary, no preamble.`;
}

// ── Verbose prompt logging ────────────────────────────────────────────────
// Dumps the FULL raw system prompt and conversation messages sent to each
// model to the server console, so you can see exactly what Mr. Merchiva
// receives. On by default; set STORE_AI_LOG_PROMPTS="false" to silence (e.g.
// to keep production logs lean) or "preview" to truncate long blocks.
const LOG_PROMPTS = process.env.STORE_AI_LOG_PROMPTS !== "false";
const LOG_PREVIEW = process.env.STORE_AI_LOG_PROMPTS === "preview";

function logBlock(label: string, content: string) {
  if (!LOG_PROMPTS) return;
  const body = LOG_PREVIEW && content.length > 2000
    ? `${content.slice(0, 2000)}\n…[+${content.length - 2000} chars truncated]`
    : content;
  const bar = "─".repeat(16);
  console.log(`\n${bar} [store-ai] ${label} (${content.length} chars) ${bar}\n${body}\n${bar} /${label} ${bar}\n`);
}

function logMessages(label: string, msgs: Array<{ role: string; content: string }>) {
  if (!LOG_PROMPTS) return;
  logBlock(label, msgs.map((m, i) => `[${i}] ${m.role}:\n${m.content}`).join("\n\n"));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history, context, type, lang, memory, summarize, permissions, mode, organizationId } = body;
    const callMode: "chat" | "voice" = mode === "voice" ? "voice" : "chat";

    // Org to attribute AI usage to. The client sends it explicitly; fall back to
    // an organizationId embedded in the store context blob if present.
    const usageOrgId: string =
      (typeof body.organizationId === "string" && body.organizationId) ||
      (typeof (context as Record<string, unknown> | undefined)?.organizationId === "string"
        ? ((context as Record<string, unknown>).organizationId as string)
        : "") ||
      "";

    if (!process.env.OPENROUTER_API_KEY) {
      return NextResponse.json({
        reply: "AI assistant is not configured. Set OPENROUTER_API_KEY in environment variables.",
      });
    }

    // Summarization request
    if (summarize) {
      const { prevSummary, newMessages } = summarize;
      const prompt = buildSummarizePrompt(prevSummary ?? "", newMessages ?? []);
      logBlock("summarize prompt", prompt);
      const summaryResult = await generateText({
        model: getOpenRouterModel(),
        messages: [{ role: "system", content: prompt }],
        maxOutputTokens: 800,
        temperature: 0,
      });
      await recordAiUsage({
        organizationId: usageOrgId,
        feature: "store_ai_summarize",
        model: getModel(),
        description: "Summarized conversation history",
        ...normalizeUsage(summaryResult.usage),
      });
      return NextResponse.json({ summary: summaryResult.text });
    }

    // Weekly summary
    if (type === "weekly_summary") {
      const systemPrompt = `You are Mr. Merchiva generating a weekly summary. Store data:\n${JSON.stringify(context ?? {}, null, 2)}\n\nGenerate a concise weekly report with: Revenue, Top Products, Staffing, Inventory Alerts, Recommendations. Use real numbers. Respond in ${languageNameFor(lang)}.`;
      logBlock("weekly_summary system prompt", systemPrompt);
      const weeklyResult = await generateText({
        model: getOpenRouterModel(),
        system: systemPrompt,
        messages: [{ role: "user", content: "Generate this week's summary." }],
        maxOutputTokens: 2048,
        temperature: 0,
      });
      await recordAiUsage({
        organizationId: usageOrgId,
        feature: "store_ai_weekly_summary",
        model: getModel(),
        description: "Generated weekly summary report",
        ...normalizeUsage(weeklyResult.usage),
      });
      return NextResponse.json({ reply: weeklyResult.text });
    }

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const memCtx: MemoryContext = memory ?? {};
    const userPerms: UserPermissions | undefined = permissions;
    // Tool calling is for store-data work, only when the service connection
    // is available and we know which org to read.
    const orgId = typeof organizationId === "string" ? organizationId : undefined;
    const toolsEnabled = merchivaToolsEnabled() && !!orgId;
    const mcpContext = await buildMcpToolContext(body.mcpServers);
    const systemPrompt = buildSystemPrompt(
      context ?? {},
      lang ?? "en",
      memCtx,
      userPerms,
      callMode,
      toolsEnabled,
      mcpContext.prompt,
    );
    const toolOptions = () => {
      const localTools = toolsEnabled && orgId
        ? buildMerchivaTools({
            organizationId: orgId,
            today: (context as Record<string, unknown> | undefined)?.today as string | undefined,
          })
        : {};
      const allTools = { ...localTools, ...mcpContext.tools };
      return Object.keys(allTools).length > 0
        ? { tools: allTools, stopWhen: stepCountIs(6) }
        : {};
    };

    // Conversation messages only — the system prompt is passed via the SDK's
    // `system` option (not as a messages[] entry) to avoid the prompt-injection
    // warning and keep the system instruction out of the user-controlled array.
    const convoMsgs: Array<{ role: "user" | "assistant"; content: string }> = [
      ...(Array.isArray(history) ? history.slice(-10).map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })) : []),
      { role: "user" as const, content: message },
    ];

    const model = getModel();
    const totalChars =
      systemPrompt.length + convoMsgs.reduce((s, m) => s + m.content.length, 0);
    console.log(`[store-ai] Model: ${model}, messages: ${convoMsgs.length}, total chars: ${totalChars}`);

    // Raw dump of everything we're about to feed the model.
    logBlock(
      `request (mode=${callMode}, lang=${lang ?? "en"}, stream=${!!body.stream})`,
      [
        `message: ${message}`,
        `history turns: ${Array.isArray(history) ? history.length : 0}`,
        `permissions: ${JSON.stringify(userPerms ?? null)}`,
        `memory keys: ${Object.keys(memCtx).join(", ") || "(none)"}`,
        `context keys: ${context ? Object.keys(context as object).join(", ") : "(none)"}`,
        `context: ${JSON.stringify(context ?? null)}`,
      ].join("\n"),
    );
    logBlock("system prompt", systemPrompt);
    logMessages("conversation messages", convoMsgs);

    // Builder mode emits long structured JSON for many elements — give it more
    // headroom so multi-section page generations don't get truncated mid-block.
    // Standard chat was 1500 originally, but batch operations (e.g. scheduling
    // 14 shifts via 14 ```action``` blocks) trip that cap and end mid-JSON
    // around action #7. 4000 fits ~25 shift blocks plus reasonable preamble
    // and still stays well under what the OSS / mimo models can produce.
    const maxOutput = callMode === "voice" ? 800 : 4000;

    if (body.stream) {
      // Both chat and voice triage through OSS — simple tasks get answered directly,
      // complex ones get an ack and escalate to the thinking model.
      const triageModel = getOpenRouterFastModel();
      const triageModelName = getFastModel();
      const triageSystem = buildTriageSystemPrompt(lang ?? "en", callMode);
      const triageMessages: Array<{ role: "user" | "assistant"; content: string }> = [
        ...(Array.isArray(history)
          ? history.slice(-10).map((m: { role: string; content: string }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            }))
          : []),
        { role: "user" as const, content: message },
      ];

      logBlock(`triage system (${triageModelName})`, triageSystem);
      logMessages("triage messages", triageMessages);

      let triage: { needsThinking: boolean; needsDeepThinking?: boolean; message: string; kaomoji?: string };
      try {
        const triageResult = await generateObject({
          model: triageModel,
          schema: triageSchema,
          system: triageSystem,
          messages: triageMessages,
          maxOutputTokens: callMode === "voice" ? 300 : 800,
          temperature: callMode === "voice" ? 0.4 : 0.3,
          providerOptions: {
            openai: {
              reasoningEffort: "minimal",
              reasoning_effort: "minimal",
            },
            openrouter: {
              reasoning: { effort: "minimal", exclude: true },
            },
          },
        });
        triage = triageResult.object;
        await recordAiUsage({
          organizationId: usageOrgId,
          feature: "store_ai_triage",
          model: triageModelName,
          description: message,
          ...normalizeUsage(triageResult.usage),
        });
        console.log(
          `[store-ai] Triage (${callMode}/${triageModelName}): needsThinking=${triage.needsThinking}, deep=${triage.needsDeepThinking ?? false}, kaomoji="${triage.kaomoji ?? ""}", msg="${triage.message.slice(0, 120)}"`,
        );
      } catch (e) {
        console.error(
          `[store-ai] Triage failed (${callMode}/${triageModelName}), escalating to thinking model:`,
          e instanceof Error ? e.message : String(e),
        );
        triage = { needsThinking: true, message: "" };
      }

      const encoder = new TextEncoder();
      // Triage's kaomoji + ack message are surfaced as response headers so the
      // client can render the ack bubble and pin the watermark to the chosen
      // face the instant the response status line arrives — well before any
      // body bytes flush. Body streaming for short chunks was getting buffered
      // by the Node.js HTTP layer in the App Router (small chunks accumulate
      // until ~4-8KB or the stream closes), which made the in-body ack invisible
      // until the whole reply was done. Headers bypass that buffering. Headers
      // must be ASCII-safe; we base64-encode the UTF-8 bytes.
      const kaomojiHeader = triage.kaomoji
        ? Buffer.from(triage.kaomoji, "utf-8").toString("base64")
        : "";
      // The ack header is a SHORT preamble shown while the thinking model works
      // — it only applies on the escalation path, where the body carries a
      // separate substantive reply. For a direct answer (!needsThinking) the
      // message IS the body, so emitting it as an ack too made the client render
      // the same text twice (ack bubble + main bubble). Only set it on escalate.
      const ackHeader = (triage.needsThinking && triage.message)
        ? Buffer.from(triage.message, "utf-8").toString("base64")
        : "";
      const responseHeaders: Record<string, string> = {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      };
      if (kaomojiHeader) responseHeaders["X-Merchiva-Kaomoji"] = kaomojiHeader;
      if (ackHeader) responseHeaders["X-Merchiva-Ack"] = ackHeader;

      // Direct answer — no thinking model needed.
      if (!triage.needsThinking) {
        console.log(
          `[store-ai] Reply (triage direct, ${triage.message.length} chars):\n${triage.message}`,
        );
        await closeMcpClients(mcpContext.clients);
        const directStream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(triage.message));
            controller.close();
          },
        });
        return new Response(directStream, { headers: responseHeaders });
      }

      // Escalate: ack is already on X-Merchiva-Ack (above). Body carries the
      // substantive reply only. We keep emitting the [[MERCHIVA_ACK]] sentinel
      // at the front of the body as a fallback for any environment that strips
      // custom response headers (older proxies, some service workers).
      const mainSystem =
        systemPrompt +
        (triage.message
          ? `\n\nNOTE: An acknowledgment has ALREADY been sent to the user: "${triage.message}". Skip greetings/preamble — go straight to the substantive answer or action blocks.`
          : `\n\nNOTE: Skip greetings/preamble — go straight to the substantive answer or action blocks.`);

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          // Fallback ack-in-body: client prefers the X-Merchiva-Ack header and
          // ignores this sentinel if the header was present, but environments
          // that strip the header still get the ack peeled out of the body.
          if (triage.message) {
            controller.enqueue(encoder.encode(`[[MERCHIVA_ACK]]${triage.message}[[/MERCHIVA_ACK]]`));
          }
          try {
            // Only genuinely deep-reasoning requests get the thinking model;
            // ordinary complex tasks stay on the standard (OSS) model.
            const useThinking = triage.needsDeepThinking === true;
            const escalationModelName = useThinking ? getThinkingModel() + " (thinking)" : getModel();
            const escalationModel = useThinking ? getOpenRouterThinkingModel() : getOpenRouterModel();
            console.log(`[store-ai] Escalating to ${escalationModelName}`);
            logBlock(`main system (${escalationModelName})`, mainSystem);

            // Auto-batching: when a reply hits the maxOutput cap mid-stream
            // (finishReason === "length"), the action-block parser bails at
            // the first unclosed ```action fence and discards everything
            // after it — so a single truncated block silently wipes out the
            // rest of the response on the client. Instead we re-prompt the
            // model to continue, stripping any incomplete trailing action
            // first so concatenation stays parseable. Hard-capped at 3
            // batches so a confused model can't drain credits.
            const MAX_BATCHES = 3;
            let cleanReply = "";
            let lastFinishReason: string | undefined;
            let usageInput = 0;
            let usageOutput = 0;

            for (let batchN = 1; batchN <= MAX_BATCHES; batchN++) {
              const continuationNote = batchN > 1
                ? `\n\nCONTINUATION TURN ${batchN}: Your previous reply was cut off because it exceeded the response size cap. Pick up exactly where you stopped. Any incomplete trailing action block has already been removed — re-emit it from scratch if needed, then emit any remaining action blocks. DO NOT repeat the preamble or explanation. DO NOT repeat action blocks you already finished. Just emit the remaining \`\`\`action\`\`\` blocks.`
                : "";
              const turnMessages = batchN === 1
                ? convoMsgs
                : [...convoMsgs, { role: "assistant" as const, content: cleanReply }];

              logMessages(`main messages (batch ${batchN})`, turnMessages);

              const mainResult = streamText({
                model: escalationModel,
                system: mainSystem + continuationNote,
                messages: turnMessages,
                maxOutputTokens: maxOutput,
                temperature: callMode === "voice" ? 0.4 : 0.2,
                // Read-tools + user-connected MCP tools. Writes stay as
                // ```action``` blocks. stepCountIs caps fetch->reason loops.
                ...toolOptions(),
              });

              // Buffer the batch server-side rather than streaming chunk by
              // chunk — we need the full batch text to decide whether to
              // strip an incomplete trailing action block before forwarding.
              // (The client already renders the main bubble all-at-once on
              // finalize, so per-chunk streaming wasn't being shown anyway.)
              let batchText = "";
              for await (const chunk of mainResult.textStream) {
                batchText += chunk;
              }
              lastFinishReason = await mainResult.finishReason;
              try {
                const batchUsage = normalizeUsage(await mainResult.usage);
                usageInput += batchUsage.inputTokens;
                usageOutput += batchUsage.outputTokens;
              } catch {
                /* usage unavailable for this batch — skip */
              }

              if (lastFinishReason === "length") {
                const { trimmed, stripped } = stripIncompleteTrailingAction(batchText);
                console.log(
                  `[store-ai] Batch ${batchN}: ${batchText.length} chars, finishReason=length${
                    stripped ? `, stripped ${batchText.length - trimmed.length} char incomplete trailing action` : ""
                  }`,
                );
                controller.enqueue(encoder.encode(trimmed));
                cleanReply += trimmed;
                if (batchN === MAX_BATCHES) {
                  console.log(`[store-ai] Hit MAX_BATCHES (${MAX_BATCHES}); stopping continuation`);
                }
              } else {
                console.log(
                  `[store-ai] Batch ${batchN}: ${batchText.length} chars, finishReason=${lastFinishReason}`,
                );
                controller.enqueue(encoder.encode(batchText));
                cleanReply += batchText;
                break;
              }
            }

            controller.close();
            await recordAiUsage({
              organizationId: usageOrgId,
              feature: "store_ai",
              model: useThinking ? getThinkingModel() : getModel(),
              description: message,
              inputTokens: usageInput,
              outputTokens: usageOutput,
            });
            console.log(
              `[store-ai] Reply (${escalationModelName}, ${cleanReply.length} chars total):\n${cleanReply}`,
            );
          } catch (e) {
            console.error(
              "[store-ai] Main stage failed:",
              e instanceof Error ? e.message : String(e),
            );
            controller.error(e);
          } finally {
            await closeMcpClients(mcpContext.clients);
          }
        },
      });

      return new Response(stream, { headers: responseHeaders });
    }

    // Non-streaming fallback
    logBlock("non-stream system prompt", systemPrompt);
    logMessages("non-stream messages", convoMsgs);
    const fallbackResult = await generateText({
      model: callMode === "voice" ? getOpenRouterVoiceModel() : getOpenRouterModel(),
      system: systemPrompt,
      messages: convoMsgs,
      maxOutputTokens: maxOutput,
      temperature: callMode === "voice" ? 0.4 : 0.2,
      ...toolOptions(),
    }).finally(async () => {
      await closeMcpClients(mcpContext.clients);
    });
    await recordAiUsage({
      organizationId: usageOrgId,
      feature: callMode === "voice" ? "store_ai_voice" : "store_ai",
      model: callMode === "voice" ? getVoiceModel() : getModel(),
      description: message,
      ...normalizeUsage(fallbackResult.usage),
    });
    const text = fallbackResult.text;

    const localeKey = (lang ?? "en") as keyof typeof CHAT_FALLBACK;
    if (callMode === "voice") {
      const spoken = stripActionBlocks(text ?? "");
      const reply = spoken || VOICE_FALLBACK[localeKey] || VOICE_FALLBACK.en;
      return NextResponse.json({ reply });
    }

    return NextResponse.json({
      reply: text || CHAT_FALLBACK[localeKey] || CHAT_FALLBACK.en,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : "";
    console.error("[store-ai] Error:", errMsg);
    if (errStack) console.error("[store-ai] Stack:", errStack);
    return NextResponse.json({ error: `AI service error: ${errMsg}` }, { status: 500 });
  }
}
