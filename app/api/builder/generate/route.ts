import { NextRequest, NextResponse } from "next/server";
import { recordAiUsage, normalizeUsage } from "@/lib/ai/usage";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const MODEL = process.env.OPENROUTER_MODEL || "tencent/hy3-preview:free";

const SYSTEM_PROMPT = `You are a website builder AI assistant. When given a description, generate site elements as JSON.

Return a JSON object with:
- "elements": array of site elements to add
- "explanation": brief description of what was generated

Each element has: { type, content?, props? }
Types (ONLY these 3): "layout", "text", "image"
- layout: flexbox container. props: { style: { display:"flex", flexDirection, gap, padding, backgroundColor, ... } }
- text: any text. props: { tag ("h1"-"h6","p","span"), style: { fontSize, fontWeight, color, textAlign, ... } }
- image: an image. props: { src, alt, style: { width, height, objectFit, borderRadius, ... } }

Use nested layouts for structure. Example:
{
  "elements": [
    { "type": "layout", "props": { "style": { "display": "flex", "flexDirection": "column", "gap": "16px", "padding": "32px" } } },
    { "type": "text", "content": "Welcome", "props": { "tag": "h1", "style": { "fontSize": "36px", "fontWeight": "700" } } },
    { "type": "text", "content": "Build your site visually", "props": { "tag": "p", "style": { "fontSize": "16px", "color": "#64748b" } } }
  ]
}

Only return valid JSON. No markdown wrapping.`;

export async function POST(req: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
  }

  const { prompt, context, organizationId } = await req.json();
  if (!prompt) {
    return NextResponse.json({ error: "prompt required" }, { status: 400 });
  }

  try {
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(context ? [{ role: "user", content: `Current page context: ${context}` }] : []),
      { role: "user", content: prompt },
    ];

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
        "X-Title": "Merchiva Builder",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `OpenRouter error: ${res.status}`, details: err }, { status: 502 });
    }

    const data = await res.json();
    await recordAiUsage({
      organizationId,
      feature: "builder_generate",
      model: MODEL,
      description: prompt,
      ...normalizeUsage(data.usage),
    });
    const choice = data.choices?.[0]?.message;
    const content = choice?.content || choice?.reasoning || "";

    if (!content) {
      return NextResponse.json({ error: "Empty AI response", raw: data }, { status: 422 });
    }

    let parsed;
    try {
      // Try to extract JSON from the response (may be wrapped in markdown code blocks)
      const jsonMatch = content.match(/```json?\s*\n?([\s\S]*?)\n?\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : content.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response", raw: content }, { status: 422 });
    }

    return NextResponse.json(parsed);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
