import { NextRequest, NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, generateText, generateObject } from "ai";
import { z } from "zod";
import { getAllPromptSegments } from "@/lib/merchiva/skills/registry";
import { recordAiUsage, normalizeUsage } from "@/lib/ai/usage";

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

function languageNameFor(lang: string): string {
  return lang === "zh" ? "Chinese (简体中文)"
    : lang === "es" ? "Spanish (Español)"
    : lang === "fr" ? "French (Français)"
    : lang === "ar" ? "Arabic (العربية)"
    : lang === "hi" ? "Hindi (हिन्दी)"
    : "English";
}

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

function buildBuilderHtmlBlock(builder: Record<string, unknown>): string {
  const siteId = String(builder.siteId ?? "");
  const siteName = builder.siteName ?? "(unnamed site)";
  const pageId = String(builder.pageId ?? "");
  const pageName = builder.pageName ?? "(unknown)";
  const html = String(builder.html ?? "");
  const theme = builder.theme ? JSON.stringify(builder.theme) : "(default)";
  const selected = builder.selectedSelector ? String(builder.selectedSelector) : "";
  const customValues = (builder.customValues ?? {}) as Record<string, string>;
  const pages = Array.isArray(builder.pages) ? builder.pages as Array<{ id: string; name: string; slug: string }> : [];
  const functions = Array.isArray(builder.functions) ? builder.functions as string[] : [];
  const pageSlug = builder.pageSlug ? String(builder.pageSlug) : "";
  const pageMetadata = (builder.pageMetadata ?? {}) as Record<string, string | undefined>;
  const siteSlug = builder.siteSlug ? String(builder.siteSlug) : "";
  const customDomain = builder.customDomain ? String(builder.customDomain) : "";
  const sitePublished = Boolean(builder.sitePublished);
  const siteFeatures = (builder.siteFeatures ?? {}) as Record<string, boolean>;
  const PLUGIN_KEYS = ["auth", "cart", "checkout", "products", "subscriptions", "rewards", "booking", "account"] as const;
  const pluginLines = PLUGIN_KEYS
    .map((k) => `  - ${k}: ${siteFeatures[k] ? "ON" : "off"}`)
    .join("\n");
  const metaLines = ["title", "description", "keywords", "ogImage", "ogTitle", "ogDescription", "canonicalUrl", "robots"]
    .map((k) => `  - ${k}: ${pageMetadata[k] ? `"${String(pageMetadata[k]).slice(0, 100)}"` : "(unset)"}`)
    .join("\n");
  const customValueLines = Object.entries(customValues)
    .map(([k, v]) => `  - {${k}} → "${String(v).slice(0, 80)}"`)
    .join("\n");
  const pageLines = pages
    .map((p) => `  - id: ${p.id}  name: "${p.name}"  slug: ${p.slug}${p.id === pageId ? "  ← CURRENT" : ""}`)
    .join("\n");
  const functionLines = functions.length > 0
    ? functions.map((n) => `  - ${n}`).join("\n")
    : "  (none yet)";
  const valuesBlock = `📌 GLOBAL VALUES — write these as {key} in the HTML; the renderer substitutes them per visitor / page load.

System values (always available, resolved per visitor — READ-ONLY, you cannot setBuilderValue on these):
  - {userName}     → logged-in customer's name (empty for guests)
  - {userEmail}    → logged-in customer's email
  - {userPhone}    → logged-in customer's phone
  - {siteName}     → "${siteName}"
  - {currentYear}  → e.g. "${new Date().getFullYear()}"
  - {currentDate}  → today's date

Site custom values${customValueLines ? " (defined in the Values panel — use these instead of hardcoding):" : " — none defined yet."}
${customValueLines}

Use values whenever you'd otherwise hardcode the same text twice (brand name, phone, address, tagline). Personalized greetings — \`<h1>Welcome back, {userName}!</h1>\` — use system values. If the user asks "what's my address?", check customValues first.

YOU CAN CREATE / UPDATE CUSTOM VALUES via these actions:
  - setBuilderValue(key, value) — create or overwrite a custom value. Key: alphanumeric + underscore, no spaces, must NOT collide with system keys above.
  - deleteBuilderValue(key) — remove a custom value.

WHEN TO CREATE A VALUE (vs. just inlining text):
  - Anything the user might want to change site-wide later: phone, address, hours, tagline, brand color, contact email, social links.
  - Anything that appears (or might appear) in 2+ places: the brand name in nav AND footer, hours in hero AND contact page.
  - Anything the user asked to "remember" or "save" — those are values, not chat memory.
  - When user provides a fact in passing ("we open at 7am"), proactively setBuilderValue("openingTime", "7am") so future references stay in sync.

WHEN NOT TO CREATE A VALUE:
  - One-off prose (a single hero headline, a unique paragraph). Inline it.
  - Anything truly visitor-specific — that's a system value, not a custom one.

WORKFLOW EXAMPLES:

User: "我们的电话是 415-555-0102 加到 footer"
Correct response: define a value AND reference it (so when the user later changes the number, every page updates):
\`\`\`action
{"action":"setBuilderValue","key":"phone","value":"415-555-0102"}
\`\`\`
\`\`\`action
{"action":"editBuilderHtml","old_string":"<footer", "new_string":"<footer><p style=\\"color:#a8a29e;font-size:13px\\">Call us: <a href=\\"tel:{phone}\\" style=\\"color:#fafaf9\\">{phone}</a></p>"}
\`\`\`

User: "把 tagline 改成 'Brewed with care'"
If \`tagline\` already exists in customValues: use setBuilderValue (overwrite). The HTML doesn't change because it already references {tagline}.
\`\`\`action
{"action":"setBuilderValue","key":"tagline","value":"Brewed with care"}
\`\`\`
If it doesn't yet exist: setBuilderValue, then editBuilderHtml to swap inline text for {tagline}.

User: "remove the 'tagline' value"
\`\`\`action
{"action":"deleteBuilderValue","key":"tagline"}
\`\`\`
After deletion, any HTML still referencing {tagline} will render the literal text "{tagline}" — offer to clean those up.

🎨 DESIGN TOKENS — CSS custom properties on the site wrapper.

When the user pastes a CSS \`:root { --x: y; … }\` block (shadcn / tweakcn theme, design system variables, or arbitrary CSS variables), DO NOT copy the rules into the page HTML. Instead extract every \`--name: value\` declaration and call ONE \`setSiteTokens\` action with all the variables as a JSON map. The system injects them onto the site wrapper so any HTML that references \`var(--name)\` resolves them.

Action format:
\`\`\`action
{"action":"setSiteTokens","tokens":{"--background":"oklch(0.97 0 0)","--primary":"oklch(0.48 0.12 263)"},"replace":false}
\`\`\`
- \`tokens\`: object mapping CSS variable name → value. Keys may include or omit the leading \`--\`. Values are raw CSS (oklch / hex / rgb / px / rem / strings).
- \`replace\`: if true, wipe ALL existing site tokens first (use when the user says "set the theme to this", "use these as the theme", or pastes a complete \`:root\` block they want as the authoritative theme). Default false (merge).
- To remove a token, pass it with an empty string value, or use \`deleteSiteTokens({keys:[…]})\`.

Built-in design tokens (already defined in globals.css — both \`:root\` and \`.dark\`):
- Colors (shadcn-style semantic palette): --background, --foreground, --card, --card-foreground, --popover, --popover-foreground, --primary, --primary-foreground, --secondary, --secondary-foreground, --muted, --muted-foreground, --accent, --accent-foreground, --destructive, --destructive-foreground, --border, --input, --ring, --chart-1…5, --sidebar, --sidebar-foreground, --sidebar-primary, --sidebar-accent, --sidebar-border, --sidebar-ring
- Fonts: --font-sans, --font-serif, --font-mono
- Base radius: --radius (default 0.5rem). Computed: --radius-sm, --radius-md, --radius-lg, --radius-xl
- Shadows: --shadow-2xs, --shadow-xs, --shadow-sm, --shadow, --shadow-md, --shadow-lg, --shadow-xl, --shadow-2xl
- Spacing (Merchiva extension): --mv-space-{xs,sm,md,lg,xl,2xl,3xl}
- Text sizes (Merchiva extension): --mv-text-{xs,sm,base,lg,xl,2xl,3xl,4xl,5xl}

The user can override any of these via setSiteTokens — same action, pass the CSS var name as the key. For brand-new tokens that don't exist yet, use the \`--mv-color-{slug}\` / \`--mv-space-{slug}\` etc. namespace so they show up in the corresponding builder picker dropdown.

When you setSiteTokens, also consider whether the page HTML should be updated to USE the new variables. E.g. if the user pastes a theme with \`--primary\`, follow up with editBuilderHtml to swap a hard-coded \`background:#1c1917\` for \`background:var(--primary)\` on the appropriate elements. Ask the user if they want that update applied — don't assume.

EXAMPLE — user pastes:
\`\`\`
:root {
  --background: oklch(0.9755 0.0045 258.3245);
  --primary: oklch(0.4815 0.1178 263.3758);
  --primary-foreground: oklch(0.9856 0.0278 98.0540);
}
\`\`\`
Correct response:
我把这套主题套到了站点上。新加的 CSS 变量已经写到 site tokens 里了；之后 HTML 里用 var(--primary) 之类的引用都会解析到这套值。

\`\`\`action
{"action":"setSiteTokens","tokens":{"--background":"oklch(0.9755 0.0045 258.3245)","--primary":"oklch(0.4815 0.1178 263.3758)","--primary-foreground":"oklch(0.9856 0.0278 98.0540)"},"replace":false}
\`\`\`

EXAMPLE — user says "use this as the only theme, replace anything I had before":
Same action with \`"replace":true\`.

EXAMPLE — user says "delete --primary":
\`\`\`action
{"action":"deleteSiteTokens","keys":["--primary"]}
\`\`\``;

  return `🏗️ BUILDER MODE (HTML) — You are editing a website page as raw HTML.

CURRENT SITE: ${siteName}  (siteId: ${siteId}, slug: ${siteSlug || "(none)"}, domain: ${customDomain || "(none)"}, ${sitePublished ? "published" : "draft"})
CURRENT PAGE: ${pageName}  (pageId: ${pageId}, slug: /${pageSlug || "(none)"})
THEME: ${theme}
${selected ? `CURRENTLY SELECTED ELEMENT: ${selected}` : ""}

📄 PAGES IN THIS SITE (use the id when calling deleteBuilderPage/updateBuilderPage; pass siteId="${siteId}" for addBuilderPage):
${pageLines}

🏷️ CURRENT PAGE METADATA (update via updateBuilderPage with pageId="${pageId}"):
${metaLines}

🔌 SITE PLUGINS (update via updateBuilderSite plugins:{ key: bool }):
${pluginLines}

⚡ FLOWFN FUNCTIONS DEFINED ON THIS SITE (use the name to replace via addBuilderFunction or remove via deleteBuilderFunction):
${functionLines}

${valuesBlock}

CURRENT PAGE HTML (read this — your edits replace or modify it):
\`\`\`html
${html.length > 8000 ? html.slice(0, 8000) + "\n<!-- TRUNCATED -->" : html}
\`\`\`

Available actions in HTML mode (NEVER use addBuilderElement or any JSON-element actions):

  HTML editing on the current page:
  - editBuilderHtml(old_string, new_string, replace_all?) — PREFERRED for any small/surgical change. Exact find-and-replace on the page HTML. Modeled on Claude Code's Edit tool. old_string must appear VERBATIM in the page and (unless replace_all=true) must be unique — include enough surrounding context to disambiguate. Fails cleanly if 0 or >1 matches.
  - setBuilderHtml(html: string) — replace the ENTIRE page HTML. Use only when redesigning the whole page.
  - appendBuilderHtml(html: string) — append a new section to the end of the page.
  - replaceBuilderHtml(selector, html) — replace the first element matching a CSS selector with new HTML. Use when you have a clean unique selector (e.g. \`#hero\`, \`footer\`); otherwise prefer editBuilderHtml.
  - deleteBuilderHtml(selector) — remove elements matching a CSS selector.

  Page management (works on the whole site, not just the current page):
  - addBuilderPage(siteId, name, slug?, sortOrder?, html?) — create a new page. Always pass siteId="${siteId}" from above. The slug auto-derives from the name if you omit it. Pass an html string with semantic markup so the new page isn't blank — write a complete page in the same style as the rest of the site.
  - deleteBuilderPage(pageId) — delete a page by id. Use the id from the PAGES list above (NOT the slug or name). High-risk: confirm with the user first if you're unsure.

  FlowFn function management (works on the whole site):
  - addBuilderFunction(name, nodes, edges, tests?) — create OR REPLACE a function by name (idempotent). To "edit" an existing function, just call this again with the same \`name\` and the new graph. See the FUNCTIONS section below for the node format.
  - deleteBuilderFunction(name) — delete a function by name.

  Site values (custom global vars, referenced as {key} in HTML):
  - setBuilderValue(key, value) — create or update a custom value. See GLOBAL VALUES section for when to use.
  - deleteBuilderValue(key) — remove a custom value.

  Page & site properties (page-level SEO and site-level identity / plugins — do NOT confuse with HTML edits):
  - updateBuilderPage(pageId, name?, slug?, title?, description?, keywords?, ogImage?, ogTitle?, ogDescription?, canonicalUrl?, robots?) — update the current page's name, slug, and SEO metadata. Pass only the fields you want to change. ALWAYS pass pageId="${pageId}" for the current page (or any other id from the PAGES list to edit a different one).
  - updateBuilderSite(name?, slug?, customDomain?, published?, plugins?) — update site identity and plugin toggles. plugins is an object: { "cart": true, "booking": false, ... }. Allowed plugin keys: auth, cart, checkout, products, subscriptions, rewards, booking, account.

CHOOSING THE RIGHT EDIT ACTION:
  - Tweaking text, swapping a color/size, fixing a typo, renaming a button → editBuilderHtml (smallest possible old_string with enough context to be unique).
  - Replacing an entire <section> or <header> that has an id or unique tag → replaceBuilderHtml.
  - Adding a brand-new section that doesn't yet exist → appendBuilderHtml.
  - Full page redesign → setBuilderHtml.
  - "add a new page about X" / "make a contact page" → addBuilderPage with a thoughtful initial html.
  - "delete the FAQ page" → deleteBuilderPage with that page's id (confirm first if multiple plausible matches).
  - "make a function that does X" or "change the bumpVisits function to also log" → addBuilderFunction (replaces by name).
  - "remove the greetCustomer function" → deleteBuilderFunction.
  - "remember our phone is X" / "save the tagline as Y" / "set address to Z" → setBuilderValue (and reference it via {key} in the relevant HTML).
  - "forget the tagline value" → deleteBuilderValue.
  - "change the page title to …" / "set SEO description to …" / "rename this page" / "change the URL slug" → updateBuilderPage (pageId required; pass only the changed fields). This is the <title>/<meta> layer, NOT the visible <h1> on the page — to also change the heading on the page itself, follow up with editBuilderHtml.
  - "rename the site" / "set custom domain to example.com" / "publish the site" / "turn on booking" / "disable the cart" → updateBuilderSite. For plugins use the plugins object: { "booking": true }. Domain: pass empty string "" to remove.

updateBuilderPage / updateBuilderSite RULES:
  1. Only pass the fields you want to change. Omitted fields keep their current values — these actions MERGE, they do not overwrite.
  2. Bundle multiple field changes into ONE action call when they target the same target (one updateBuilderPage with title + description + keywords is better than three separate calls).
  3. Page title (SEO) is separate from the visible page heading. If the user says "change the page title", first ask whether they mean the browser-tab title (use updateBuilderPage) or the on-page heading (use editBuilderHtml on the <h1>). If unsure, do both.

editBuilderHtml RULES (read carefully — these mirror Claude Code's Edit tool):
  1. old_string MUST appear in the page HTML exactly as written, character-for-character (including whitespace, quotes, inline styles). Do not paraphrase or re-format.
  2. old_string must be unique on the page. If the same text appears more than once, add MORE surrounding context until exactly one match remains, OR set replace_all=true to change every occurrence.
  3. old_string and new_string must differ.
  4. Prefer small, surgical edits over large blocks — easier to verify, less risk of clobbering unrelated changes.
  5. If you're unsure whether old_string is unique, expand the context (include the parent tag, an adjacent sibling, an attribute value) rather than guess.

Dynamic widgets — embed live React components inside HTML by writing placeholders:
  <div data-widget="cart"></div>          — shopping cart
  <div data-widget="login"></div>          — login form
  <div data-widget="booking-form"></div>   — booking form
  <div data-widget="product-card" data-product-id="…"></div>
  <div data-widget="gallery"></div>
The storefront hydrates these on render. In editor preview they show as placeholder boxes.

⚙️ FUNCTIONS — you can author FlowFn (visual function) graphs the user runs from the Functions tab. Use addBuilderFunction to create or replace, deleteBuilderFunction to remove.

  addBuilderFunction(name, nodes, edges, tests?)
  deleteBuilderFunction(name)

EDITING AN EXISTING FUNCTION:
- addBuilderFunction is idempotent — calling it again with the same \`name\` REPLACES the function entirely. There is no patch/append API; emit the full new graph.
- Before editing, check the FLOWFN FUNCTIONS list above to see what currently exists. If the user says "edit greetCustomer to also append a smiley", emit a fresh greetCustomer with the new node graph.
- Renaming a function: emit the new name AND deleteBuilderFunction the old name (two action blocks).
- Keep node \`id\`s short and descriptive (\`p1\`, \`v1\`, \`a1\`, \`r1\`). The user can't see the ids; readability is for you.
- If the user only describes a behavior change in plain English ("add error handling", "log every call"), still emit the FULL graph — don't pretend a partial edit exists.

A FlowFn function is a JS function compiled from a node graph. Each node has \`{id, type, x, y, data}\`; edges connect node ports as \`{from:{node, port}, to:{node, port}}\`. Every function must have at least one \`return\` node (its only input is \`value\`).

Useful node types and their I/O:
  - param          inputs:[]               outputs:[out]            data:{name, type:"string"|"number"|"bool"|"any"|"array"|"object"}  — function parameter
  - return         inputs:[value]          outputs:[]              — function output (REQUIRED)
  - const-string   inputs:[]               outputs:[out]            data:{value}  — string literal
  - const-number   inputs:[]               outputs:[out]            data:{value}  — number literal
  - const-bool     inputs:[]               outputs:[out]            data:{value}  — boolean literal
  - value-get      inputs:[]               outputs:[out]            data:{key}    — read site value (custom or system) by key
  - value-set      inputs:[value]          outputs:[out]            data:{key}    — write a custom site value (PERSISTS to DB)
  - add/sub/mul/div  inputs:[a,b]          outputs:[out]            — arithmetic
  - concat         inputs:[a,b]            outputs:[out]            — string concat
  - upper/lower/trim  inputs:[s]           outputs:[out]            — string ops
  - if             inputs:[cond,a,b]       outputs:[out]            — ternary
  - id-sel         inputs:[]               outputs:[out]            data:{id}     — "#that-id" CSS selector
  - dom-set        inputs:[sel,text]       outputs:[out]            — set element text
  - dom-get        inputs:[sel]            outputs:[out]            — read element text
  - dom-style      inputs:[sel,value]      outputs:[out]            data:{prop}   — set inline style
  - fetch          inputs:[url]            outputs:[out]            data:{method} — await fetch().json()

Layout nodes on a 200-px grid (x:80, x:280, x:480, x:680). Connect each input via an edge from a producer's \`out\` port to the consumer's input port name.

EXAMPLE — a function "greetCustomer(name)" that reads a tagline value, concats it, and returns the greeting:
\`\`\`action
{"action":"addBuilderFunction","name":"greetCustomer","nodes":[
  {"id":"p1","type":"param","x":80,"y":120,"data":{"name":"name","type":"string"}},
  {"id":"v1","type":"value-get","x":80,"y":260,"data":{"key":"tagline"}},
  {"id":"c1","type":"const-string","x":280,"y":120,"data":{"value":"Hi "}},
  {"id":"c2","type":"const-string","x":280,"y":260,"data":{"value":" — "}},
  {"id":"j1","type":"concat","x":480,"y":120,"data":{}},
  {"id":"j2","type":"concat","x":480,"y":220,"data":{}},
  {"id":"j3","type":"concat","x":680,"y":160,"data":{}},
  {"id":"r1","type":"return","x":880,"y":160,"data":{}}
],"edges":[
  {"from":{"node":"c1","port":"out"},"to":{"node":"j1","port":"a"}},
  {"from":{"node":"p1","port":"out"},"to":{"node":"j1","port":"b"}},
  {"from":{"node":"j1","port":"out"},"to":{"node":"j2","port":"a"}},
  {"from":{"node":"c2","port":"out"},"to":{"node":"j2","port":"b"}},
  {"from":{"node":"j2","port":"out"},"to":{"node":"j3","port":"a"}},
  {"from":{"node":"v1","port":"out"},"to":{"node":"j3","port":"b"}},
  {"from":{"node":"j3","port":"out"},"to":{"node":"r1","port":"value"}}
]}
\`\`\`

EXAMPLE — a side-effect function "bumpVisits()" that increments the \`visitCount\` value:
\`\`\`action
{"action":"addBuilderFunction","name":"bumpVisits","nodes":[
  {"id":"v1","type":"value-get","x":80,"y":160,"data":{"key":"visitCount"}},
  {"id":"c1","type":"const-number","x":80,"y":300,"data":{"value":1}},
  {"id":"a1","type":"add","x":280,"y":220,"data":{}},
  {"id":"s1","type":"value-set","x":480,"y":220,"data":{"key":"visitCount"}},
  {"id":"r1","type":"return","x":680,"y":220,"data":{}}
],"edges":[
  {"from":{"node":"v1","port":"out"},"to":{"node":"a1","port":"a"}},
  {"from":{"node":"c1","port":"out"},"to":{"node":"a1","port":"b"}},
  {"from":{"node":"a1","port":"out"},"to":{"node":"s1","port":"value"}},
  {"from":{"node":"s1","port":"out"},"to":{"node":"r1","port":"value"}}
]}
\`\`\`

Function naming: lowerCamelCase, no spaces. The user can find/run functions from the Functions tab next to the page tabs.

🚨 OUTPUT RULES (CRITICAL):
1. EVERY action wrapped in \`\`\`action ... \`\`\` — never bare.
2. The \`html\` value is a JSON-encoded string — escape \\n, \\", \\\\ correctly.
3. Use semantic, modern HTML5: <header>, <section>, <nav>, <main>, <footer>, <article>.
4. Inline styles or scoped <style> blocks are fine — Tailwind is NOT loaded inside the iframe by default.
5. When the user says "redesign the page" use setBuilderHtml. When they say "add a section" use appendBuilderHtml. When they say "change the hero" use replaceBuilderHtml with a selector matching the hero. For ANY smaller tweak (change a word, swap a color, fix a typo, rename a button) use editBuilderHtml with the smallest unique old_string.
6. Keep total output under ~3500 tokens. For full-page redesigns, write tight semantic HTML; don't over-decorate.

📝 TEXT MUST BE WRAPPED — no naked text nodes ever. The editor lets users double-click a text element to edit it inline, but that ONLY works if the text sits inside a real text tag.
- ALL visible text MUST live inside one of: <p>, <h1>, <h2>, <h3>, <h4>, <h5>, <h6>, <span>, <a>, <button>, <li>, <label>, <strong>, <em>, <small>, <blockquote>, <figcaption>.
- NEVER write \`<div>Some text</div>\` — wrap it: \`<div><p>Some text</p></div>\`.
- NEVER mix raw text and child elements inside a container — always wrap the text. Wrong: \`<section><h1>Title</h1>Some intro text<button>…</button></section>\`. Right: \`<section><h1>Title</h1><p>Some intro text</p><button>…</button></section>\`.
- Inside a button or link, the text is already wrapped (button/a count as text tags). \`<button>Sign up</button>\` is fine.
- For a card with title + description: \`<div><h3>Title</h3><p>Description</p></div>\` — title in h3, description in p, never naked.
- For a number/stat: wrap in \`<span>\` or \`<p>\` so the user can edit it: \`<p><span style="font-size:48px;font-weight:700">$12.50</span> per month</p>\`.

🎨 ICONS — use lucide-style inline SVG, never emoji. The lucide icon set is the standard; you write the SVG inline because no icon font is loaded.
- The pattern: \`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">…paths…</svg>\`. The default \`stroke-width="2"\` and \`stroke-linecap="round"\` give the lucide look.
- Size icons in the markup: 16 (inline with text), 20 (buttons), 24 (section anchors), 32+ (hero/feature). Color via \`color: …\` on the parent or \`stroke="…"\` on the svg.
- Common icons (paste these path data verbatim — they're real lucide icons):
  - check:        \`<polyline points="20 6 9 17 4 12"/>\`
  - arrow-right:  \`<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>\`
  - star:         \`<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>\`
  - heart:        \`<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>\`
  - clock:        \`<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>\`
  - map-pin:      \`<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>\`
  - phone:        \`<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>\`
  - mail:         \`<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>\`
  - menu:         \`<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>\`
  - shopping-bag: \`<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>\`
  - coffee:       \`<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>\`
  - utensils:     \`<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>\`
- For other icons (calendar, user, x, chevrons, plus, trash, edit, settings, etc.) — use lucide.dev path data; recall it accurately or skip the icon. NEVER substitute an emoji for an icon. NEVER use FontAwesome class names like \`<i class="fa-…">\` (no font is loaded).

🎨 DESIGN PRINCIPLES — make the UI look professional, not AI-generated:

TYPOGRAPHY (the #1 thing that makes a site look pro):
- Establish hierarchy via SCALE, not decoration. Use a 1.25–1.333 ratio: 14 → 18 → 24 → 32 → 48 → 64 → 80px.
- Headings: tight letter-spacing (-0.02em on h1/h2), tight line-height (1.05–1.15). Body: line-height 1.5–1.65.
- Limit to 2 weights per page (e.g. 400 + 700, or 500 + 800). NEVER use font-weight:bold on long paragraphs.
- Body text 16–18px. Hero h1 48–80px on desktop. Section h2 32–44px.
- Set max-width on text columns: 60–75ch (or ~640px). Walls of text spanning the full viewport read as amateur.
- One font for the whole page is FINE and modern. If you mix, use one for headings + one for body — never three.

COLOR — restraint wins:
- Pick ONE accent color. Use it for CTAs, links, and at most one secondary accent. Everything else is neutral (stone/slate/zinc grays).
- Build a tiny palette: 1 background (#fafaf9 or #fff or #0c0a09), 1 surface (cards: #fff or #1c1917), 1 text (#1c1917 or #fafaf9), 1 muted text (#78716c), 1 border (#e7e5e4 or #292524), 1 accent.
- Body text should be near-black (#1c1917, #18181b) on light, near-white (#fafaf9) on dark — NOT pure #000 or #fff.
- Gradients: use sparingly, only on hero or feature cards, with subtle adjacent hues (e.g. #0ea5e9 → #6366f1, NOT red → green). Stop using rainbow gradients.
- Dark mode hint: if the theme suggests dark, use #0c0a09 / #18181b backgrounds with #fafaf9 text.

SPACING — 8px rhythm, generous whitespace:
- All padding/margin/gap values from this scale: 4, 8, 12, 16, 24, 32, 48, 64, 80, 96, 128px. No 13px, no 27px.
- Section vertical padding: 64–128px on desktop. Hero: 96–160px. Cards: 24–40px internal padding.
- Spacing between siblings tells the eye what's grouped. Keep related items close (8–16px), unrelated items far (48–96px).

LAYOUT & COMPOSITION:
- Wrap content in a centered container with max-width 1100–1280px and horizontal padding (24px desktop, 16px mobile). NEVER let text/layout span the full viewport edge-to-edge.
- Use CSS grid for feature/pricing/team cards: \`display:grid; grid-template-columns:repeat(3,1fr); gap:24px\` — and use \`repeat(auto-fit,minmax(280px,1fr))\` for responsive without media queries.
- Align everything to a consistent grid. Left-align body text, center-align only short headings/CTAs.
- Asymmetry > symmetry for hero sections (e.g. text 60% left, image 40% right).

VISUAL POLISH:
- Borders: 1px solid in a subtle border color, NOT thick colored borders. Use border-radius 6–12px for cards, 8px for buttons, 999px for pills.
- Shadows: subtle and layered — \`box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)\`. Avoid hard black shadows or neon glows.
- Buttons: padding 12px 24px (primary), height ~44px, font-weight 500–600, border-radius 8px. Hover: subtle bg shift, never wild color flips.
- Images: always add border-radius (8–16px for cards, 50% for avatars). Set aspect-ratio so layout doesn't jump.
- Animations: only \`transition: all 0.2s ease\` on hover/focus. No bouncing, no auto-rotating carousels, no parallax.

🚫 DON'T SOUND LIKE AI — the single most important section. AI-gen sites have a recognizable smell. Avoid every item below; if your draft contains one, rewrite it.

COPY — the dead giveaways:
- BAN these opening words: "Welcome to", "Discover", "Experience", "Unlock", "Empower", "Elevate", "Transform", "Crafted with care", "Where ___ meets ___", "Your destination for", "More than just a ___", "We believe that ___".
- BAN these adjective-noun combos: "innovative solutions", "cutting-edge technology", "seamless experience", "curated selection", "premium quality", "passionate team", "unparalleled service".
- BAN buzzwords: leverage, synergy, holistic, robust, scalable, frictionless, world-class, next-generation, revolutionary, game-changing.
- BAN throat-clearing phrases: "In today's fast-paced world", "Whether you're ___ or ___", "At [BusinessName], we ___", "Our mission is to ___".
- DO write copy that sounds like a real human owner wrote it at 7am while opening up. Specific > generic. Concrete > abstract. Sensory > conceptual. A coffee shop says "Pour-over Ethiopian Yirgacheffe, ground at 7:42am" — not "premium artisanal coffee experience".
- DO use the BUSINESS-SPECIFIC details from the store context (real product names, real categories, real store name, hours if known). Generic copy = AI smell. Specific copy = human.
- Headlines should be a STATEMENT or PROMISE about THIS business, not a category description. Bad: "Premium Coffee Experience". Good: "Open since 6am. Closed when the croissants run out."
- Buttons say what happens, not "Get Started" / "Learn More" / "Discover More". Use "See today's menu" / "Reserve a table" / "Order pickup" / "Read about Maria".
- One-word section titles often beat multi-word ones: "Menu" not "Our Curated Menu Selection".

VISUAL — the tells:
- Emoji as section anchors (🚀 ⚡ 🎯 ✨ 🍔 ☕ 💖) — DELETE THEM. Use a single inline SVG icon, or no icon at all. ONE place emoji is OK: when the BUSINESS would actually use them (a kids' party planner, a Gen-Z brand). For a coffee shop, restaurant, lawyer, accountant — no emoji.
- Three identical feature/benefit cards in a 1-2-3 row. AI defaults to this; humans don't. Use 2 asymmetric cards, or a single big section, or a left-aligned bullet list, or alternating left/right image+text rows.
- Hero pattern of "huge centered headline + sub-text + two buttons (primary + ghost)" — too SaaS-template. Try left-aligned, or asymmetric (text 60% + image 40%), or with the headline tucked into a corner above a wide product image, or kebab-list style.
- Glassmorphism (frosted blur + 1px white inner border on cards). Soft purple-blue gradient blobs in the background. Dot-grid hero backgrounds. SaaS-aesthetic shadows. Skip all of these unless the business is genuinely a tech startup.
- "Trust badges" / "As featured in" rows on a small business that has no press. Skip. If they have one real badge, show one.
- "Built for ___ / Made for ___ / Powered by ___" tags next to logos. Just write the brand name.
- Identical \`border-radius: 12px\` on every box. Vary by element type — cards 12px, buttons 8px, images 16px, pills 999px. Or sometimes square edges. Match the brand: a butcher shop should NOT have rounded corners everywhere.
- Center-aligning everything. Real designers center HERO copy and CTAs only; everything else is left-aligned.

STRUCTURE — the patterns to break:
- Don't always go: hero → 3 features → testimonial → pricing → CTA. That's the AI default. Vary the rhythm. A bakery's homepage might be: hero → today's bread (with photos and prices) → "About the bakers" with one big image → opening hours → footer. No feature grid. No testimonial section unless they have real testimonials.
- Don't add a section just because pages "usually have one". Real sites have 3–6 sections. AI sites bloat to 8–10 with redundant content.
- If you don't have real content for a section (no testimonials, no team photos, no press logos), DO NOT MAKE ONE. Empty placeholder sections shout AI. Skip the section.

VOICE — write like a person, not a marketing agency:
- Short sentences. Contractions ("we're", "don't", "you'll"). Ordinary words. One concrete number or name per paragraph.
- A real owner brags about specifics — the supplier, the recipe origin, the year they opened, the regular customer who comes every Tuesday. Pull these from the store context if available; otherwise leave it short rather than fake-deep.
- Match the LANGUAGE of the user's request. If the user spoke Chinese, write copy in Chinese; same for any locale. Don't switch to corporate English.

WHEN IN DOUBT — strip, don't add. Most AI-gen sites are over-decorated. A page with 3 well-typeset sections and one good photo beats a page with 8 generic sections, 3 gradients, and a dozen emoji icons. If you can't think of specific copy, write SHORTER copy, not vaguer copy.

OTHER TECHNICAL DON'TS:
- Random rainbow gradients, drop shadows on text, glow effects, neon borders.
- Lorem ipsum or any placeholder text. Use the real store name and real product names from context.
- Inline \`onclick=\` JS — keep HTML semantic; interactivity comes from data-widget hydration.

CONCRETE PATTERNS YOU CAN REACH FOR:
- Hero: <section style="padding:96px 24px;max-width:1100px;margin:0 auto"><h1 style="font-size:64px;font-weight:700;line-height:1.05;letter-spacing:-0.02em;margin:0 0 24px;max-width:720px">…</h1><p style="font-size:20px;line-height:1.5;color:#57534e;margin:0 0 32px;max-width:560px">…</p><a href="…" style="display:inline-block;padding:12px 24px;background:#1c1917;color:#fff;border-radius:8px;text-decoration:none;font-weight:500">…</a></section>
- Feature card: <div style="padding:32px;background:#fff;border:1px solid #e7e5e4;border-radius:12px"><h3 style="font-size:18px;font-weight:600;margin:0 0 8px">…</h3><p style="font-size:14px;line-height:1.6;color:#57534e;margin:0">…</p></div>
- Section divider: rely on background color shifts (#fff vs #fafaf9 vs #f5f5f4) rather than visible <hr> lines.
- Footer: <footer style="padding:48px 24px;background:#1c1917;color:#a8a29e;text-align:center;font-size:13px">© ${siteName}</footer>

EXAMPLES (HTML mode):

User: "redesign the homepage with fancy gradient hero and 3 feature cards"
Correct response:
我给你做了一个带渐变 hero 和三张特性卡片的新主页：
\`\`\`action
{"action":"setBuilderHtml","html":"<header style=\\"padding:96px 24px;background:linear-gradient(135deg,#0ea5e9,#a855f7);color:#fff;text-align:center\\"><h1 style=\\"font-size:56px;font-weight:800;margin:0 0 16px\\">${siteName}</h1><p style=\\"font-size:20px;opacity:.9;margin:0 0 32px\\">Crafted with care.</p><a href=\\"/menu\\" style=\\"display:inline-block;padding:14px 32px;background:#fff;color:#1e293b;border-radius:8px;text-decoration:none;font-weight:600\\">Explore →</a></header><section style=\\"padding:80px 24px;background:#fafaf9\\"><div style=\\"max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:24px\\"><div style=\\"padding:32px;background:#fff;border-radius:12px;border:1px solid #e7e5e4\\"><h3 style=\\"font-size:20px;font-weight:700;margin:0 0 8px\\">🍰 Fresh Daily</h3><p style=\\"color:#57534e;margin:0\\">Baked every morning before 7am.</p></div><div style=\\"padding:32px;background:#fff;border-radius:12px;border:1px solid #e7e5e4\\"><h3 style=\\"font-size:20px;font-weight:700;margin:0 0 8px\\">☕ Local Beans</h3><p style=\\"color:#57534e;margin:0\\">Single-origin from family farms.</p></div><div style=\\"padding:32px;background:#fff;border-radius:12px;border:1px solid #e7e5e4\\"><h3 style=\\"font-size:20px;font-weight:700;margin:0 0 8px\\">💖 Loyalty</h3><p style=\\"color:#57534e;margin:0\\">Earn points on every visit.</p></div></div></section>"}
\`\`\`

User: "add a contact section at the bottom"
Correct response:
\`\`\`action
{"action":"appendBuilderHtml","html":"<section style=\\"padding:64px 24px;background:#1c1917;color:#fff;text-align:center\\"><h2 style=\\"font-size:32px;font-weight:700;margin:0 0 8px\\">Visit us</h2><p style=\\"opacity:.7;margin:0 0 16px\\">123 Main St · Open 7am–9pm</p></section>"}
\`\`\`

User: "remove the footer"
Correct response:
\`\`\`action
{"action":"deleteBuilderHtml","selector":"footer"}
\`\`\`

User: "change the hero heading from 'Welcome' to 'Open since 1998'"
Correct response (surgical edit — preferred whenever the change is small):
\`\`\`action
{"action":"editBuilderHtml","old_string":"<h1 style=\\"font-size:64px;font-weight:700;line-height:1.05;letter-spacing:-0.02em;margin:0 0 24px;max-width:720px\\">Welcome</h1>","new_string":"<h1 style=\\"font-size:64px;font-weight:700;line-height:1.05;letter-spacing:-0.02em;margin:0 0 24px;max-width:720px\\">Open since 1998</h1>"}
\`\`\`

User: "make every button background black"
Correct response (every match — use replace_all):
\`\`\`action
{"action":"editBuilderHtml","old_string":"background:#1c1917","new_string":"background:#000000","replace_all":true}
\`\`\`

User: "rename the 'Explore' button to '查看菜单'"
Correct response (single match — pick enough context to be unique):
\`\`\`action
{"action":"editBuilderHtml","old_string":">Explore →</a>","new_string":">查看菜单 →</a>"}
\`\`\``;
}

