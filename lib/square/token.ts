// Square credentials were stored in Supabase settings table.
// Settings migration to SpacetimeDB is pending — return null for now.
export async function getValidSquareToken(
  _userId: string
): Promise<string | null> {
  return null;
}
