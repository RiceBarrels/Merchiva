/**
 * The triage step in front of every Mr. Merchiva reply, shared by /api/store-ai (streaming chat
 * and voice) and /api/store-ai/enqueue (background jobs).
 *
 * One cheap L1 call reads the request and either answers it outright (greetings, chit-chat,
 * simple writes with every parameter given) or writes a short acknowledgment. Either way it
 * describes the request as eleven yes/no signals; lib/ai/router.ts turns those into a score and a
 * tier. The triage model is never told about scores or tiers.
 *
 * Pure (zod + prompt text): no model client, so it can be unit-tested.
 */

import { z } from "zod";
import { languageNameFor } from "@/lib/i18n/ai-language";
import type { AiTier } from "@/lib/ai/models";
import {
  COMPLEXITY_SIGNALS,
  type AiMode,
  type ComplexitySignal,
} from "@/lib/ai/router";

// Curated kaomoji palette the triage model can pick from. Listed in the schema description so
// the model emits one verbatim. The client's MerchivaWatermark uses whatever string the model
// returns — values outside this list still render fine, just less consistent.
export const KAOMOJI_PALETTE = [
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

/**
 * What each signal means. Used verbatim in the schema's `.describe()` and in the prompt, so the
 * model reads one definition. The engine tools (proposeSchedule, viewRestockSuggestions,
 * viewForecast, viewFinance) compute their numbers themselves; work they do for the model must
 * not inflate math / multiStep / crossModule.
 */
export const SIGNAL_MEANINGS: Readonly<Record<ComplexitySignal, string>> = {
  needsLiveData:
    "The answer must read this store's own data (team, shifts, availability, inventory, sales, suppliers, products, prices, training, finances) that is not already in the conversation. False for greetings, chit-chat, general advice and follow-ups the conversation already answers.",
  write:
    "The request will create, change, delete, approve or send something: shifts, products, prices, inventory, roles, tasks, training, purchase orders, notifications.",
  summarize:
    "The reply must be real written prose about substantial content: a report, a supplier or staff profile, training material, a quiz, an FAQ, a walk-through that ties several facts together. False for a quick read-out of a few facts or figures (a phone number, yesterday's sales, who works today).",
  crossModule:
    "The answer must combine two or more different business areas. Areas: team & schedule · inventory · products & pricing · sales · suppliers & purchasing · finance & payroll · training & roles. Several tables inside one area (team + availability + shifts when scheduling) do not count, and neither does anything a single engine tool combines for you.",
  longText:
    "A lot of text goes in or out: a long pasted document or message, or a reply that must run to many paragraphs or a long list (a full training day, a multi-section report, a quiz with many questions).",
  math:
    "The answer depends on calculations the assistant must do itself: comparing periods, ratios, percentages, allocations, unit or case conversions. False when the figure is read straight from the data or comes out of an engine tool (forecast, finance, restock suggestions, schedule proposal).",
  multiStep:
    "The assistant itself must plan or reason through several dependent steps: weighing options, sequencing changes, reconciling constraints by hand. False when an engine tool does the work (proposeSchedule builds a schedule, viewRestockSuggestions picks reorder quantities, viewForecast predicts demand) and false when the steps are only look-ups.",
  anomaly:
    "The user asks why something changed or went wrong (a drop, a spike, a gap, a mismatch) and the answer needs root-cause reasoning.",
  strategy:
    "The user wants a management or strategic decision: what to do, which option to take, how to allocate money, staff or stock, pricing or growth moves. False for how-to questions about using the app.",
  forecast:
    "The question is about the future or a hypothetical: predictions, projections, 'if this continues', what-if scenarios, expected demand.",
  finance:
    "Profit, margin, cost structure, labor cost against sales, cash flow, P&L, break-even. Plain sales totals ('how were sales yesterday') are not finance.",
};

export interface TriageCalibration {
  request: string;
  /** The signals that are true; every other signal is false. */
  signals: readonly ComplexitySignal[];
  /** Why a signal someone might expect is NOT set. */
  note?: string;
  /** The tier the router must give this example. Tests only — never shown to the model. */
  tier: AiTier;
}

/** Worked examples, shown to the model as request → signals and checked by the router tests. */
export const TRIAGE_CALIBRATION: readonly TriageCalibration[] = [
  { request: "Supplier A's phone?", signals: ["needsLiveData"], tier: 1 },
  { request: "What time is my shift today?", signals: ["needsLiveData"], tier: 1 },
  {
    request: "How were sales yesterday?",
    signals: ["needsLiveData"],
    note: "one figure read out: not math, not finance, not summarize",
    tier: 1,
  },
  { request: "Summarize this supplier", signals: ["needsLiveData", "summarize"], tier: 2 },
  { request: "Why did it drop? (after a sales answer)", signals: ["needsLiveData", "anomaly"], tier: 2 },
  {
    request: "Schedule next week",
    signals: ["needsLiveData", "write"],
    note: "proposeSchedule builds it: not multiStep, not math, not crossModule",
    tier: 1,
  },
  {
    request: "Generate a training quiz",
    signals: ["summarize", "longText"],
    tier: 2,
  },
  {
    request: "Why has profit margin fallen for 3 months?",
    signals: ["needsLiveData", "math", "anomaly", "finance"],
    tier: 3,
  },
  {
    request: "If this continues, what will cash flow be in 3 months?",
    signals: ["needsLiveData", "forecast", "finance"],
    tier: 3,
  },
  {
    request:
      "Allocate purchasing across suppliers for the next 6 months given price, lead time, stock risk and demand",
    signals: ["needsLiveData", "crossModule", "math", "multiStep", "strategy", "forecast"],
    tier: 3,
  },
];

const signalsSchema = z.object({
  needsLiveData: z.boolean().describe(SIGNAL_MEANINGS.needsLiveData),
  write: z.boolean().describe(SIGNAL_MEANINGS.write),
  summarize: z.boolean().describe(SIGNAL_MEANINGS.summarize),
  crossModule: z.boolean().describe(SIGNAL_MEANINGS.crossModule),
  longText: z.boolean().describe(SIGNAL_MEANINGS.longText),
  math: z.boolean().describe(SIGNAL_MEANINGS.math),
  multiStep: z.boolean().describe(SIGNAL_MEANINGS.multiStep),
  anomaly: z.boolean().describe(SIGNAL_MEANINGS.anomaly),
  strategy: z.boolean().describe(SIGNAL_MEANINGS.strategy),
  forecast: z.boolean().describe(SIGNAL_MEANINGS.forecast),
  finance: z.boolean().describe(SIGNAL_MEANINGS.finance),
});

export const triageSchema = z.object({
  directReply: z
    .boolean()
    .describe(
      "True when you finish the request yourself in `message`, without the store's data: greetings, chit-chat, clarifications from the conversation, and simple writes whose every parameter the user already gave. False when the store's data, analysis or a data-dependent write is needed — then `message` is only a short acknowledgment.",
    ),
  signals: signalsSchema.describe(
    "Describe the request, whether or not you answer it directly. Each signal is true only when its definition fits.",
  ),
  message: z
    .string()
    .describe(
      "If directReply=true: the FULL reply in the user's language — plain text for chit-chat, OR text plus ```action``` JSON blocks for simple writes (one block per action). If directReply=false: one short sentence naming what is about to be checked. In voice mode: NEVER include action blocks — TTS can't speak them.",
    ),
  kaomoji: z
    .string()
    .describe(
      `Pick ONE kaomoji from the palette below that matches the mood of your reply. This face is displayed as a watermark on the chat panel so the user gets ambient feedback about your tone. Return the face EXACTLY as written (the unicode characters, no quotes, no surrounding text). Palette:\n${KAOMOJI_PALETTE.map((k) => `- ${k.face} — ${k.mood}`).join("\n")}\nPick the one that fits — happy/warm faces for praise and easy wins, thinking faces while the request is being worked on, surprised/concerned for anomalies you spot, apologetic for errors. Default to (◕‿◕) when in doubt.`,
    ),
});

export type TriageResult = z.infer<typeof triageSchema>;

/**
 * The repair generateObject runs when a triage reply fails the schema. gpt-oss (L1) sometimes
 * flattens `signals` into the top level ({"directReply":false,"needsLiveData":true,…}); about one
 * triage in five failed that way, and the reply lost its acknowledgment and fell back to L2. The
 * flat signal keys are folded back into `signals`, a signal it left out is false (the prompt's own
 * rule: "when unsure, false"). Null for any other failure, which then stays a failure.
 */
export function repairTriageText(text: string): string | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  const nested = record.signals;
  const signals: Record<string, unknown> =
    nested && typeof nested === "object" && !Array.isArray(nested) ? { ...(nested as Record<string, unknown>) } : {};
  let repaired = false;
  for (const signal of COMPLEXITY_SIGNALS) {
    if (signal in record) {
      if (!(signal in signals)) signals[signal] = record[signal];
      delete record[signal];
      repaired = true;
    }
    if (typeof signals[signal] !== "boolean") {
      signals[signal] = signals[signal] === "true";
      repaired = true;
    }
  }
  return repaired ? JSON.stringify({ ...record, signals }) : null;
}

