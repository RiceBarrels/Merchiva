import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { paymentId, amount, reason } = body as {
      paymentId?: string;
      amount?: number;
      reason?: string;
    };

    if (!paymentId) {
      return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
    }

    // Fetch the payment, scoped to the user's org via RLS
    const { data: payment, error: fetchErr } = await supabase
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .single();

    if (fetchErr || !payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (payment.status === "refunded") {
      return NextResponse.json({ error: "Payment has already been refunded" }, { status: 409 });
    }

    if (payment.status !== "completed") {
      return NextResponse.json({ error: "Only completed payments can be refunded" }, { status: 400 });
    }

    const refundAmt = amount ?? Number(payment.amount);
    if (refundAmt <= 0 || refundAmt > Number(payment.amount)) {
      return NextResponse.json(
        { error: `Refund amount must be between $0.01 and ${payment.amount}` },
        { status: 400 }
      );
    }

    let processorRefundId: string | null = null;

    // ── Card refund via payment processor ──────────────────────────────────
    if (payment.method === "card" && payment.processor_id) {
      const paymentToken = process.env.HELCIM_API_TOKEN;
      if (!paymentToken) {
        return NextResponse.json(
          { error: "Payment processing not available — cannot refund card transaction" },
          { status: 503 }
        );
      }

      const refundRes = await fetch(
        `https://api.helcim.com/v2/card-transactions/${payment.processor_id}/refund`,
        {
          method: "POST",
          headers: {
            "api-token": paymentToken,
            "Content-Type": "application/json",
            "idempotency-key": `refund-${paymentId}-${Date.now()}`,
          },
          body: JSON.stringify({ amount: refundAmt }),
        }
      );

      if (!refundRes.ok) {
        const errBody = await refundRes.text();
        console.error("[payments/refund] processor error:", errBody);
        return NextResponse.json(
          { error: "Card refund was declined by the payment processor" },
          { status: 502 }
        );
      }

      const refundData = await refundRes.json();
      processorRefundId = String(refundData.transactionId ?? refundData.id ?? "");
    }

    const now = new Date().toISOString();

    // ── Mark original payment as refunded ────────────────────────────────
    const { error: updateErr } = await supabase
      .from("payments")
      .update({
        status: "refunded",
        refund_amount: refundAmt,
        refund_reason: reason ?? null,
        refunded_at: now,
      })
      .eq("id", paymentId);

    if (updateErr) throw updateErr;

    // ── Audit trail: negative-amount record ──────────────────────────────
    await supabase.from("payments").insert({
      organization_id: payment.organization_id,
      user_id: user.id,
      order_id: payment.order_id ?? null,
      amount: -refundAmt,
      currency: payment.currency,
      method: payment.method,
      status: "refunded",
      processor_id: processorRefundId,
      customer_name: payment.customer_name ?? null,
      notes: reason ? `Refund: ${reason}` : "Refund",
      items: payment.items ?? null,
      tax_amount: 0,
      discount_amount: 0,
    });

    // Return updated payment
    const { data: updated } = await supabase
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .single();

    return NextResponse.json({ success: true, payment: updated });
  } catch (err) {
    console.error("[payments/refund]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
