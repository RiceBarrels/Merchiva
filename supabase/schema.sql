-- ─────────────────────────────────────────────────────────────────────────────
-- BizOps — Supabase Schema
-- Run this in the Supabase SQL Editor for your project.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Settings (one row per user, Square credentials live here) ───────────────
CREATE TABLE IF NOT EXISTS settings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  business_name    text,
  business_type    text,
  timezone         text NOT NULL DEFAULT 'America/Los_Angeles',
  square_connected boolean NOT NULL DEFAULT false,
  square_access_token text,   -- store server-side only; never expose to client
  square_refresh_token text,
  square_token_expires_at timestamptz,
  square_merchant_id  text,
  square_location_id  text,
  square_last_synced_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own settings"
  ON settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Prevent the client from reading the raw Square token (use an RPC instead)
CREATE POLICY "Hide square_access_token from client"
  ON settings FOR SELECT
  USING (auth.uid() = user_id);

-- ─── Inventory Items ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name           text NOT NULL,
  category       text NOT NULL DEFAULT 'Other',
  current_stock  numeric NOT NULL DEFAULT 0,
  min_stock      numeric NOT NULL DEFAULT 0,
  max_stock      numeric NOT NULL DEFAULT 100,
  unit           text NOT NULL DEFAULT 'units',
  cost_per_unit  numeric NOT NULL DEFAULT 0,
  supplier       text NOT NULL DEFAULT '',
  last_restocked date NOT NULL DEFAULT CURRENT_DATE,
  loss_rate      numeric NOT NULL DEFAULT 0,
  square_item_id text,          -- populated by Square sync
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own inventory"
  ON inventory_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Inventory Transactions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  item_id   uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  type      text NOT NULL CHECK (type IN ('in', 'out', 'loss', 'adjustment')),
  quantity  numeric NOT NULL,
  note      text NOT NULL DEFAULT '',
  date      date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own transactions"
  ON inventory_transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Sales Records ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date             date NOT NULL,
  hour             integer,              -- NULL = daily aggregate; 0-23 = hourly
  actual           numeric NOT NULL DEFAULT 0,
  predicted        numeric,
  weather          text,
  foot_traffic     integer,
  is_holiday       boolean NOT NULL DEFAULT false,
  square_order_ids text[],              -- Square order IDs included in this record
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date, hour)          -- prevent duplicate records
);

ALTER TABLE sales_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own sales records"
  ON sales_records FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Staff Roles (manager-defined) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_roles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name          text NOT NULL,
  color         text NOT NULL DEFAULT '#44403c',
  permissions   jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE staff_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own roles"
  ON staff_roles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Staff Members ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name         text NOT NULL,
  role         text NOT NULL DEFAULT 'Staff',
  hourly_rate  numeric NOT NULL DEFAULT 0,
  availability text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own staff"
  ON staff_members FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Shifts ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  staff_id         uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  staff_name       text NOT NULL,
  date             date NOT NULL,
  shift_type       text NOT NULL CHECK (shift_type IN ('morning', 'afternoon', 'evening', 'closing')),
  start_time       time NOT NULL,
  end_time         time NOT NULL,
  predicted_demand text NOT NULL DEFAULT 'medium'
                        CHECK (predicted_demand IN ('low', 'medium', 'high')),
  staff_role       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own shifts"
  ON shifts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Products ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name                   text NOT NULL,
  category               text NOT NULL DEFAULT 'Other',
  price                  numeric NOT NULL DEFAULT 0,
  cost                   numeric NOT NULL DEFAULT 0,
  units_sold_this_month  integer NOT NULL DEFAULT 0,
  units_sold_last_month  integer NOT NULL DEFAULT 0,
  revenue                numeric NOT NULL DEFAULT 0,
  margin                 numeric NOT NULL DEFAULT 0,
  rating                 numeric NOT NULL DEFAULT 5,
  trend                  text NOT NULL DEFAULT 'stable'
                              CHECK (trend IN ('up', 'down', 'stable')),
  alert                  text NOT NULL DEFAULT 'none'
                              CHECK (alert IN ('none', 'underperforming', 'remove')),
  alert_reason           text,
  square_item_id         text,          -- populated by Square sync
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own products"
  ON products FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Helper: auto-update updated_at ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_inventory_items_updated_at
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_staff_roles_updated_at
  BEFORE UPDATE ON staff_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_staff_members_updated_at
  BEFORE UPDATE ON staff_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Secure RPC: get Square credentials (server-side only) ───────────────────
-- Call via supabase.rpc('get_square_credentials') from your API routes.
-- Returns null rows if the user has no credentials yet.
DROP FUNCTION IF EXISTS get_square_credentials();
CREATE OR REPLACE FUNCTION get_square_credentials()
RETURNS TABLE(access_token text, location_id text, refresh_token text, token_expires_at timestamptz, merchant_id text)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT square_access_token, square_location_id, square_refresh_token, square_token_expires_at, square_merchant_id
  FROM settings
  WHERE user_id = auth.uid();
$$;
