import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const MODEL = process.env.OPENROUTER_MODEL || "tencent/hy3-preview:free";

const SYSTEM_PROMPT = `You are an AI assistant inside a website builder called Merchiva. You help users build websites and create interactive logic.

ACTIONS you can perform — wrap in a JSON code block:

1. ADD page elements:
\`\`\`json
{ "action": "add", "elements": [{ "type": "text", "content": "Hello", "props": { "tag": "h1", "style": { "fontSize": "24px" } } }] }
\`\`\`

2. DELETE elements by name:
\`\`\`json
{ "action": "delete", "targets": ["element-name"] }
\`\`\`

3. ADD a FlowFn function (visual logic):
\`\`\`json
{ "action": "add-function", "function": { "name": "functionName", "desc": "what it does", "nodes": [...], "edges": [...], "tests": [] } }
\`\`\`

FlowFn node types: param, const-num, const-str, const-bool, math-bin (+,-,*,/), compare (===,>,<), str-concat, str-template, ternary, arr-map, arr-filter, arr-reduce, log, dom-set, fetch, call-fn, return
Node format: { "id": "n_xxx", "type": "node-type", "x": 100, "y": 100, "data": { "key": "value" } }
Edge format: { "from": { "node": "n_xxx", "port": "out" }, "to": { "node": "n_yyy", "port": "a" } }

Element types (ONLY these 3): layout, text, image
- layout: container with flexbox. props.style: { display, flexDirection, gap, padding, backgroundColor, ... }
- text: any text content. props: { tag (h1-h6/p/span), style: { fontSize, fontWeight, color, textAlign, ... } }
- image: an image. props: { src, alt, style: { width, height, objectFit, borderRadius, ... } }
Use nested layouts for complex structures. Element format: { type, content?, props?, style? }

Rules:
- ALWAYS output a JSON action block when asked to add, delete, or create something
- Use Merchiva design: sharp corners (0.3rem), stone/slate palette, Inter font, compact
- Keep text SHORT — one sentence, then the JSON block
- Respond in the same language as the user
- For delete: match by the element's display name
- IMPORTANT: You are a thinking model. Put your final answer (the text + JSON block the user sees) ONLY in the content field. Do NOT put JSON in reasoning.`;

export async function POST(req: NextRequest) {
  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
  }

  const { messages, siteName, siteTheme } = await req.json();
  if (!messages?.length) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  // Build dynamic system prompt with site context
  let siteContext = "";
  if (siteName) siteContext += `\nThe website being built is for: "${siteName}".`;
  if (siteTheme) {
    siteContext += `\nSite theme colors: primary=${siteTheme.primary || "#1e293b"}, background=${siteTheme.background || "#ffffff"}, text=${siteTheme.text || "#1e293b"}.`;
    if (siteTheme.headingFont) siteContext += ` Heading font: ${siteTheme.headingFont}.`;
    if (siteTheme.bodyFont) siteContext += ` Body font: ${siteTheme.bodyFont}.`;
  }
  siteContext += `\nGenerate content relevant to this store/site. Use the store name in headings and text where appropriate.`;

  try {
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
        messages: [{ role: "system", content: SYSTEM_PROMPT + siteContext }, ...messages],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `OpenRouter error: ${res.status}`, details: err }, { status: 502 });
    }

    const data = await res.json();
    const choice = data.choices?.[0]?.message;

    // Thinking models: actual answer in content, reasoning is internal chain-of-thought
    let content = choice?.content || "";

    // If content is empty, try to extract the final answer from reasoning
    if (!content) {
      const reasoning = choice?.reasoning ||
        (Array.isArray(choice?.reasoning_details)
          ? choice.reasoning_details.map((d: { text?: string }) => d.text || "").join("\n")
          : "");

      if (reasoning) {
        // Extract JSON block from reasoning if present
        const jsonMatch = reasoning.match(/```json\s*\n?([\s\S]*?)\n?\s*```/);
        if (jsonMatch) {
          // Found a JSON action block in reasoning — construct a clean response
          const beforeJson = reasoning.split("```json")[0];
          // Get the last short sentence before the JSON (the explanation)
          const sentences = beforeJson.split(/[。！？\n]/).filter((s: string) => s.trim());
          const explanation = sentences[sentences.length - 1]?.trim() || "Done.";
          content = `${explanation}\n\n\`\`\`json\n${jsonMatch[1].trim()}\n\`\`\``;
        } else {
          // No JSON block — get the last few meaningful sentences as the answer
          const lines = reasoning.split("\n").filter((l: string) => l.trim() && !l.startsWith("等") && !l.startsWith("不对") && !l.startsWith("哦"));
          content = lines.slice(-3).join("\n") || reasoning.slice(-500);
        }
      }
    }

    if (!content) content = "(No response from AI)";

    return NextResponse.json({ content });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
