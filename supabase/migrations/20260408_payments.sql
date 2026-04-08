-- ─── Payments table ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid        REFERENCES organizations(id) ON DELETE SET NULL,
  user_id          uuid        REFERENCES auth.users(id)    ON DELETE SET NULL,
  order_id         uuid,       -- intentionally no FK; flexible reference
  amount           numeric     NOT NULL,
  currency         text        NOT NULL DEFAULT 'USD',
  method           text        NOT NULL CHECK (method IN ('card', 'cash', 'other')),
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  processor_id     text,       -- external transaction ID
  processor_response jsonb,
  customer_name    text,
  notes            text,
  items            jsonb,      -- snapshot of cart items
  tax_amount       numeric     NOT NULL DEFAULT 0,
  discount_amount  numeric     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_org_members" ON payments
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id
      FROM org_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- ─── Payment settings columns on the shared settings table ───────────────────
-- Tax rate and currency are org-level settings; the payment API token is
-- managed exclusively via environment variables and never stored in the DB.

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS payment_tax_rate numeric     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_currency text        NOT NULL DEFAULT 'USD';
