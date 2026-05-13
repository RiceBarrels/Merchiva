import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const MODEL = process.env.OPENROUTER_MODEL || "moonshotai/kimi-k2";

function buildSystemPrompt(context: Record<string, unknown>, lang: string): string {
  return `You are Mr. Merchiva, an AI ops agent for a small business. You have full access to the store's real-time data. You are direct, data-driven, and concise.

STORE DATA:
${JSON.stringify(context, null, 2)}

CAPABILITIES:
- Answer any question about inventory, sales, staffing, products, suppliers, finances
- Analyze trends, spot anomalies, give recommendations
- Suggest actions that the owner can approve

ACTIONS:
When you want to perform an action, output a JSON block wrapped in \`\`\`action tags. The user will see an "Approve" button.
Available actions:

\`\`\`action
{"action": "addShift", "staffName": "Name", "date": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM", "shiftType": "morning|afternoon|evening|closing", "staffRoles": ["Barista"]}
\`\`\`

\`\`\`action
{"action": "updateInventory", "itemName": "Name", "quantity": 10, "type": "in|out|adjustment"}
\`\`\`

\`\`\`action
{"action": "createPurchaseOrder", "supplier": "Name", "items": [{"name": "Item", "quantity": 10, "unitCost": 5.00}]}
\`\`\`

\`\`\`action
{"action": "createNotification", "title": "...", "body": "...", "type": "general|inventory_low|shift_trade"}
\`\`\`

\`\`\`action
{"action": "updatePrice", "productName": "Name", "newPrice": 5.99}
\`\`\`

\`\`\`action
{"action": "addStaffMember", "name": "Name", "role": "Barista", "hourlyRate": 18.00}
\`\`\`

Q&A COMMAND:
When you need the user to choose between options or answer a question, output a /ask command with a JSON array.
Format: /ask '[{"q":"Your question here?","a":["Option A","Option B","Option C"]}]'
You can ask multiple questions at once: /ask '[{"q":"Q1?","a":["A","B"]},{"q":"Q2?","a":["X","Y","Z"]}]'
The user will see clickable buttons for each option. Their choice will be sent back as a message.
Use this when:
- You need clarification before taking action
- Offering the user a choice (e.g. which supplier, which shift type, which product)
- Confirming preferences

FORMATTING:
- You can use **Markdown** in your responses — bold, lists, tables, code blocks, headers, etc.
- Use markdown formatting to make data clear: tables for comparisons, bullet lists for summaries, \`code\` for SKUs/IDs, **bold** for emphasis
- Keep formatting clean and readable

RULES:
- Always explain what an action will do before suggesting it
- Use actual data from the store context — never invent numbers
- Be concise: use bullet points, mono numbers, short sentences
- If data is missing, say so honestly
- Respond in ${lang === "zh" ? "Chinese (简体中文)" : lang === "es" ? "Spanish" : lang === "fr" ? "French" : lang === "ar" ? "Arabic" : lang === "hi" ? "Hindi" : "English"}
- When suggesting shifts, check existing shifts to avoid conflicts`;
}

async function callOpenRouter(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = 1500
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://merchiva.com",
      "X-Title": "Merchiva Mr. Merchiva",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error("[store-ai] OpenRouter error:", response.status, errBody);
    throw new Error(`AI service error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "I couldn't generate a response. Please try again.";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history, context, type, lang } = body;

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({
        reply: "AI assistant is not configured. Set OPENROUTER_API_KEY in environment variables.",
      });
    }

    if (type === "weekly_summary") {
      const systemPrompt = `You are Mr. Merchiva generating a weekly summary. Store data:\n${JSON.stringify(context ?? {}, null, 2)}\n\nGenerate a concise weekly report with: Revenue, Top Products, Staffing, Inventory Alerts, Recommendations. Use real numbers. Respond in ${lang === "zh" ? "Chinese" : "English"}.`;
      const reply = await callOpenRouter([
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate the weekly summary." },
      ], 2048);
      return NextResponse.json({ reply });
    }

    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const systemPrompt = buildSystemPrompt(context ?? {}, lang ?? "en");

    const messages = [
      { role: "system", content: systemPrompt },
      ...(Array.isArray(history) ? history.slice(-10) : []),
      { role: "user", content: message },
    ];

    const reply = await callOpenRouter(messages);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[store-ai] Error:", err);
    return NextResponse.json({ error: "AI service temporarily unavailable" }, { status: 500 });
  }
}
