-- ─── Refund columns on payments table ────────────────────────────────────────

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refund_amount  numeric,
  ADD COLUMN IF NOT EXISTS refund_reason  text,
  ADD COLUMN IF NOT EXISTS refunded_at    timestamptz;