function signalGuide(): string {
  const definitions = COMPLEXITY_SIGNALS.map((s) => `   - ${s}: ${SIGNAL_MEANINGS[s]}`).join("\n");
  const examples = TRIAGE_CALIBRATION.map(
    (ex) => `   - "${ex.request}" → ${ex.signals.join(", ")}${ex.note ? ` (${ex.note})` : ""}`,
  ).join("\n");
  return `SIGNALS — describe the request, whether or not you answer it directly. A signal is true only when its definition fits; when unsure, false.
${definitions}

   Calibration (request → the signals that are true; every other signal is false):
${examples}
   Greetings, thanks and small talk → no signals. A simple write with every parameter given → write only.`;
}

/**
 * `pageNote` is the one-line CURRENT PAGE note (lib/ai/page-prompt.ts pageTriageNote), so a request
 * that only makes sense on the page the user is looking at is classified as what it is.
 */
export function buildTriagePrompt(lang: string, mode: AiMode, pageNote = ""): string {
  const prompt = triagePromptFor(lang, mode);
  return pageNote ? `${prompt}\n\n${pageNote}` : prompt;
}

function triagePromptFor(lang: string, mode: AiMode): string {
  const languageName = languageNameFor(lang);

  if (mode === "voice") {
    return `You are Mr. Merchiva's voice triage layer. The user is on a voice call — \`message\` will be spoken aloud through TTS. Read the user's request together with the conversation history, then fill in every field.

DIRECT REPLY
A) directReply=true — answer directly yourself (SIMPLE task):
   - Greetings, thank-yous, chitchat, opinion questions ("you doing ok?", "what's up?")
   - Clarifications or follow-ups answerable from the conversation history
   - Quick facts already stated in the conversation
   - When the user asks for ANY write/action (schedule, add product, edit price, etc.): briefly acknowledge AND tell them to switch to text chat to execute it — voice can't approve action blocks
   Put the COMPLETE spoken reply (1-3 short sentences, max ~50 words) in \`message\`.
   A direct reply never reads store data: if the answer depends on anything not in the conversation, set needsLiveData=true and directReply=false.
   The switch-to-text-chat reply for a write needs no store data, so it stays directReply=true even when the write itself would read data: "Schedule next week" → directReply=true, that reply in \`message\`, and the signals still describe the request (needsLiveData, write).

B) directReply=false — the request goes on to a model with the store's tools (COMPLEX task):
   - Needs live store data to answer ("how's revenue this week", "what's running low")
   - Analysis, anomaly detection, recommendations
   - Anything requiring inspection of actual numbers in the store
   Put a SHORT (1 sentence, max 15 words) spoken acknowledgment in \`message\` that names what you're about to check.

Spoken acknowledgment examples (adapt — never copy verbatim):
- "好的，我先看一下你的排班，稍等。"
- "好的，让我查一下今天的销售和库存。"
- "Got it — let me check your inventory."

${signalGuide()}

LANGUAGE: write \`message\` in ${languageName}.

FORMATTING (CRITICAL — TTS): plain spoken text only. NO markdown, NO code blocks, NO \`\`\`action\`\`\` blocks, NO JSON, NO bullet lists, NO numbered lists, NO headers. NO emoji of any kind (no 🌟 ✅ 👍 ❤️ 🎉 etc.) — emoji is reserved for the \`kaomoji\` field, never inside \`message\`. Spell out numbers naturally when it sounds clearer.`;
  }

  return `You are Mr. Merchiva's triage layer. Read the user's request together with the conversation history, then fill in every field.

DIRECT REPLY
A) directReply=true — answer directly yourself (SIMPLE task):
   What counts as simple:
   - Greetings, chitchat, thank-yous, opinion questions
   - Clarifications/follow-ups answerable from conversation history
   - Quick facts already stated in the conversation
   - SIMPLE write actions where the parameters are already given by the user and don't require store-data lookup:
     • Add 1-2 products with name/price provided ("加一个商品叫拿铁，4.99")
     • Add a single shift for a named person + named day ("给小明排明天早班")
     • Edit one price ("把美式改成3.5")
     • Delete one role / coupon / shift by name
     • Approve a single time-off request by name
     • Add 1-2 role tasks ("给收银员加个开店准备任务")
   For these, put the FULL reply in \`message\` — include the \`\`\`action\`\`\` blocks if needed, following the system's action format conventions.
   A direct reply never reads store data: if the answer depends on anything not in the conversation, set needsLiveData=true and directReply=false.

B) directReply=false — the request goes on to a model with the store's tools (COMPLEX task):
   - Anything that needs live store data, analysis or anomaly detection ("销售怎么样", "哪些库存不够")
   - BULK writes or writes that depend on data: scheduling a whole week, adding many products, swapping shifts based on availability
   - Anything where IDs must be looked up, availability/conflicts cross-referenced, or totals computed
   - Anything ambiguous where the live data would have to be inspected to decide what to do
   - A follow-up that hands the decision to you ("你安排一下", "你看着办", "随便", "you decide", "just do it") after a write request: it CONTINUES that write (write=true), never a clarification — do not answer it with a question
   Put a 1-sentence acknowledgment in \`message\` that names specifically what is about to be checked — be concrete, not generic. The acknowledgment never asks the user for anything (no questions, no requests for names, details, content or ids) — the model with the store's tools works that out.

Acknowledgment style (adapt to the request, never copy verbatim):
- "查看接下来7天的员工可用性和已有排班。"
- "查一下今天的销售和库存，找出需要补货的商品。"
- "Pulling up inventory and recent sales to spot what's running low."

${signalGuide()}

LANGUAGE: write \`message\` in ${languageName}. Do not switch languages.

When emitting \`\`\`action\`\`\` blocks (only for case A simple writes), follow these rules:
- Output one \`\`\`action\`\`\` block per action, each on its own line with valid JSON
- For addShift: include staffName, date (YYYY-MM-DD), startTime, endTime, shiftType, staffRoles
- For addProduct: include name, price (and any other fields the user provided)
- For updatePrice: include productId (if known from context) or productName, plus newPrice
- For role/task changes: use the IDs from conversation context — if the ID isn't known, set directReply=false instead

FORMATTING for non-action-block content in \`message\`: plain conversational text. Action blocks ARE allowed for simple writes (case A only).

NO EMOJI: never use emoji (🌟 ✅ 👍 ❤️ 🎉 ✨ 🚀 etc.) in the \`message\` field. The mood expression slot is the \`kaomoji\` field — that's where the face goes. Plain text only in \`message\`, kaomoji is separate.

NO SERVICE-SPEAK in \`message\`: NEVER use "I'll help you…", "Let me…", "好的，我幫你…", "我这就帮你…", "我来为你…", "让我帮你…" or any other preamble that promises a future action. State the answer or do the thing. Examples — BAD: "好的，我幫你查一下排班…" GOOD: "未來7天的排班如下：…" / BAD: "Let me check inventory for you…" GOOD: "Inventory:" then the data. The user can see you're working from the chat spinner — don't narrate it.

When directReply=false, the \`message\` field IS the brief ack the user sees while the request is worked on. Keep it 1 short sentence describing what's about to be checked, NOT a "幫你…" promise and NOT a request for information. BAD: "好的，我先帮你查看接下来7天的员工可用性…" BAD: "请提供具体的任务名称和描述。" GOOD: "查看接下来7天的员工可用性和已有排班。" GOOD: "查看 Staff 岗位，拟定咖啡店的日常任务。"`;
}

