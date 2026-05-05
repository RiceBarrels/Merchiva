import { NextRequest, NextResponse } from "next/server";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const MODEL = process.env.OPENROUTER_MODEL || "tencent/hy3-preview:free";

export async function POST(req: NextRequest) {
  try {
    const { message, history, context } = await req.json();

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        {
          reply:
            "AI assistant is not configured. Please set OPENROUTER_API_KEY in your environment variables.",
        },
        { status: 200 }
      );
    }

    const systemPrompt = `You are a store management AI assistant for Merchiva. You help store owners and managers understand their business data and make decisions.

You have access to the following store context:
${JSON.stringify(context, null, 2)}

Answer questions based on this data. Be concise and actionable. Use numbers when relevant. If asked something you don't have data for, say so clearly.

Respond in the same language as the user.`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(Array.isArray(history) ? history.slice(-10) : []),
      { role: "user", content: message },
    ];

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
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[store-ai] OpenRouter error:", response.status, errBody);
      return NextResponse.json(
        { error: "AI service unavailable" },
        { status: 502 }
      );
    }

    const data = await response.json();
    const reply =
      data.choices?.[0]?.message?.content ?? "Sorry, I could not generate a response.";

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("[store-ai] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
