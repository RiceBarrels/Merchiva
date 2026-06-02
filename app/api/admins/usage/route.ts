import { NextRequest, NextResponse } from "next/server";
import { verifyAdminFromAuthHeader } from "@/lib/auth/admin";
import { spacetimeSql } from "@/lib/spacetimedb/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admins/usage?month=YYYY-MM
//
// Admin-only: AI usage for ALL organizations in the given month, grouped by
// org, with each org's name and any configured quota. Reads the public
// ai_usage / ai_usage_quota / organization tables over the SQL HTTP endpoint.

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowsOf(result: any[]): Record<string, unknown>[] {
  const first = result[0];
  const cols = (first?.schema?.elements ?? []) as SqlColumn[];
  return (first?.rows ?? []).map((r: unknown[]) => rowObject(cols, r));
}

function decodeOptionNumber(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if ("some" in obj) return num(obj.some);
    if ("none" in obj) return null;
  }
  if (Array.isArray(raw)) return raw.length ? num(raw[0]) : null;
  if (typeof raw === "number") return raw;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decodeUuid(raw: any): string {
  if (raw && typeof raw === "object" && "__uuid__" in raw) {
    return BigInt(raw.__uuid__ as string).toString(16).padStart(32, "0");
  }
  return String(raw);
}

export async function GET(req: NextRequest) {
  const admin = await verifyAdminFromAuthHeader(req.headers.get("authorization"));
  if (!admin?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const month =
    req.nextUrl.searchParams.get("month")?.trim() || new Date().toISOString().slice(0, 7);
  const monthEsc = month.replace(/'/g, "''");

  try {
    const [usageRes, orgRes, quotaRes] = await Promise.all([
      spacetimeSql(`SELECT * FROM ai_usage WHERE month = '${monthEsc}'`),
      spacetimeSql("SELECT * FROM organization"),
      spacetimeSql("SELECT * FROM ai_usage_quota"),
    ]);

    const usageRows = rowsOf(usageRes);
    const orgRows = rowsOf(orgRes);
    const quotaRows = rowsOf(quotaRes);

    const orgNames = new Map<string, string>();
    for (const o of orgRows) {
      orgNames.set(decodeUuid(o.id), String(o.name ?? ""));
    }

    const quotas = new Map<string, { tokenLimit: number | null; costLimit: number | null }>();
    for (const q of quotaRows) {
      quotas.set(String(q.organization_id ?? ""), {
        tokenLimit: decodeOptionNumber(q.monthly_token_limit),
        costLimit: decodeOptionNumber(q.monthly_cost_limit),
      });
    }

    const byOrg = new Map<
      string,
      { organizationId: string; inputTokens: number; outputTokens: number; cost: number; calls: number }
    >();
    let grandCost = 0;
    let grandInput = 0;
    let grandOutput = 0;

    for (const r of usageRows) {
      const orgId = String(r.organization_id ?? "");
      const inputTokens = num(r.input_tokens);
      const outputTokens = num(r.output_tokens);
      const cost = num(r.cost);
      grandCost += cost;
      grandInput += inputTokens;
      grandOutput += outputTokens;
      const o =
        byOrg.get(orgId) ??
        { organizationId: orgId, inputTokens: 0, outputTokens: 0, cost: 0, calls: 0 };
      o.inputTokens += inputTokens;
      o.outputTokens += outputTokens;
      o.cost += cost;
      o.calls += 1;
      byOrg.set(orgId, o);
    }

    const orgs = [...byOrg.values()]
      .map((o) => ({
        ...o,
        name: orgNames.get(o.organizationId) || o.organizationId,
        quota: quotas.get(o.organizationId) ?? { tokenLimit: null, costLimit: null },
      }))
      .sort((a, b) => b.cost - a.cost);

    return NextResponse.json({
      month,
      totals: { cost: grandCost, inputTokens: grandInput, outputTokens: grandOutput, orgs: orgs.length },
      orgs,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
