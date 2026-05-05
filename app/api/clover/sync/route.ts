import { NextRequest, NextResponse } from "next/server";
import {
  fetchCloverItems,
  fetchCloverOrders,
  mapCloverItemToProduct,
  mapCloverOrderToSalesRecord,
  getCloverEnvironment,
  type CloverConfig,
} from "@/lib/clover";

/**
 * POST /api/clover/sync
 *
 * Syncs Clover data (items + orders) and returns the mapped results.
 *
 * Reads the Clover access token and merchant ID from httpOnly cookies
 * set during the OAuth callback.
 */
export async function POST(request: NextRequest) {
  try {
    // ─── Read credentials from cookies ─────────────────────────────
    const accessToken = request.cookies.get("clover_access_token")?.value;
    const merchantId = request.cookies.get("clover_merchant_id")?.value;

    if (!accessToken || !merchantId) {
      return NextResponse.json(
        { error: "Clover is not connected. Please connect via Settings first." },
        { status: 401 },
      );
    }

    const env = getCloverEnvironment();
    const config: CloverConfig = { accessToken, merchantId, environment: env };

    // ─── Fetch data from Clover ────────────────────────────────────
    const [items, orders] = await Promise.all([
      fetchCloverItems(config),
      fetchCloverOrders(config),
    ]);

    // ─── Map to Merchiva format ────────────────────────────────────
    const products = items.map(mapCloverItemToProduct);
    const salesRecords = orders
      .filter((o) => o.state === "locked" || o.state === "paid")
      .map(mapCloverOrderToSalesRecord);

    // ─── Return sync results ───────────────────────────────────────
    return NextResponse.json({
      success: true,
      message: `Synced ${products.length} products and ${salesRecords.length} sales records from Clover.`,
      data: {
        products,
        salesRecords,
        rawCounts: {
          items: items.length,
          orders: orders.length,
        },
      },
    });
  } catch (err) {
    console.error("[Clover Sync] Error:", err);
    const message =
      err instanceof Error ? err.message : "Unknown error during Clover sync";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
