import { NextResponse } from "next/server";
import { matchAllowedOrigin, type OriginAllowList } from "@/lib/allowed-origins";

// "https://localhost" is the Capacitor Android WebView (androidScheme "https").
// Matching rules and why a prefix is unsafe: lib/allowed-origins.ts.
export const API_CORS_ORIGINS: OriginAllowList = {
  exact: new Set([
    "https://merchiva.com",
    "https://www.merchiva.com",
    "https://project-management-phi-red.vercel.app",
    "https://localhost",
    "capacitor://localhost",
    "ionic://localhost",
    "http://localhost:5500",
    "http://localhost:3000",
  ]),
  schemes: ["merchiva://"],
};

function getAllowedOrigin(req: Request): string | null {
  return matchAllowedOrigin(req.headers.get("origin"), API_CORS_ORIGINS);
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
