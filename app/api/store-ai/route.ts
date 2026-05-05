import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const MODEL = process.env.OPENROUTER_MODEL || "tencent/hy3-preview:free";

function buildSystemPrompt(context: Record<string, unknown>): string {
  return `You are Merchiva's store AI assistant. You have access to real-time store data.

CURRENT STORE DATA:
${JSON.stringify(context, null, 2)}

You can answer questions like:
- "What were today's sales?" → Look at sales data
- "Who's working today?" → Look at shifts/staff
- "Which products are low stock?" → Look at inventory
- "What's our best selling product?" → Look at products
- "How much waste this week?" → Look at waste data
- "Any pending requests?" → Look at notifications

ACTIONS you can suggest (wrap in \`\`\`action blocks):
- {"action": "updatePrice", "productId": "xxx", "newPrice": 5.99}
- {"action": "addShift", "memberId": "xxx", "date": "2026-05-05", "startTime": "07:00", "endTime": "14:00"}
- {"action": "createNotification", "title": "...", "body": "..."}
- {"action": "generateReport", "type": "sales|inventory|staff"}

When suggesting actions, explain what will happen. The client will parse and execute these.

ANOMALY DETECTION:
If the data shows unusual patterns, proactively mention them:
- Sales significantly below/above prediction
- Multiple low-stock items
- Shifts with no staff assigned
- High waste cost days

Be concise, use numbers. Respond in the user's language.`;
}

function buildWeeklySummaryPrompt(context: Record<string, unknown>): string {
  return `You are Merchiva's store AI assistant generating a structured weekly summary report.

CURRENT STORE DATA:
${JSON.stringify(context, null, 2)}

Generate a structured weekly report covering these sections. Use real numbers from the data. If a section has no data, say "No data available."

SECTIONS:
1. **Revenue Overview** — Total revenue this week, comparison to last week if available, daily breakdown trend
2. **Top Products** — Best sellers by revenue and by quantity, any underperformers
3. **Staffing Coverage** — Shifts scheduled, any gaps or understaffed periods, overtime hours
4. **Inventory Alerts** — Items below reorder point, items with recent stock changes, items trending toward stockout
5. **Waste & Loss** — Total waste cost this week, most wasted items, waste as % of revenue
6. **Key Recommendations** — 2-3 actionable suggestions based on the data patterns

Format as clean markdown. Be data-driven and concise. Use bullet points and numbers.
Respond in the user's language if the context includes language preference, otherwise use English.`;
}

async function callOpenRouter(
  messages: Array<{ role: string; content: string }>,
  maxTokens: number = 1024
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://merchiva.com",
      "X-Title": "Merchiva Store AI",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error("[store-ai] OpenRouter error:", response.status, errBody);
    throw new Error("AI service unavailable");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "Sorry, I could not generate a response.";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history, context, type } = body;

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        {
          reply:
            "AI assistant is not configured. Please set OPENROUTER_API_KEY in your environment variables.",
        },
        { status: 200 }
      );
    }

    // ── Weekly summary mode ──────────────────────────────────────────────
    if (type === "weekly_summary") {
      const systemPrompt = buildWeeklySummaryPrompt(context ?? {});
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Generate the weekly summary report for this store." },
      ];

      const reply = await callOpenRouter(messages, 2048);
      return NextResponse.json({ reply });
    }

    // ── Standard chat mode ───────────────────────────────────────────────
    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const systemPrompt = buildSystemPrompt(context ?? {});

    const messages = [
      { role: "system", content: systemPrompt },
      ...(Array.isArray(history) ? history.slice(-10) : []),
      { role: "user", content: message },
    ];

    const reply = await callOpenRouter(messages);
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[store-ai] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
