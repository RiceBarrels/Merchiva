import { NextResponse } from "next/server";
import { getCloverCredentials, cloverFetch } from "@/lib/clover/api";

// Required DB columns (run migrations before using sync):
//   products:         clover_item_id text UNIQUE per user
//   inventory_items:  clover_item_id text UNIQUE per user

interface CloverItem {
  id: string;
  name: string;
  price?: number;
  categories?: { elements?: Array<{ name: string }> };
}

interface CloverItemStock {
  quantity?: number;
}

interface CloverOrder {
  id: string;
  createdTime?: number;
  total?: number;
}

interface CloverListResponse<T> {
  elements?: T[];
}

/**
 * POST /api/clover/sync
 * Pulls Clover items, stock counts, and recent orders into Supabase tables.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const creds = await getCloverCredentials(user.id);
    if (!creds) {
      return NextResponse.json({ error: "Clover not connected." }, { status: 400 });
    }

    const { token, merchantId } = creds;
    const results = { products: 0, inventory: 0, sales: 0, errors: [] as string[] };

    // ─── 1. Sync items → products + inventory_items ────────────────────────────
    try {
      const itemsRes = await cloverFetch(
        merchantId,
        token,
        "/items?expand=categories&limit=1000"
      );

      if (!itemsRes.ok) {
        results.errors.push(`Items fetch failed: ${itemsRes.status}`);
      } else {
        const body = (await itemsRes.json()) as CloverListResponse<CloverItem>;
        const items = body.elements ?? [];

        for (const item of items) {
          const price = (item.price ?? 0) / 100;
          const category =
            item.categories?.elements?.[0]?.name ?? "Clover Import";

          await supabase.from("products").upsert(
            {
              user_id: user.id,
              name: item.name,
              category,
              price,
              cost: 0,
              clover_item_id: item.id,
              units_sold_this_month: 0,
              units_sold_last_month: 0,
              revenue: 0,
              margin: 0,
              rating: 5,
              trend: "stable",
              alert: "none",
            },
            { onConflict: "user_id,clover_item_id" }
          );
          results.products++;

          // Fetch stock level for this item
          let currentStock = 0;
          try {
            const stockRes = await cloverFetch(
              merchantId,
              token,
              `/item_stocks/${item.id}`
            );
            if (stockRes.ok) {
              const stock = (await stockRes.json()) as CloverItemStock;
              currentStock = stock.quantity ?? 0;
            }
          } catch {
            // Stock fetch is best-effort; continue without it
          }

          await supabase.from("inventory_items").upsert(
            {
              user_id: user.id,
              name: item.name,
              category,
              current_stock: currentStock,
              min_stock: 5,
              max_stock: 100,
              unit: "units",
              cost_per_unit: 0,
              supplier: "Clover",
              clover_item_id: item.id,
              loss_rate: 0,
            },
            { onConflict: "user_id,clover_item_id" }
          );
          results.inventory++;
        }
      }
    } catch (err) {
      results.errors.push(`Items sync: ${String(err)}`);
    }

    // ─── 2. Sync orders → sales_records ───────────────────────────────────────
    try {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceMs = since.getTime();

      const ordersRes = await cloverFetch(
        merchantId,
        token,
        `/orders?filter=createdTime>=${sinceMs}&limit=500`
      );

      if (!ordersRes.ok) {
        results.errors.push(`Orders fetch failed: ${ordersRes.status}`);
      } else {
        const body = (await ordersRes.json()) as CloverListResponse<CloverOrder>;
        const orders = body.elements ?? [];

        // Group orders by date for daily aggregates (mirrors Square sync pattern)
        const byDate: Record<string, { total: number }> = {};

        for (const order of orders) {
          if (!order.createdTime) continue;
          const date = new Date(order.createdTime).toISOString().split("T")[0];
          const total = (order.total ?? 0) / 100;

          if (!byDate[date]) byDate[date] = { total: 0 };
          byDate[date].total += total;
        }

        for (const [date, { total }] of Object.entries(byDate)) {
          await supabase.from("sales_records").upsert(
            {
              user_id: user.id,
              date,
              hour: null,
              actual: total,
            },
            { onConflict: "user_id,date,hour" }
          );
          results.sales++;
        }
      }
    } catch (err) {
      results.errors.push(`Orders sync: ${String(err)}`);
    }

    // ─── 3. Update last synced timestamp ──────────────────────────────────────
    await supabase
      .from("settings")
      .update({ clover_last_synced_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return NextResponse.json({
      success: true,
      synced: results,
      message: `Synced ${results.products} products, ${results.inventory} inventory items, ${results.sales} sales days.`,
    });
  } catch (err) {
    console.error("[clover/sync]", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
