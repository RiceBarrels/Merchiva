export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "include",
  });
  return res.json() as Promise<T>;
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
  });
  return res.json() as Promise<T>;
}
