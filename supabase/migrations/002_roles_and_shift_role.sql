-- ─── Custom Roles (manager-defined) ──────────────────────────────────────────
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

CREATE TRIGGER trg_staff_roles_updated_at
  BEFORE UPDATE ON staff_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Add role column to shifts ───────────────────────────────────────────────
ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS staff_role text;
