import { NextRequest, NextResponse } from "next/server";
import { verifyAdminFromAuthHeader } from "@/lib/auth/admin";
import { stripe } from "@/lib/stripe";

// List coupons + their promo codes. Returns a flat view convenient for the UI.
export async function GET(req: NextRequest) {
  const admin = await verifyAdminFromAuthHeader(req.headers.get("authorization"));
  if (!admin?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [coupons, promos] = await Promise.all([
      stripe().coupons.list({ limit: 100 }),
      stripe().promotionCodes.list({ limit: 100 }),
    ]);
    return NextResponse.json({
      coupons: coupons.data.map((c) => ({
        id: c.id,
        name: c.name,
        percentOff: c.percent_off,
        amountOff: c.amount_off,
        currency: c.currency,
        duration: c.duration,
        durationInMonths: c.duration_in_months,
        maxRedemptions: c.max_redemptions,
        timesRedeemed: c.times_redeemed,
        valid: c.valid,
        redeemBy: c.redeem_by,
        created: c.created,
      })),
      promoCodes: promos.data.map((p) => ({
        id: p.id,
        code: p.code,
        couponId: p.promotion?.coupon ?? null,
        active: p.active,
        expiresAt: p.expires_at,
        maxRedemptions: p.max_redemptions,
        timesRedeemed: p.times_redeemed,
        created: p.created,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Create a coupon (with optional matching promo code in one call).
export async function POST(req: NextRequest) {
  const admin = await verifyAdminFromAuthHeader(req.headers.get("authorization"));
  if (!admin?.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    name?: string;
    discountType?: "percent" | "amount";
    percentOff?: number;
    amountOff?: number;
    currency?: string;
    duration?: "once" | "repeating" | "forever";
    durationInMonths?: number;
    maxRedemptions?: number;
    redeemBy?: number;        // unix seconds
    promoCode?: string;       // optional human-readable code
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body.discountType) return NextResponse.json({ error: "discountType required" }, { status: 400 });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any = {
      duration: body.duration ?? "once",
    };
    if (body.name) params.name = body.name;
    if (body.discountType === "percent") {
      if (typeof body.percentOff !== "number") {
        return NextResponse.json({ error: "percentOff required" }, { status: 400 });
      }
      params.percent_off = body.percentOff;
    } else {
      if (typeof body.amountOff !== "number") {
        return NextResponse.json({ error: "amountOff required" }, { status: 400 });
      }
      params.amount_off = body.amountOff;
      params.currency = (body.currency ?? "usd").toLowerCase();
    }
    if (params.duration === "repeating" && typeof body.durationInMonths === "number") {
      params.duration_in_months = body.durationInMonths;
    }
    if (typeof body.maxRedemptions === "number") params.max_redemptions = body.maxRedemptions;
    if (typeof body.redeemBy === "number") params.redeem_by = body.redeemBy;

    const coupon = await stripe().coupons.create(params);

    let promo = null;
    if (body.promoCode) {
      promo = await stripe().promotionCodes.create({
        promotion: { type: "coupon", coupon: coupon.id },
        code: body.promoCode,
      });
    }

    return NextResponse.json({ coupon, promo });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
