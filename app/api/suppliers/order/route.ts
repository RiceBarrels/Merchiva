// Mr. Merchiva places a purchase order with a supplier.
//
// Called by the `orderFromSupplier` AI action after the manager approves the
// order card. This route ONLY sends the PO email (Resend) — a server-only
// concern — and returns whether it was emailed plus the canonical summary/
// totals. The caller then records the order over its live SpacetimeDB
// connection (see lib/spacetimedb/actions.ts → recordSupplierOrder). We moved
// the reducer write off this route because the server-side HTTP RPC reused a
// stale localStorage token and failed with "ExpiredSignature" on long sessions.
//
// Who may send, and to whom: this route used to need no sign-in and took the
// recipient, supplier, store name and Reply-To from the body — anyone could
// mail any address from our sender, and naming a real store id handed back that
// store's private supplier inbox as Reply-To. Now the caller's own token
// (Authorization: Bearer) must belong to an owner or manager of the store, as
// recordSupplierOrder requires, and the supplier's address, names and language
// and the store's name are read from the database AS the caller (RLS-scoped
// /sql). Only the order itself (items, notes, amounts) comes from the body,
// shortened, and a store sends at most ORG_SENDS_PER_HOUR per hour from one
// server instance (best-effort, in memory).

import { NextRequest } from "next/server";
import { handleOptions, jsonWithCors } from "@/lib/api-cors";
import { requestToken, verifyActiveMember } from "@/lib/auth/verify-member";
import { sendSupplierPOEmail, type SupplierPOItem } from "@/lib/email/resend";
import { getServiceConn, getSupplierInboundAddressForOrg } from "@/lib/spacetimedb/service-client";
import { spacetimeSql } from "@/lib/spacetimedb/sql";
import { firstRow, SQL_UUID_RE, sqlOptionString } from "@/lib/spacetimedb/sql-values";

export const runtime = "nodejs";
export const OPTIONS = handleOptions;

const MAX_ITEMS = 100;
const MAX_ITEM_TEXT = 120;
const MAX_NOTES = 1000;
const ORG_SENDS_PER_HOUR = 30;
const HOUR_MS = 60 * 60 * 1000;
const sendsByOrg = new Map<string, number[]>();

/** Records a send for `organizationId`; false when it already sent ORG_SENDS_PER_HOUR in the last hour. */
function takeOrgSend(organizationId: string, now: number): boolean {
  const recent = (sendsByOrg.get(organizationId) ?? []).filter((at) => now - at < HOUR_MS);
  if (recent.length >= ORG_SENDS_PER_HOUR) {
    sendsByOrg.set(organizationId, recent);
    return false;
  }
  recent.push(now);
  sendsByOrg.set(organizationId, recent);
  return true;
}

