import { NextRequest, NextResponse } from "next/server";
import { spacetimeSql } from "@/lib/spacetimedb/sql";
import { AI_PRICING } from "@/lib/ai/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/usage?organizationId=...&month=YYYY-MM
//
// Returns the org's AI usage for a month, aggregated for the dashboard:
//   - totals: { inputTokens, outputTokens, inputCost, outputCost, cost, calls }
//   - daily:   [{ day, inputTokens, outputTokens, cost }]
//   - byFeature: [{ feature, inputTokens, outputTokens, cost, calls }]
//
// Reads the public `ai_usage` table over the SpacetimeDB SQL HTTP endpoint.

interface SqlColumn {
  name: { some?: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowObject(cols: SqlColumn[], values: any[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  cols.forEach((c, i) => {
    const name = c.name?.some;
    if (name) obj[name] = values[i];
  });
  return obj;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: NextRequest) {
  const organizationId = req.nextUrl.searchParams.get("organizationId")?.trim() ?? "";
  const month =
    req.nextUrl.searchParams.get("month")?.trim() ||
    new Date().toISOString().slice(0, 7); // YYYY-MM

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId required" }, { status: 400 });
  }

  const orgEsc = organizationId.replace(/'/g, "''");
  const monthEsc = month.replace(/'/g, "''");

  try {
    const result = await spacetimeSql(
      `SELECT * FROM ai_usage WHERE organization_id = '${orgEsc}' AND month = '${monthEsc}'`,
    );
    const first = result[0];
    const cols = (first?.schema.elements ?? []) as SqlColumn[];
    const rows = (first?.rows ?? []).map((r) => rowObject(cols, r as unknown[]));

    const totals = {
      inputTokens: 0,
      outputTokens: 0,
      inputCost: 0,
      outputCost: 0,
      cost: 0,
      calls: rows.length,
    };
    const dailyMap = new Map<
      string,
      { day: string; inputTokens: number; outputTokens: number; cost: number }
    >();
    const featureMap = new Map<
      string,
      { feature: string; inputTokens: number; outputTokens: number; cost: number; calls: number }
    >();

    for (const r of rows) {
      const inputTokens = num(r.input_tokens);
      const outputTokens = num(r.output_tokens);
      const cost = num(r.cost);
      const inputCost = num(r.input_cost);
      const outputCost = num(r.output_cost);
      const day = String(r.day ?? "");
      const feature = String(r.feature ?? "unknown");

      totals.inputTokens += inputTokens;
      totals.outputTokens += outputTokens;
      totals.inputCost += inputCost;
      totals.outputCost += outputCost;
      totals.cost += cost;

      const d = dailyMap.get(day) ?? { day, inputTokens: 0, outputTokens: 0, cost: 0 };
      d.inputTokens += inputTokens;
      d.outputTokens += outputTokens;
      d.cost += cost;
      dailyMap.set(day, d);

      const f =
        featureMap.get(feature) ??
        { feature, inputTokens: 0, outputTokens: 0, cost: 0, calls: 0 };
      f.inputTokens += inputTokens;
      f.outputTokens += outputTokens;
      f.cost += cost;
      f.calls += 1;
      featureMap.set(feature, f);
    }

    const daily = [...dailyMap.values()].sort((a, b) => a.day.localeCompare(b.day));
    const byFeature = [...featureMap.values()].sort((a, b) => b.cost - a.cost);

    return NextResponse.json({
      month,
      organizationId,
      pricing: AI_PRICING,
      totals,
      daily,
      byFeature,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
