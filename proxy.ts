import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  RTL_LOCALES,
  isLocale,
  normalizeLocale,
} from "@/lib/i18n/config";

// ─── CORS (for /api/*) ──────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://project-management-phi-red.vercel.app",
  "merchiva://",
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost:5500",
  "http://localhost:3000",
];

// Capacitor Android WebView (androidScheme "https"). Exact match only: a prefix match would also accept
// https://localhost.attacker.com, and credentials are allowed.
const EXACT_ALLOWED_ORIGINS = ["https://localhost"];

function getAllowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (EXACT_ALLOWED_ORIGINS.includes(origin)) return origin;
  if (ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) return origin;
  return null;
}

function handleApiCors(req: NextRequest): NextResponse {
  const origin = req.headers.get("origin");
  const allowed = getAllowedOrigin(origin);

  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        ...(allowed && {
          "Access-Control-Allow-Origin": allowed,
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          // x-uploadthing-*, b3, traceparent: sent by the uploadthing client (Docs image upload from the static app).
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-uploadthing-package, x-uploadthing-version, b3, traceparent",
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

// ─── Locale routing (for public marketing pages) ────────────────────────────

// Returns the locale if `pathname` starts with a valid /<locale> prefix.
function localePrefix(pathname: string): string | null {
  const first = pathname.split("/")[1];
  return isLocale(first) ? first : null;
}

// cookie → Accept-Language → default. Returns one of our supported locales.
function detectLocale(req: NextRequest): string {
  const cookie = req.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;

  const accept = req.headers.get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const tag = part.split(";")[0].trim();
    const match = normalizeLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

function handleLocale(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const prefix = localePrefix(pathname);

  if (prefix) {
    // Valid locale prefix — pass through, exposing it to the root layout so it
    // can server-render <html lang>/dir and seed the client i18n provider.
    const headers = new Headers(req.headers);
    headers.set("x-locale", prefix);
    headers.set("x-dir", RTL_LOCALES.has(prefix as never) ? "rtl" : "ltr");
    return NextResponse.next({ request: { headers } });
  }

  // No prefix on a localized route → redirect to the detected locale. 307 (not
  // permanent) because the target depends on the visitor's cookie/headers.
  const cookie = req.cookies.get(LOCALE_COOKIE)?.value;
  const locale = detectLocale(req);
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  const res = NextResponse.redirect(url, 307);
  if (!isLocale(cookie)) {
    res.cookies.set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  return res;
}

// ─── Entry ──────────────────────────────────────────────────────────────────

export default function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api")) return handleApiCors(req);
  return handleLocale(req);
}

// Union of: /api/* (CORS) and the public marketing routes (locale routing).
// Everything else — /manager/, /s, /login, /admins, etc. — is absent on purpose.
export const config = {
  matcher: [
    "/api/:path*",
    "/",
    "/pricing/:path*",
    "/features/:path*",
    "/about/:path*",
    "/changelog/:path*",
    "/blogs/:path*",
    "/download/:path*",
    "/:locale(en|zh-cn|zh-tw|zh-hk|fr|es|hi|ar)/:path*",
  ],
};
