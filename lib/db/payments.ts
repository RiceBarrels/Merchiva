// @ts-nocheck
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";
import type { Payment, PaymentMethod, PaymentStatus, CartItem } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromRow(r: any): Payment {
  return {
    id: r.id.toString(),
    organizationId: r.organizationId,
    userId: r.userId ?? null,
    orderId: r.orderId ?? null,
    amount: Number(r.amount) || 0,
    currency: r.currency,
    method: r.method as PaymentMethod,
    status: r.status as PaymentStatus,
    processorId: r.processorId ?? null,
    processorResponse: r.processorResponse ? JSON.parse(r.processorResponse) : null,
    customerName: r.customerName ?? null,
    notes: r.notes ?? null,
    items: r.items ? JSON.parse(r.items) : null,
    taxAmount: Number(r.taxAmount ?? 0),
    discountAmount: Number(r.discountAmount ?? 0),
    refundAmount: r.refundAmount != null ? Number(r.refundAmount) : null,
    refundReason: r.refundReason ?? null,
    refundedAt: r.refundedAt ? String(r.refundedAt) : null,
    createdAt: r.createdAt ? String(r.createdAt) : new Date().toISOString(),
  };
}

export interface CreatePaymentInput {
  organizationId: string;
  userId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  processorId?: string | null;
  processorResponse?: Record<string, unknown> | null;
  customerName?: string | null;
  notes?: string | null;
  items?: CartItem[] | null;
  taxAmount: number;
  discountAmount: number;
}

export async function createPayment(input: CreatePaymentInput): Promise<Payment> {
  console.warn("[SpacetimeDB] createPayment: writes not yet implemented via reducers");
  // Return a stub payment so callers don't crash
  return {
    id: crypto.randomUUID(),
    organizationId: input.organizationId,
    userId: input.userId,
    orderId: null,
    amount: input.amount,
    currency: input.currency,
    method: input.method,
    status: input.status,
    processorId: input.processorId ?? null,
    processorResponse: input.processorResponse ?? null,
    customerName: input.customerName ?? null,
    notes: input.notes ?? null,
    items: input.items ?? null,
    taxAmount: input.taxAmount,
    discountAmount: input.discountAmount,
    refundAmount: null,
    refundReason: null,
    refundedAt: null,
    createdAt: new Date().toISOString(),
  };
}

export async function getPayments(organizationId: string, limit = 50): Promise<Payment[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.payment.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === organizationId)
    .map(fromRow)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export async function getRecentPayments(
  organizationId: string,
  limit = 30,
  offset = 0,
  search?: string
): Promise<Payment[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.payment.iter();
  let results = Array.from(rows)
    .filter((r: any) => r.organizationId === organizationId && Number(r.amount) >= 0)
    .map(fromRow)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    results = results.filter(
      (p) =>
        (p.customerName && p.customerName.toLowerCase().includes(term)) ||
        (p.processorId && p.processorId.toLowerCase().includes(term)) ||
        (p.notes && p.notes.toLowerCase().includes(term))
    );
  }

  return results.slice(offset, offset + limit);
}

export async function updatePaymentStatus(
  id: string,
  status: PaymentStatus,
  processorId?: string,
  processorResponse?: Record<string, unknown>
): Promise<void> {
  console.warn("[SpacetimeDB] updatePaymentStatus: writes not yet implemented via reducers");
}

// --- Refund ---------------------------------------------------------------

export interface RefundResult {
  success: boolean;
  error?: string;
  payment?: Payment;
}

export async function refundPayment(
  paymentId: string,
  amount?: number,
  reason?: string
): Promise<RefundResult> {
  const res = await fetch("/api/payments/refund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentId, amount, reason }),
  });
  const json = await res.json();
  if (!res.ok) {
    return { success: false, error: json.error ?? "Refund failed" };
  }
  return { success: true, payment: json.payment };
}

// --- Payment settings (tax rate + currency) --------------------------------

export interface PaymentConfig {
  taxRate: number;   // percentage e.g. 8.5
  currency: string;  // e.g. "USD"
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const c = getConnection();
  if (!c) return { taxRate: 0, currency: "USD" };
  const orgId = getActiveOrgId();
  const rows = (c as any).db.settings.iter();
  for (const r of rows) {
    if (r.organizationId === orgId) {
      return {
        taxRate: Number(r.paymentTaxRate ?? 0),
        currency: r.paymentCurrency ?? "USD",
      };
    }
  }
  return { taxRate: 0, currency: "USD" };
}

export async function upsertPaymentConfig(
  userId: string,
  config: Partial<PaymentConfig>
): Promise<void> {
  console.warn("[SpacetimeDB] upsertPaymentConfig: writes not yet implemented via reducers");
}
