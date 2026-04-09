
/** Returns a map of userId → avatarUrl for the given user IDs */
export async function getAvatarMap(
  userIds: string[]
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const supabase = createClient();
  const { data } = await supabase
    .from("user_profiles")
    .select("user_id, avatar_url")
    .in("user_id", userIds);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.avatar_url) map[row.user_id] = row.avatar_url;
  }
  return map;
}
