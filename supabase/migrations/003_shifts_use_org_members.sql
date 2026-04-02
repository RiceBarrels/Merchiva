-- Remove FK from staff_members, point staff_id to org_members instead
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_staff_id_fkey;

-- staff_id now references org_members (nullable, ON DELETE SET NULL)
-- We don't add a formal FK since org_members.id is uuid and this is loose coupling
-- The column remains for backward compatibility but now stores org_member IDs

-- Add member_id column explicitly for clarity
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES org_members(id) ON DELETE SET NULL;
