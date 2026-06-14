// Mr. Merchiva places a purchase order with a supplier.
//
// Called by the `orderFromSupplier` AI action after the manager approves the
// order card. This route ONLY sends the PO email (Resend) — a server-only
// concern — and returns whether it was emailed plus the canonical summary/
// totals. The caller then records the order over its live SpacetimeDB
// connection (see lib/spacetimedb/actions.ts → recordSupplierOrder). We moved
// the reducer write off this route because the server-side HTTP RPC reused a
// stale localStorage token and failed with "ExpiredSignature" on long sessions.

import { NextRequest, NextResponse } from "next/server";
import { sendSupplierPOEmail, type SupplierPOItem } from "@/lib/email/resend";
import { encodeThreadToken, inboundDomain } from "@/lib/suppliers/thread-token";

export const runtime = "nodejs";

interface OrderBody {
  organizationId: string;
  supplierId: string;
  supplierName: string;
  supplierEmail?: string | null;
  contactName?: string | null;
  orgName?: string | null;
  items: SupplierPOItem[];
  subtotal?: number;
  tax?: number;
  total?: number;
  notes?: string | null;
  replyTo?: string | null;
  currency?: string;
  supplierLanguage?: string | null;
}

type SupplierSummaryLanguage = "en" | "zh" | "es" | "fr" | "ar" | "hi";

function normalizeSupplierLanguage(language?: string | null): SupplierSummaryLanguage {
  const key = String(language || "en").toLowerCase().split(/[-_]/)[0];
  return key === "zh" || key === "es" || key === "fr" || key === "ar" || key === "hi" ? key : "en";
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rawItemName(item: SupplierPOItem): string {
  return String(item.name || item.itemName || item.productName || item.inventoryItemName || item.item || "").trim();
}

function itemName(item: SupplierPOItem): string {
  return rawItemName(item) || "Item";
}

function quantityLabel(item: SupplierPOItem, language: SupplierSummaryLanguage): string {
  const qty = num(item.quantity) ?? 0;
  const unitsPerCase = num(item.unitsPerCase);
  const caseCount = num(item.caseCount) ?? (unitsPerCase && unitsPerCase > 0 ? Math.ceil(qty / unitsPerCase) : null);
  if (caseCount && unitsPerCase && unitsPerCase > 0) {
    if (language === "zh") return `${caseCount}*箱 - ${qty}个`;
    if (language === "es") return `${caseCount} cajas - ${qty} unidades`;
    if (language === "fr") return `${caseCount} cartons - ${qty} unités`;
    if (language === "ar") return `${caseCount} صناديق - ${qty} وحدة`;
    if (language === "hi") return `${caseCount} केस - ${qty} यूनिट`;
    return `${caseCount} cases - ${qty} units`;
  }
  return `${qty}${item.unit ? " " + item.unit : ""}`;
}

function pendingQuoteLabel(language: SupplierSummaryLanguage): string {
  if (language === "zh") return "等待供应商报价";
  if (language === "es") return "cotización pendiente";
  if (language === "fr") return "devis en attente";
  if (language === "ar") return "بانتظار عرض السعر";
  if (language === "hi") return "quote लंबित";
  return "pending supplier quote";
}

function summarize(items: SupplierPOItem[], total: number, currency: string, language: SupplierSummaryLanguage): string {
  const head = items
    .slice(0, 4)
    .map((i) => `${itemName(i)} ${quantityLabel(i, language)}`)
    .join(", ");
  const more = items.length > 4 ? ` +${items.length - 4} more` : "";
  const amount = total > 0 ? `${currency}${total.toFixed(2)}` : pendingQuoteLabel(language);
  return `${head}${more} — est. ${amount}`;
}

export async function POST(req: NextRequest) {
  let body: OrderBody;
  try {
    body = (await req.json()) as OrderBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    organizationId,
    supplierId,
    supplierName,
    supplierEmail,
    contactName,
    orgName,
    items,
    notes,
    replyTo,
    supplierLanguage,
  } = body;

  if (!organizationId || !supplierId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "Missing organizationId, supplierId, or items" },
      { status: 400 },
    );
  }
  if (items.some((item) => !rawItemName(item))) {
    return NextResponse.json({ error: "Every supplier order item must include a name" }, { status: 400 });
  }

  const currency = body.currency || "$";
  const subtotal = Number(body.subtotal ?? 0);
  const tax = Number(body.tax ?? 0);
  const total = Number(body.total ?? subtotal + tax);
  const language = normalizeSupplierLanguage(supplierLanguage);
  const summary = summarize(items, total, currency, language);

  // Reply-to: when inbound email is configured (Phase 2), route the supplier's
  // reply to the webhook via a signed thread token so Mr. Merchiva can carry on
  // the conversation. Otherwise fall back to the manager's address (Phase 1).
  let effectiveReplyTo = replyTo ?? null;
  const domain = inboundDomain();
  if (domain) {
    const token = encodeThreadToken(organizationId, supplierId);
    if (token) effectiveReplyTo = `${token}@${domain}`;
  }

  // 1) Try to email the supplier. Best-effort: a failure (or missing address)
  //    just flips `emailed` to false so the order is saved as a draft.
  let emailed = false;
  let emailError: string | null = null;
  if (supplierEmail) {
    try {
      await sendSupplierPOEmail({
        to: supplierEmail,
        supplierName: supplierName || "there",
        contactName: contactName ?? null,
        orgName: orgName || "our store",
        items,
        total,
        currency,
        notes: notes ?? null,
        replyTo: effectiveReplyTo,
        language,
      });
      emailed = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error("[suppliers/order] email failed:", emailError);
    }
  }

  // 2) Return the email outcome + canonical summary/totals. The caller records
  //    the PO over its live SpacetimeDB connection (manager-only permission is
  //    still enforced there by the reducer's ctx.sender). When !emailed the
  //    order is saved as a draft and the reducer escalates to managers — nothing
  //    is silently dropped.
  return NextResponse.json({
    ok: true,
    emailed,
    emailError,
    summary,
    subtotal,
    tax,
    total,
    reason: emailed
      ? "sent"
      : supplierEmail
        ? "email_failed_saved_draft"
        : "no_supplier_email_saved_draft",
  });
}
