// @ts-nocheck
import { getConnection } from "@/lib/spacetimedb/client";

/** Returns a map of userId → avatarUrl for the given user IDs */
export async function getAvatarMap(
  userIds: string[]
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};

  const c = getConnection();
  if (!c) return {};

  const userIdSet = new Set(userIds);
  const allUsers = Array.from(c.db.user.iter());

  const map: Record<string, string> = {};
  for (const row of allUsers) {
    const uid = row.identity.toHexString();
    if (userIdSet.has(uid) && row.avatarUrl) {
      map[uid] = row.avatarUrl;
    }
  }
  return map;
}