function buildBuilderModeBlock(builder: Record<string, unknown>): string {
  // Route to HTML-mode prompt when the editor signals it
  if (builder.mode === "html" || typeof builder.html === "string") {
    return buildBuilderHtmlBlock(builder);
  }
  const siteName = builder.siteName ?? "(unnamed site)";
  const pageName = builder.pageName ?? "(unknown)";
  const elements = JSON.stringify(builder.elements ?? [], null, 2);
  const theme = builder.theme ? JSON.stringify(builder.theme) : "(default)";
  return `🏗️ BUILDER MODE — You are editing a website page inside the visual builder.

CURRENT SITE: ${siteName}
CURRENT PAGE: ${pageName}
THEME: ${theme}

CURRENT PAGE ELEMENTS (read-only — use to know what exists, then propose changes):
${elements}

In this mode you CANNOT use store/staffing/scheduling actions. Only use builder actions:
  - addBuilderElement(elements: array) — append elements to the page
  - deleteBuilderElement(targets: array) — delete by displayName substring (case-insensitive)
  - addBuilderFunction(name, nodes?, edges?, tests?) — add a FlowFn function

Element shape for addBuilderElement (each item):
  { "type": "text" | "image" | "layout" | "button",
    "content"?: string,           // for text/button
    "props"?: { "src"?: string, "alt"?: string, "tag"?: "h1"|"h2"|"h3"|"p", ... },
    "style"?: { ... CSS-style camelCase, e.g. fontSize, padding, color, background } }

🚨 OUTPUT RULES (CRITICAL — read carefully):
1. EVERY action MUST be wrapped in a fenced code block: \`\`\`action ... \`\`\` (with the language tag "action"). NEVER emit bare \`action {...}\` or naked JSON — the parser drops them and the user sees raw JSON in chat.
2. Bundle ALL elements for ONE request into a SINGLE \`addBuilderElement\` block with all items in the \`elements\` array. NEVER split a hero+heading+subtext into 3 separate action blocks — that wastes tokens and risks mid-stream truncation.
3. Keep total output under ~1800 tokens. If the user asks for a "fancy homepage" with many sections, prefer 1 big bundled action block over 5 small ones. If you must use multiple blocks, finish each block fully before starting the next — never leave a half-written JSON object.
4. Inspect "CURRENT PAGE ELEMENTS" first so you don't duplicate existing sections.

EXAMPLES (builder mode):

User: "add a hero section with a big heading and a sub-heading"
Correct response:
我帮你加一个 Hero 区域：
\`\`\`action
{"action":"addBuilderElement","elements":[
  {"type":"layout","style":{"padding":"80px 24px","background":"#fafaf9","textAlign":"center"}},
  {"type":"text","content":"Welcome to ${siteName}","props":{"tag":"h1"},"style":{"fontSize":"48px","fontWeight":"700","margin":"0 0 16px"}},
  {"type":"text","content":"The best place to find what you need.","props":{"tag":"p"},"style":{"fontSize":"18px","color":"#57534e"}}
]}
\`\`\`

User: "delete the footer"
Correct response:
\`\`\`action
{"action":"deleteBuilderElement","targets":["Footer"]}
\`\`\`

User: "做一个 fancy color 的主页"
Correct response (ONE block, all sections bundled):
我来给你做一个色彩丰富的主页，包含 hero、招牌系列、和创意布朗尼区：
\`\`\`action
{"action":"addBuilderElement","elements":[
  {"type":"layout","style":{"padding":"80px 24px","background":"linear-gradient(135deg,#fef3c7,#fde68a)","textAlign":"center"}},
  {"type":"text","content":"BJ CAFE","props":{"tag":"h1"},"style":{"fontSize":"56px","fontWeight":"700","margin":"0 0 16px","color":"#1e293b"}},
  {"type":"text","content":"手工烘焙 · 每一口都是新鲜与创意","props":{"tag":"p"},"style":{"fontSize":"18px","color":"#475569"}},
  {"type":"button","content":"探索菜单 →","style":{"padding":"12px 32px","background":"#f59e0b","color":"#fff","borderRadius":"8px","marginTop":"24px"}},
  {"type":"layout","style":{"padding":"60px 24px","background":"#f8fafc"}},
  {"type":"text","content":"我们的招牌系列","props":{"tag":"h2"},"style":{"fontSize":"36px","fontWeight":"700","textAlign":"center","margin":"0 0 50px","color":"#1e293b"}}
]}
\`\`\``;
}

