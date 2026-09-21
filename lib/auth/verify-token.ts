// Verifying a WorkOS access token server-side.
//
// The app sends its WorkOS access token as `Authorization: Bearer <jwt>`. A
// route that acts on it MUST check the signature: the payload is attacker-
// controlled otherwise, and `sub` is just a string the caller typed. This is
// the one place that verification lives.

import { createRemoteJWKSet, jwtVerify } from "jose";
import { clientId, workos } from "./workos";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  if (jwks) return jwks;
  if (!clientId) return null;
  try {
    jwks = createRemoteJWKSet(new URL(workos.userManagement.getJwksUrl(clientId)));
    return jwks;
  } catch (err) {
    console.error("[auth] could not build the WorkOS JWKS:", err);
    return null;
  }
}

/**
 * The WorkOS user id from a verified Bearer token, or null.
 *
 * Fails closed: a missing WORKOS_CLIENT_ID means no token can be verified, so
 * no token is accepted.
 */
export async function verifiedUserId(authHeader: string | null): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;

  const keys = getJwks();
  if (!keys) {
    console.error("[auth] WORKOS_CLIENT_ID is not set — refusing to verify tokens");
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, keys);
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    // Bad signature, wrong issuer, expired — all the same answer.
    return null;
  }
}
