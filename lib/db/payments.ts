import { createClient } from "@/lib/supabase/client";
import type { Payment, PaymentMethod, PaymentStatus, CartItem } from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDb(row: any): Payment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id ?? null,
    orderId: row.order_id ?? null,
    amount: Number(row.amount),
    currency: row.currency,
    method: row.method as PaymentMethod,
    status: row.status as PaymentStatus,
    processorId: row.processor_id ?? null,
    processorResponse: row.processor_response ?? null,
    customerName: row.customer_name ?? null,
    notes: row.notes ?? null,
    items: row.items ?? null,
    taxAmount: Number(row.tax_amount ?? 0),
    discountAmount: Number(row.discount_amount ?? 0),
    refundAmount: row.refund_amount != null ? Number(row.refund_amount) : null,
    refundReason: row.refund_reason ?? null,
    refundedAt: row.refunded_at ?? null,
    createdAt: row.created_at,
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
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payments")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      amount: input.amount,
      currency: input.currency,
      method: input.method,
      status: input.status,
      processor_id: input.processorId ?? null,
      processor_response: input.processorResponse ?? null,
      customer_name: input.customerName ?? null,
      notes: input.notes ?? null,
      items: input.items ?? null,
      tax_amount: input.taxAmount,
      discount_amount: input.discountAmount,
    })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data);
}

export async function getPayments(organizationId: string, limit = 50): Promise<Payment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function getRecentPayments(
  organizationId: string,
  limit = 30,
  offset = 0,
  search?: string
): Promise<Payment[]> {
  const supabase = createClient();
  let query = supabase
    .from("payments")
    .select("*")
    .eq("organization_id", organizationId)
    .gte("amount", 0) // exclude negative audit records
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(
      `customer_name.ilike.${term},processor_id.ilike.${term},notes.ilike.${term}`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(fromDb);
}

export async function updatePaymentStatus(
  id: string,
  status: PaymentStatus,
  processorId?: string,
  processorResponse?: Record<string, unknown>
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = { status };
  if (processorId !== undefined) payload.processor_id = processorId;
  if (processorResponse !== undefined) payload.processor_response = processorResponse;
  const { error } = await supabase.from("payments").update(payload).eq("id", id);
  if (error) throw error;
}

// ─── Refund ───────────────────────────────────────────────────────────────────

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

// ─── Payment settings (tax rate + currency) ───────────────────────────────────

export interface PaymentConfig {
  taxRate: number;   // percentage e.g. 8.5
  currency: string;  // e.g. "USD"
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const supabase = createClient();
  const { data } = await supabase
    .from("settings")
    .select("payment_tax_rate, payment_currency")
    .maybeSingle();
  return {
    taxRate: Number(data?.payment_tax_rate ?? 0),
    currency: data?.payment_currency ?? "USD",
  };
}

export async function upsertPaymentConfig(
  userId: string,
  config: Partial<PaymentConfig>
): Promise<void> {
  const supabase = createClient();
  const payload: Record<string, unknown> = { user_id: userId };
  if (config.taxRate !== undefined) payload.payment_tax_rate = config.taxRate;
  if (config.currency !== undefined) payload.payment_currency = config.currency;
  const { error } = await supabase
    .from("settings")
    .upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}
