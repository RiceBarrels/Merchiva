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
    const { checkoutToken, transactionId } = body as {
      checkoutToken?: string;
      transactionId?: string | number;
    };

    if (!checkoutToken) {
      return NextResponse.json({ error: "checkoutToken is required" }, { status: 400 });
    }

    // Verify by looking up the card transaction by checkoutToken
    const params = new URLSearchParams({ helcimPayCheckoutToken: checkoutToken });
    if (transactionId) params.set("transactionId", String(transactionId));

    const response = await fetch(
      `https://api.helcim.com/v2/card-transactions?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "api-token": paymentToken,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[payments/verify] upstream error:", errBody);
      return NextResponse.json({ error: "Verification failed" }, { status: 502 });
    }

    const data = await response.json();
    const transactions = Array.isArray(data) ? data : data.transactions ?? [];
    const txn = transactions[0];

    if (!txn) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const approved =
      txn.approvalStatus === "APPROVED" ||
      txn.response?.responseType === "APPROVED";

    return NextResponse.json({
      verified: approved,
      transactionId: txn.transactionId ?? txn.id,
      amount: txn.amount,
      cardType: txn.cardType ?? null,
      cardNumber: txn.cardNumber ?? null, // last 4 digits only
      responseData: txn,
    });
  } catch (err) {
    console.error("[payments/verify]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
