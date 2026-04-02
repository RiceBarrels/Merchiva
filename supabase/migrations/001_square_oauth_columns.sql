-- Add OAuth token columns to settings table
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS square_refresh_token text,
  ADD COLUMN IF NOT EXISTS square_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS square_merchant_id text;

-- Recreate RPC with new return type
DROP FUNCTION IF EXISTS get_square_credentials();
CREATE OR REPLACE FUNCTION get_square_credentials()
RETURNS TABLE(access_token text, location_id text, refresh_token text, token_expires_at timestamptz, merchant_id text)
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT square_access_token, square_location_id, square_refresh_token, square_token_expires_at, square_merchant_id
  FROM settings
  WHERE user_id = auth.uid();
$$;
