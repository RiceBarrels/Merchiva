import { NextRequest, NextResponse } from "next/server";
import { recordAiUsage, normalizeUsage } from "@/lib/ai/usage";
import { DESIGN_SYSTEM_RULES } from "@/lib/ai/design-system-rules";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const MODEL = process.env.OPENROUTER_MODEL || "tencent/hy3-preview:free";

// ─── System prompt ──────────────────────────────────────────────────────────
// Conversational counterpart to /api/design/generate. The AI takes turns with
// the user: each user turn supplies an instruction; the AI replies with a
// short explanation plus an HTML action block that the client applies to the
// canvas. Modeled on /api/builder/chat (which uses JSON-fenced actions) but
// constrained to a single fixed-size canvas — no pages, no functions, no
// site-level features.
function buildSystemPrompt(width: number, height: number, designName: string): string {
  return `You are Mr. Merchiva, an AI graphic designer embedded in the Merchiva design surface. The user is editing a fixed-size HTML "design" — a poster, social image, or in-store sign. NOT a website.

CANVAS: ${width} × ${height} pixels, titled "${designName}".

ACTIONS — wrap one of these in a JSON code block, ALONE on its own lines:

1. REPLACE the entire canvas:
\`\`\`json
{ "action": "set", "html": "<div style=\\"width:${width}px;height:${height}px;...\\">…</div>" }
\`\`\`

2. PATCH an element by CSS selector (relative to the canvas root):
\`\`\`json
{ "action": "replace", "selector": "h1", "html": "<h1 style=\\"…\\">New headline</h1>" }
\`\`\`

3. APPEND HTML to the canvas root:
\`\`\`json
{ "action": "append", "html": "<p style=\\"…\\">More content</p>" }
\`\`\`

4. DELETE matching elements:
\`\`\`json
{ "action": "delete", "selector": ".watermark" }
\`\`\`

HARD RULES — the rendered HTML MUST satisfy these:
- The root element MUST be \`width:${width}px;height:${height}px\` with \`position:relative\`. Use absolute positioning for children when composing posters.
- Use ONLY inline \`style\` attributes. No <style> tags, no class names, no external CSS.
- Use absolute units (px). No %, vw, vh, em, rem.
- This is static artwork. DO NOT emit: <a>, <form>, <input>, <button onclick=...>, <script>, href, navigation, "click here", URLs.
- Fonts: Inter, system-ui, sans-serif. Headlines weight 700–900.
- Real content tailored to the prompt — no "Lorem ipsum".
- Images: only \`https://images.unsplash.com/...\` URLs you actually know exist, or omit images.
- Strong visual hierarchy: large headline (60–140px), supporting subhead, body text, optional decorative shapes. Bold colors. Layered composition.

CONVERSATION STYLE:
- Reply in 1–2 short sentences explaining what you're doing, then the JSON block.
- Respond in the same language as the user (中文 / English / etc.).
- ALWAYS output a JSON action block when the user asks for an edit or generation. No action = no change happens.
- If the user is just asking a question (no edit needed), reply in plain text without a JSON block.

${DESIGN_SYSTEM_RULES}

ROUTE-SPECIFIC NOTE — this surface is a fixed-size graphic canvas. Inline \`style\` attributes ARE the spec here (no Tailwind, no class names, no dark mode), so the "no inline styles / use Tailwind / use semantic tokens" rules DO NOT apply on this canvas. The remaining rules still do — keep spacing on the 8dp rhythm, hit ≥4.5:1 contrast, sustain a strong hierarchy, stay outline-only / consistent icon size for any vector icons. Touch-target / hover / focus / motion rules don't apply (static artwork).`;
}

interface ClientMessage {
  role: "user" | "assistant";
  content: string;
}

// Extract the first JSON code block out of a model reply.
function extractAction(content: string): {
  text: string;
  action: { action: string; html?: string; selector?: string } | null;
} {
  const match = content.match(/```json?\s*\n?([\s\S]*?)\n?\s*```/);
  if (!match) return { text: content.trim(), action: null };
  const raw = match[1].trim();
  let parsed: { action: string; html?: string; selector?: string } | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { text: content.replace(match[0], "").trim(), action: null };
  }
  const text = content.replace(match[0], "").trim();
  return { text, action: parsed };
}

// Defense-in-depth — strip any link/form/script even if the model ignored
// the system prompt. Mirrors the sanitizer in /api/design/generate.
function sanitize(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1")
    .replace(/<form\b[\s\S]*?<\/form>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/href\s*=\s*"[^"]*"/gi, "")
    .replace(/href\s*=\s*'[^']*'/gi, "");
}

export async function POST(req: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
  }

  let body: {
    messages?: ClientMessage[];
    organizationId?: string;
    width?: number;
    height?: number;
    designName?: string;
    currentHtml?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const width = Number.isFinite(body.width) ? Math.max(50, Math.min(8000, Math.floor(body.width as number))) : 1080;
  const height = Number.isFinite(body.height) ? Math.max(50, Math.min(8000, Math.floor(body.height as number))) : 1080;
  const designName = (body.designName || "Design").slice(0, 120);
  const currentHtml = (body.currentHtml || "").slice(0, 30000);

  try {
    // Inject a synthetic system + initial-context message so the model sees
    // the live canvas state every turn without bloating client-side history.
    const conversation = [
      { role: "system", content: buildSystemPrompt(width, height, designName) },
      ...(currentHtml
        ? [{ role: "user" as const, content: `Current canvas HTML:\n\n${currentHtml}` }]
        : []),
      ...messages.map((m) => ({
        role: m.role,
        content: String(m.content ?? "").slice(0, 4000),
      })),
    ];

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Merchiva Design Chat",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: conversation,
        temperature: 0.8,
        max_tokens: 4096,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Model error ${res.status}`, details: err }, { status: 502 });
    }

    const data = await res.json();
    await recordAiUsage({
      organizationId: body.organizationId,
      feature: "design_chat",
      model: MODEL,
      description: messages[messages.length - 1]?.content,
      ...normalizeUsage(data.usage),
    });
    const choice = data.choices?.[0]?.message;
    const raw = choice?.content || choice?.reasoning || "";
    if (!raw) {
      return NextResponse.json({ error: "Empty model response", raw: data }, { status: 422 });
    }

    const { text, action } = extractAction(raw);
    if (action && typeof action.html === "string") {
      action.html = sanitize(action.html);
    }

    return NextResponse.json({
      reply: text || (action ? "好的，已经更新画布。" : raw),
      action,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
