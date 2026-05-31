// Mr. Merchiva places a purchase order with a supplier.
//
// Called by the `orderFromSupplier` AI action after the manager approves the
// order card. We send the PO email (Resend) and then record the order +
// outbound message in SpacetimeDB via the recordSupplierOrder reducer (called
// by name over HTTP RPC as the user, so it respects manager-only permission).
//
// If the supplier has no email or the send fails, we still record the order as
// a draft and the reducer escalates to managers — nothing is silently dropped.

import { NextRequest, NextResponse } from "next/server";
import { callReducer } from "@/lib/spacetimedb/server-rpc";
import { sendSupplierPOEmail, type SupplierPOItem } from "@/lib/email/resend";

export const runtime = "nodejs";

interface OrderBody {
  token: string;
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
}

function summarize(items: SupplierPOItem[], total: number, currency: string): string {
  const head = items
    .slice(0, 4)
    .map((i) => `${i.name} ×${i.quantity}${i.unit ? " " + i.unit : ""}`)
    .join(", ");
  const more = items.length > 4 ? ` +${items.length - 4} more` : "";
  return `${head}${more} — est. ${currency}${total.toFixed(2)}`;
}

export async function POST(req: NextRequest) {
  let body: OrderBody;
  try {
    body = (await req.json()) as OrderBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    token,
    organizationId,
    supplierId,
    supplierName,
    supplierEmail,
    contactName,
    orgName,
    items,
    notes,
    replyTo,
  } = body;

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401 });
  if (!organizationId || !supplierId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: "Missing organizationId, supplierId, or items" },
      { status: 400 },
    );
  }

  const currency = body.currency || "$";
  const subtotal = Number(body.subtotal ?? 0);
  const tax = Number(body.tax ?? 0);
  const total = Number(body.total ?? subtotal + tax);
  const summary = summarize(items, total, currency);

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
        replyTo: replyTo ?? null,
      });
      emailed = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error("[suppliers/order] email failed:", emailError);
    }
  }

  // 2) Record the PO + outbound message (and escalate to managers if !emailed).
  //    Args are POSITIONAL, matching the reducer's declared order exactly.
  try {
    await callReducer({
      token,
      name: "recordSupplierOrder",
      args: [
        organizationId,
        supplierId,
        supplierName || "",
        JSON.stringify(items),
        subtotal,
        tax,
        total,
        notes ?? null,
        summary,
        emailed,
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[suppliers/order] recordSupplierOrder failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    emailed,
    emailError,
    reason: emailed
      ? "sent"
      : supplierEmail
        ? "email_failed_saved_draft"
        : "no_supplier_email_saved_draft",
  });
}
