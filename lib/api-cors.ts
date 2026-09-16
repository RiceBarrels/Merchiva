import { NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  "https://merchiva.com",
  "https://www.merchiva.com",
  "https://project-management-phi-red.vercel.app",
  "merchiva://",
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost:5500",
  "http://localhost:3000",
];

function getAllowedOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  // Capacitor Android WebView; exact match (see proxy.ts).
  if (origin === "https://localhost") return origin;
  if (ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) return origin;
  return null;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = getAllowedOrigin(req);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

export function handleOptions(req: Request): NextResponse {
  return NextResponse.json(null, { status: 204, headers: corsHeaders(req) });
}

export function jsonWithCors(req: Request, body: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(body, { ...init, headers: corsHeaders(req) });
}
