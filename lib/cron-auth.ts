// The shared-secret check behind the Vercel Cron routes (the Drive GC and
// reconcile crons, the notifications cron). Vercel sends
// `Authorization: Bearer $CRON_SECRET`; each route reads the bearer with
// bearerToken (lib/drive/server/http.ts) and compares it here. Pure.

/** Compares every byte of the expected secret whatever the input, so the time taken says nothing about a prefix. */
export function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}