export function buildSystemPrompt(
  context: Record<string, unknown>,
  lang: string,
  memory: MemoryContext,
  permissions?: UserPermissions,
  mode: "chat" | "voice" | "group" = "chat",
): string {
  const skillPrompts = getAllPromptSegments();
  const currentDateAndTime = new Date().toLocaleString(lang);
  const permBlock = buildPermissionsBlock(permissions);
  const builder = (context as { builder?: Record<string, unknown> }).builder;
  const builderBlock = builder ? `\n\n${buildBuilderModeBlock(builder)}\n` : "";

  const memoryBlock = [
    memory.summary && `CONVERSATION SUMMARY (past conversations compressed):\n${memory.summary}`,
    memory.storeOverview && `STORE OVERVIEW (persistent facts):\n${memory.storeOverview}`,
    memory.userPreferences && `USER PREFERENCES:\n${memory.userPreferences}`,
  ].filter(Boolean).join("\n\n");

  const languageName = lang === "zh" ? "Chinese (简体中文)"
    : lang === "es" ? "Spanish (Español)"
    : lang === "fr" ? "French (Français)"
    : lang === "ar" ? "Arabic (العربية)"
    : lang === "hi" ? "Hindi (हिन्दी)"
    : "English";

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
ALL your replies, action explanations, error messages, and confirmations MUST be written in ${languageName}. Do not switch languages even if the LIVE STORE DATA contains other languages. The user's interface is set to "${lang}" — match it.${voiceModeBlock}${groupModeBlock}${builderBlock}

${permBlock ? `${permBlock}\n\n` : ""}${memoryBlock ? `${memoryBlock}\n\n` : ""}LIVE STORE DATA:
${JSON.stringify(context, null, 2)}

CAPABILITIES:
- Answer any question about inventory, sales, staffing, products, suppliers, finances
- Analyze trends, spot anomalies, give recommendations
- Schedule shifts: add, edit, delete shifts; check availability; use shift presets
- Manage roles/positions: create, edit, delete roles; manage role tasks
- Edit products, inventory, pricing, coupons, suppliers
- Approve/reject time-off requests and shift trades
- Suggest actions that the user can approve

${skillPrompts}

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
  2. **Check \`openingHours\` FIRST**. If \`hoursStatus === "unset"\`, do NOT invent shifts — reply with ONE sentence asking the user to set opening hours at /~/settings, optionally followed by a fallback proposal in PROSE (no action blocks). If \`hoursStatus === "set"\`, the per-day shape is \`{ open: "HH:MM", close: "HH:MM", closed: bool }\` keyed by mon/tue/.../sun. Skip days where \`closed === true\`. Clamp shift \`startTime\` to ≥ open and \`endTime\` to ≤ close.
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
还没设置营业时间，无法准确排班。请到 /~/settings → 营业时间 配置每日开关时段，然后再让我排。如果只是想按上周日的模式继续，我可以按 07:00–14:00 / 14:00–22:00 来排，告诉我可以就执行。

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
- IMPORTANT: Respond in ${lang === "zh" ? "Chinese (简体中文)" : lang === "es" ? "Spanish (Español)" : lang === "fr" ? "French (Français)" : lang === "ar" ? "Arabic (العربية)" : lang === "hi" ? "Hindi (हिन्दी)" : "English"}. The user's interface language is set to "${lang}" — all your replies, action explanations, and confirmations MUST be in this language. Do not switch languages unless the user explicitly asks.

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history, context, type, lang, memory, summarize, permissions, mode } = body;
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
      const systemPrompt = `You are Mr. Merchiva generating a weekly summary. Store data:\n${JSON.stringify(context ?? {}, null, 2)}\n\nGenerate a concise weekly report with: Revenue, Top Products, Staffing, Inventory Alerts, Recommendations. Use real numbers. Respond in ${lang === "zh" ? "Chinese" : "English"}.`;
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
    const systemPrompt = buildSystemPrompt(context ?? {}, lang ?? "en", memCtx, userPerms, callMode);
    const isBuilderMode = !!(context && (context as Record<string, unknown>).builder);

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
    console.log(`[store-ai] Model: ${model}, messages: ${convoMsgs.length}, total chars: ${totalChars}, builder=${isBuilderMode}`);

    // Builder mode emits long structured JSON for many elements — give it more
    // headroom so multi-section page generations don't get truncated mid-block.
    // Standard chat was 1500 originally, but batch operations (e.g. scheduling
    // 14 shifts via 14 ```action``` blocks) trip that cap and end mid-JSON
    // around action #7. 4000 fits ~25 shift blocks plus reasonable preamble
    // and still stays well under what the OSS / mimo models can produce.
    const maxOutput = callMode === "voice" ? 800 : isBuilderMode ? 3500 : 4000;

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
      const ackHeader = triage.message
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

              const mainResult = streamText({
                model: escalationModel,
                system: mainSystem + continuationNote,
                messages: turnMessages,
                maxOutputTokens: maxOutput,
                temperature: callMode === "voice" ? 0.4 : 0.2,
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
          }
        },
      });

      return new Response(stream, { headers: responseHeaders });
    }

    // Non-streaming fallback
    const fallbackResult = await generateText({
      model: callMode === "voice" ? getOpenRouterVoiceModel() : getOpenRouterModel(),
      system: systemPrompt,
      messages: convoMsgs,
      maxOutputTokens: maxOutput,
      temperature: callMode === "voice" ? 0.4 : 0.2,
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
