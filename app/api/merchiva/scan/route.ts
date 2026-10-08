import { NextRequest, NextResponse } from "next/server";
import {
  getSubscribedServiceConn,
  serviceCreateNotification,
} from "@/lib/spacetimedb/service-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ─── Localized restock-alert copy ────────────────────────────────────────────
const COPY: Record<string, { title: string; body: (n: number, names: string) => string }> = {
  en: { title: "Restock needed", body: (n, names) => `${n} ${n === 1 ? "item is" : "items are"} at or below minimum stock: ${names}. Ask Mr. Merchiva to order them.` },
  zh: { title: "需要补货", body: (n, names) => `有 ${n} 项库存已达到或低于最低库存：${names}。可以让 Mr. Merchiva 帮你下单。` },
  es: { title: "Reabastecimiento necesario", body: (n, names) => `${n} ${n === 1 ? "artículo está" : "artículos están"} en o por debajo del stock mínimo: ${names}. Pídele a Mr. Merchiva que los pida.` },
  fr: { title: "Réapprovisionnement nécessaire", body: (n, names) => `${n} ${n === 1 ? "article est" : "articles sont"} au niveau ou en dessous du stock minimum : ${names}. Demandez à Mr. Merchiva de les commander.` },
  ar: { title: "يلزم إعادة التخزين", body: (n, names) => `${n} من العناصر عند الحد الأدنى للمخزون أو أقل: ${names}. اطلب من Mr. Merchiva طلبها.` },
  hi: { title: "पुनः स्टॉक की आवश्यकता", body: (n, names) => `${n} वस्तुएँ न्यूनतम स्टॉक पर या उससे कम हैं: ${names}। Mr. Merchiva से उन्हें ऑर्डर करने को कहें।` },
};

/**
 * Vercel Cron invokes the path with **GET**, not POST (vercel.json → crons).
 * The scan lived only on POST, so the nightly low-stock run has never fired;
 * GET returned a description of the job instead of doing it.
 */
export async function GET(req: NextRequest) {
  return runDailyScan(req);
}

export async function POST(req: NextRequest) {
  return runDailyScan(req);
}

async function runDailyScan(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let conn;
  try {
    conn = await getSubscribedServiceConn([
      "SELECT * FROM inventory_item",
      "SELECT * FROM org_member",
      "SELECT * FROM user",
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[merchiva/scan] subscription failed:", msg);
    return NextResponse.json({ error: `subscription: ${msg}` }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows = (table: string): any[] => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = (conn.db as any)[table];
    return t && typeof t.iter === "function" ? [...t.iter()] : [];
  };
  const items = allRows("inventoryItem");
  const members = allRows("orgMember");
  const users = allRows("user");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localeOf = (id: any): string => {
    const hex = id?.toHexString?.();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = users.find((x: any) => x.identity?.toHexString?.() === hex);
    return (u?.locale as string | undefined) ?? "en";
  };

  // Low-stock items grouped by org (current <= min).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lowByOrg = new Map<string, any[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const it of items as any[]) {
    if (Number(it.currentStock) <= Number(it.minStock)) {
      const arr = lowByOrg.get(it.organizationId) ?? [];
      arr.push(it);
      lowByOrg.set(it.organizationId, arr);
    }
  }

  let notified = 0;
  const errors: string[] = [];

  for (const [orgId, lowItems] of lowByOrg) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const itemNames = lowItems.map((i: any) => String(i.name));
    const names =
      itemNames.slice(0, 5).join(", ") +
      (itemNames.length > 5 ? ` +${itemNames.length - 5}` : "");
    const managers = members.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) =>
        m.organizationId === orgId &&
        m.status === "active" &&
        (m.role === "owner" || m.role === "manager"),
    );
    for (const m of managers) {
      const copy = COPY[localeOf(m.userId)] ?? COPY.en;
      try {
        await serviceCreateNotification(conn, {
          organizationId: orgId,
          targetIdentity: m.userId,
          type: "order",
          title: copy.title,
          body: copy.body(lowItems.length, names),
          link: "/manager/inventory",
        });
        notified++;
      } catch (err) {
        errors.push(`${orgId}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  console.log(
    `[merchiva/scan] orgsWithLowStock=${lowByOrg.size} notified=${notified} errors=${errors.length}`,
  );

  return NextResponse.json({
    success: true,
    scannedAt: new Date().toISOString(),
    orgsWithLowStock: lowByOrg.size,
    notified,
    errors,
  });
}


