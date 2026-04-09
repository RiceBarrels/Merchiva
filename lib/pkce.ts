/** Generate a cryptographically random base64url string for the code_verifier. */
function randomBase64url(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/** SHA-256 hash of the verifier, base64url-encoded → code_challenge. */
async function sha256Base64url(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export interface PKCEPair {
  verifier: string;
  challenge: string;
}

/** Generate a PKCE verifier + challenge pair. Must be called in a browser context. */
export async function generatePKCE(): Promise<PKCEPair> {
  const verifier = randomBase64url(64); // 64 random bytes → ~86-char verifier
  const challenge = await sha256Base64url(verifier);
  return { verifier, challenge };
}

const VERIFIER_KEY = "pkce_verifier";
const NONCE_KEY = "pkce_nonce";

export function savePKCE(verifier: string, nonce: string) {
  localStorage.setItem(VERIFIER_KEY, verifier);
  localStorage.setItem(NONCE_KEY, nonce);
}

export function loadPKCE(): { verifier: string; nonce: string } | null {
  const verifier = localStorage.getItem(VERIFIER_KEY);
  const nonce = localStorage.getItem(NONCE_KEY);
  if (!verifier || !nonce) return null;
  return { verifier, nonce };
}

export function clearPKCE() {
  localStorage.removeItem(VERIFIER_KEY);
  localStorage.removeItem(NONCE_KEY);
}
