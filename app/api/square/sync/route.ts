import { NextResponse } from "next/server";
import { SquareClient, SquareEnvironment } from "square";
import { getValidSquareToken } from "@/lib/square/token";

/**
 * POST /api/square/sync
 * Pulls Square catalog, inventory, and recent orders into Supabase tables.
 * Called from the Settings page "Sync Now" button.
 */
export async function POST() {
  try {
    const supabase = await createSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const token = await getValidSquareToken(user.id);
    if (!token) {
      return NextResponse.json(
        { error: "Square not connected." },
        { status: 400 }
      );
    }

    const { data: settings } = await supabase
      .from("settings")
      .select("square_location_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const square = new SquareClient({
      token,
      environment: SquareEnvironment.Production,
    });

    const results = {
      products: 0,
      inventory: 0,
      sales: 0,
      errors: [] as string[],
    };

    // ─── 1. Sync catalog → products ────────────────────────────────────────────
    try {
      const catalogPage = await square.catalog.list({ types: "ITEM" });

      for await (const item of catalogPage) {
        if (item.type !== "ITEM") continue;
        const name = item.itemData?.name ?? "Unknown";
        const rawVariation = item.itemData?.variations?.[0];
        const variation = rawVariation?.type === "ITEM_VARIATION" ? rawVariation : undefined;
        const price = variation?.itemVariationData?.priceMoney
          ? Number(variation.itemVariationData.priceMoney.amount ?? 0) / 100
          : 0;

        await supabase.from("products").upsert(
          {
            user_id: user.id,
            name,
            category: item.itemData?.categoryId ?? "Uncategorized",
            price,
            cost: 0, // Square doesn't store COGS — user fills this in
            square_item_id: item.id,
            units_sold_this_month: 0,
            units_sold_last_month: 0,
            revenue: 0,
            margin: 0,
            rating: 5,
            trend: "stable",
            alert: "none",
          },
          { onConflict: "user_id,square_item_id" }
        );
        results.products++;
      }
    } catch (err) {
      results.errors.push(`Catalog sync: ${String(err)}`);
    }

    // ─── 2. Sync inventory counts ───────────────────────────────────────────────
    try {
      const variationIds: string[] = [];
      const catVariationsPage = await square.catalog.list({ types: "ITEM_VARIATION" });
      const allVariations: Array<{ id?: string; name?: string | null }> = [];
      for await (const obj of catVariationsPage) {
        if (obj.type !== "ITEM_VARIATION") continue;
        if (obj.id) variationIds.push(obj.id);
        allVariations.push({ id: obj.id, name: obj.itemVariationData?.name });
      }

      if (variationIds.length > 0) {
        const countsPage = await square.inventory.batchGetCounts({
          catalogObjectIds: variationIds.slice(0, 100),
          locationIds: settings?.square_location_id
            ? [settings?.square_location_id]
            : undefined,
        });

        for await (const count of countsPage) {
          if (!count.catalogObjectId) continue;

          // Find the parent item for this variation
          const variation = allVariations.find(
            (o) => o.id === count.catalogObjectId
          );
          const name = variation?.name ?? count.catalogObjectId;

          await supabase.from("inventory_items").upsert(
            {
              user_id: user.id,
              name,
              category: "Square Import",
              current_stock: Number(count.quantity ?? 0),
              min_stock: 5,
              max_stock: 100,
              unit: "units",
              cost_per_unit: 0,
              supplier: "Square",
              square_item_id: count.catalogObjectId,
              loss_rate: 0,
            },
            { onConflict: "user_id,square_item_id" }
          );
          results.inventory++;
        }
      }
    } catch (err) {
      results.errors.push(`Inventory sync: ${String(err)}`);
    }

    // ─── 3. Sync recent orders → sales_records ─────────────────────────────────
    try {
      if (settings?.square_location_id) {
        const since = new Date();
        since.setDate(since.getDate() - 30);

        const ordersResponse = await square.orders.search({
          locationIds: [settings?.square_location_id],
          query: {
            filter: {
              dateTimeFilter: {
                createdAt: { startAt: since.toISOString() },
              },
              stateFilter: { states: ["COMPLETED"] },
            },
          },
          limit: 500,
        });

        // Group orders by date for daily aggregates
        const byDate: Record<string, { total: number; orderIds: string[] }> =
          {};

        for (const order of ordersResponse.orders ?? []) {
          if (!order.createdAt) continue;
          const date = order.createdAt.split("T")[0];
          const total = Number(order.totalMoney?.amount ?? 0) / 100;

          if (!byDate[date]) byDate[date] = { total: 0, orderIds: [] };
          byDate[date].total += total;
          if (order.id) byDate[date].orderIds.push(order.id);
        }

        for (const [date, { total, orderIds }] of Object.entries(byDate)) {
          await supabase.from("sales_records").upsert(
            {
              user_id: user.id,
              date,
              hour: null, // daily aggregate
              actual: total,
              square_order_ids: orderIds,
            },
            { onConflict: "user_id,date,hour" }
          );
          results.sales++;
        }
      }
    } catch (err) {
      results.errors.push(`Orders sync: ${String(err)}`);
    }

    // ─── 4. Update last synced timestamp ───────────────────────────────────────
    await supabase
      .from("settings")
      .update({ square_last_synced_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return NextResponse.json({
      success: true,
      synced: results,
      message: `Synced ${results.products} products, ${results.inventory} inventory items, ${results.sales} sales days.`,
    });
  } catch (err) {
    console.error("[square/sync]", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
