// The signed-in session's token getter, for code with no React of its own
// (Mr. Merchiva's action registry, lib/team/invite-email.ts). AuthProvider
// registers its getToken, which refreshes a WorkOS access token about to
// expire; a raw localStorage read would hand out a stale one (they live ~5 min).

type TokenGetter = () => Promise<string | null>;

let getter: TokenGetter | null = null;

/** Called by AuthProvider. Returns the unregister function for its effect cleanup. */
export function registerAuthTokenGetter(fn: TokenGetter): () => void {
  getter = fn;
  return () => {
    if (getter === fn) getter = null;
  };
}

/** A fresh access token, or null when signed out or before AuthProvider mounted. */
export async function currentAuthToken(): Promise<string | null> {
  if (!getter) return null;
  try {
    return await getter();
  } catch {
    return null;
  }
}