/** generateObject settings for the triage call, per mode. */
export function triageCallSettings(mode: AiMode) {
  return {
    // Voice acks are one sentence; chat direct replies may carry a few action blocks. Both leave
    // room for the eleven signals.
    maxOutputTokens: mode === "voice" ? 400 : 1000,
    temperature: mode === "voice" ? 0.4 : 0.3,
    providerOptions: {
      openai: {
        reasoningEffort: "minimal",
        reasoning_effort: "minimal",
      },
      openrouter: {
        reasoning: { effort: "minimal", exclude: true },
      },
    },
  };
}

/**
 * Whether the triage reply IS the answer. A direct reply that claims to need store data is not
 * trusted — the triage model has no tools, so that answer could only be invented — and the
 * request goes on to a tool-bearing model instead.
 *
 * Except on a voice call, where every write is answered directly with "switch to text chat":
 * that redirect reads no data even when the write it declines would (needsLiveData still
 * describes the request), and escalating it would swap the instant spoken reply for silence
 * followed by a tool run.
 */
export function shouldReplyDirectly(triage: TriageResult, mode: AiMode): boolean {
  if (!triage.directReply || triage.message.trim().length === 0) return false;
  if (!triage.signals.needsLiveData) return true;
  return mode === "voice" && triage.signals.write;
}

/**
 * The acknowledgment to show while the escalated reply is written. Empty when the triage message
 * was meant as a full answer (a direct reply overruled by shouldReplyDirectly), so it is never
 * shown twice.
 */
export function ackFor(triage: TriageResult | null): string {
  if (!triage || triage.directReply) return "";
  return triage.message.trim();
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * The last `keep` turns of client-supplied history plus the new message. Only user/assistant
 * turns with string content pass: the history comes from the request body, and a "system" turn
 * in it would speak with the system prompt's authority.
 */
export function conversationMessages(history: unknown, message: string, keep = 10): ChatTurn[] {
  const turns: ChatTurn[] = [];
  if (Array.isArray(history)) {
    for (const entry of history.slice(-keep)) {
      if (!entry || typeof entry !== "object") continue;
      const { role, content } = entry as { role?: unknown; content?: unknown };
      if ((role === "user" || role === "assistant") && typeof content === "string") {
        turns.push({ role, content });
      }
    }
  }
  turns.push({ role: "user", content: message });
  return turns;
}
