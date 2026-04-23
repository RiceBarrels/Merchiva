import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = [
  "https://project-management-phi-red.vercel.app",
  "merchiva://",
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost:5500",
  "http://localhost:3000",
];

function getAllowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) return origin;
  return null;
}

export default function proxy(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allowed = getAllowedOrigin(origin);

  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...(allowed && {
          "Access-Control-Allow-Origin": allowed,
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Max-Age": "86400",
        }),
      },
    });
  }

  const res = NextResponse.next();
  if (allowed) {
    res.headers.set("Access-Control-Allow-Origin", allowed);
    res.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
