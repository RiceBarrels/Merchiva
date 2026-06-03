import { NextRequest, NextResponse } from "next/server";
import { recordAiUsage, normalizeUsage } from "@/lib/ai/usage";
import { DESIGN_SYSTEM_RULES } from "@/lib/ai/design-system-rules";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const MODEL = process.env.OPENROUTER_MODEL || "tencent/hy3-preview:free";

function buildSystemPrompt(width: number, height: number, designName: string): string {
  return `You are a graphic designer AI inside the Merchiva design surface. The user is editing a fixed-size HTML "design" (poster / social image / signage) — NOT a website.

CRITICAL OUTPUT RULES:
- Return ONLY the raw HTML body content (no <html>, <head>, <body>, no <!DOCTYPE>).
- Return ONLY HTML — no markdown code fences, no explanation, no JSON.
- Output absolute units (px) — NOT %, vw, vh, em, rem — so the design renders consistently inside a fixed-size canvas.
- The root container MUST be width: ${width}px and height: ${height}px. Use \`style="width:${width}px;height:${height}px;..."\` on the outermost element.
- The design is static artwork. DO NOT include: <a> links, <form>, <input>, <button onclick=…>, <script>, navigation, footer links, "click here", URLs, hrefs, or any interactive element. This is a printable / shareable image surface.
- Use inline styles only — no <style> tags, no class names, no external CSS.
- Strong visual hierarchy: large headline (60–140px), supporting subhead, body text, optional decorative shapes. Bold colors. Layered composition.
- Composition: use absolute positioning (\`position:absolute; top/left/right/bottom\`) inside a \`position:relative\` root so layouts work at the exact pixel canvas size.
- Fonts: Inter, system-ui, sans-serif. Use weight 700-900 for headlines.
- Use real-looking content tailored to the prompt — no "Lorem ipsum".
- Images: only \`https://images.unsplash.com/...\` URLs you actually know exist, or omit images.

The user's design is titled "${designName}" and the canvas is ${width} × ${height} pixels.

If existing HTML is supplied, you may incorporate it or replace it entirely depending on the user's instruction.

Return ONLY the HTML body content.

${DESIGN_SYSTEM_RULES}

ROUTE-SPECIFIC NOTE — this surface is a fixed-size graphic canvas. Inline \`style\` attributes ARE the spec here (no Tailwind, no class names, no dark mode), so the "no inline styles / use Tailwind / use semantic tokens" rules DO NOT apply on this canvas. The remaining rules still do — keep spacing on the 8dp rhythm (4/8/12/16/24/32/48px), keep text contrast ≥4.5:1 against the chosen background, sustain a strong type hierarchy, and stay outline-only / consistent icon size whenever you compose vector icons. Touch-target / hover / focus / motion rules don't apply (this is static artwork).`;
}

// Strip anything that looks like a link or interactive control, even if the
// model ignored the system prompt. Defense in depth — also matches the
// client-side scrubbing in DesignEditor.
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

function unwrapHtml(content: string): string {
  let s = content.trim();
  // Strip markdown code fences if the model included them.
  const fence = s.match(/```(?:html)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fence) s = fence[1].trim();
  // Strip any leading <!DOCTYPE>, <html>, <head>, <body> envelopes.
  s = s.replace(/<!DOCTYPE[^>]*>/i, "").trim();
  s = s.replace(/<\/?html[^>]*>/gi, "").trim();
  s = s.replace(/<head[\s\S]*?<\/head>/gi, "").trim();
  s = s.replace(/<\/?body[^>]*>/gi, "").trim();
  return s;
}

export async function POST(req: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
  }

  let body: {
    prompt?: string;
    organizationId?: string;
    width?: number;
    height?: number;
    existingHtml?: string;
    designName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = (body.prompt || "").trim();
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

  const width = Number.isFinite(body.width) ? Math.max(50, Math.min(8000, Math.floor(body.width as number))) : 1080;
  const height = Number.isFinite(body.height) ? Math.max(50, Math.min(8000, Math.floor(body.height as number))) : 1080;
  const designName = (body.designName || "Design").slice(0, 120);
  const existing = (body.existingHtml || "").slice(0, 20000);

  try {
    const userParts: string[] = [];
    if (existing) userParts.push(`Existing HTML (you may keep, modify, or replace):\n\n${existing}`);
    userParts.push(`Design request: ${prompt}`);

    const messages = [
      { role: "system", content: buildSystemPrompt(width, height, designName) },
      { role: "user", content: userParts.join("\n\n") },
    ];

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Merchiva Design",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
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
      feature: "design_generate",
      model: MODEL,
      description: body.prompt,
      ...normalizeUsage(data.usage),
    });
    const choice = data.choices?.[0]?.message;
    const raw = choice?.content || choice?.reasoning || "";
    if (!raw) {
      return NextResponse.json({ error: "Empty model response", raw: data }, { status: 422 });
    }

    const cleaned = sanitize(unwrapHtml(raw));
    if (!cleaned.trim()) {
      return NextResponse.json({ error: "Model returned empty HTML after cleanup", raw }, { status: 422 });
    }

    return NextResponse.json({ html: cleaned });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