const clip = (v: unknown, max: number): string => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Text fields of an item, shortened; numbers pass through. */
function clipItem(item: SupplierPOItem): SupplierPOItem {
  const out: SupplierPOItem = { ...item };
  for (const key of ["name", "itemName", "productName", "inventoryItemName", "item", "unit", "eachUnit"] as const) {
    if (typeof out[key] === "string") (out as unknown as Record<string, unknown>)[key] = clip(out[key], MAX_ITEM_TEXT);
  }
  return out;
}

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
  const caller = requestToken(undefined, req.headers.get("authorization"));
  if (!caller) return jsonWithCors(req, { error: "Sign in required" }, { status: 401 });

  let body: OrderBody;
  try {
    body = (await req.json()) as OrderBody;
  } catch {
    return jsonWithCors(req, { error: "Invalid JSON" }, { status: 400 });
  }

  const { organizationId, supplierId, supplierLanguage } = body;
  if (!organizationId || !supplierId || !Array.isArray(body.items) || body.items.length === 0) {
    return jsonWithCors(req, { error: "Missing organizationId, supplierId, or items" }, { status: 400 });
  }
  // Both are spliced into SQL text below: uuids only.
  if (!SQL_UUID_RE.test(organizationId) || !SQL_UUID_RE.test(supplierId)) {
    return jsonWithCors(req, { error: "Invalid organizationId or supplierId" }, { status: 400 });
  }
  if (body.items.length > MAX_ITEMS) {
    return jsonWithCors(req, { error: `At most ${MAX_ITEMS} items per order` }, { status: 400 });
  }
  const items = body.items.map(clipItem);
  if (items.some((item) => !rawItemName(item))) {
    return jsonWithCors(req, { error: "Every supplier order item must include a name" }, { status: 400 });
  }
  const notes = body.notes ? clip(body.notes, MAX_NOTES) : null;

  // The caller must manage this store (recordSupplierOrder refuses staff too).
  const member = await verifyActiveMember(caller, organizationId);
  if (!member.ok) return jsonWithCors(req, { error: member.error }, { status: member.status });
  if (member.access.role !== "owner" && member.access.role !== "manager") {
    return jsonWithCors(req, { error: "Owner or manager required" }, { status: 403 });
  }

  // Recipient, names and language from the store's own supplier row, read as the caller.
  let supplierName = "";
  let supplierEmail: string | null = null;
  let contactName: string | null = null;
  let storedLanguage: string | null = null;
  let orgName = "";
  let callerEmail: string | null = null;
  try {
    const [supplierRow, orgRow, meRow] = await Promise.all([
      spacetimeSql(
        `SELECT name, email, contact_name, language FROM supplier WHERE id = '${supplierId}' AND organization_id = '${organizationId}'`,
        { token: caller },
      ).then(firstRow),
      spacetimeSql(`SELECT name FROM organization WHERE org_id_text = '${organizationId}'`, { token: caller }).then(firstRow),
      spacetimeSql(
        `SELECT email FROM org_member WHERE organization_id = '${organizationId}' AND user_id = :sender AND status = 'active'`,
        { token: caller },
      ).then(firstRow),
    ]);
    if (!supplierRow) return jsonWithCors(req, { error: "Supplier not found" }, { status: 404 });
    supplierName = typeof supplierRow[0] === "string" ? supplierRow[0] : "";
    supplierEmail = sqlOptionString(supplierRow[1]);
    contactName = sqlOptionString(supplierRow[2]);
    storedLanguage = sqlOptionString(supplierRow[3]);
    orgName = typeof orgRow?.[0] === "string" ? orgRow[0] : "";
    callerEmail = typeof meRow?.[0] === "string" && meRow[0].trim() ? meRow[0].trim() : null;
  } catch (err) {
    if (err instanceof Error && /SQL failed \((401|403)\)/.test(err.message)) {
      return jsonWithCors(req, { error: "Invalid or expired token" }, { status: 401 });
    }
    console.error("[suppliers/order] supplier lookup failed:", err);
    return jsonWithCors(req, { error: "Supplier lookup unavailable" }, { status: 503 });
  }

  const currency = body.currency || "$";
  const subtotal = Number(body.subtotal ?? 0);
  const tax = Number(body.tax ?? 0);
  const total = Number(body.total ?? subtotal + tax);
  const language = normalizeSupplierLanguage(storedLanguage ?? supplierLanguage);
  const summary = summarize(items, total, currency, language);

  // Reply-to: route supplier replies to the store's fixed inbound inbox so
  // Mr. Merchiva can carry on the conversation. Otherwise fall back to the
  // caller's own address, from their membership row. Looked up only now, after
  // the caller proved they manage this store.
  let effectiveReplyTo = callerEmail;
  try {
    const conn = await getServiceConn();
    effectiveReplyTo = (await getSupplierInboundAddressForOrg(conn, organizationId)) ?? effectiveReplyTo;
  } catch (err) {
    console.warn("[suppliers/order] fixed inbound address unavailable:", err);
  }

  // 1) Try to email the supplier. Best-effort: a failure (or missing address)
  //    just flips `emailed` to false so the order is saved as a draft.
  let emailed = false;
  let emailError: string | null = null;
  if (supplierEmail && !takeOrgSend(organizationId, Date.now())) {
    emailError = "Too many supplier emails from this store; try again later";
  } else if (supplierEmail) {
    try {
      await sendSupplierPOEmail({
        to: supplierEmail,
        supplierName: supplierName || "there",
        contactName: contactName ?? null,
        orgName: orgName || "our store",
        items,
        total,
        currency,
        notes,
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
  return jsonWithCors(req, {
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
