import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabase } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const paymentToken = process.env.HELCIM_API_TOKEN;
    if (!paymentToken) {
      return NextResponse.json(
        { error: "Payment processing not available" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { amount, currency = "USD" } = body as { amount?: number; currency?: string };

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const isTestMode = process.env.PAYMENT_TEST_MODE !== "false";

    const response = await fetch("https://api.helcim.com/v2/helcim-pay/initialize", {
      method: "POST",
      headers: {
        "api-token": paymentToken,
        "Content-Type": "application/json",
        "idempotency-key": `${user.id}-${Date.now()}`,
      },
      body: JSON.stringify({
        paymentType: "purchase",
        amount: Number(amount.toFixed(2)),
        currency,
        ...(isTestMode && { testMode: 1 }),
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[payments/create-session] upstream error:", errBody);
      return NextResponse.json(
        { error: "Failed to create payment session" },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      checkoutToken: data.checkoutToken,
      secretToken: data.secretToken,
      testMode: isTestMode,
    });
  } catch (err) {
    console.error("[payments/create-session]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
