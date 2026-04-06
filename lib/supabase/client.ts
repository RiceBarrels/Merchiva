import { createBrowserClient } from "@supabase/ssr";
import type { CookieMethodsBrowser } from "@supabase/ssr";

const cookieMethods: CookieMethodsBrowser = {
  getAll() {
    if (typeof window === "undefined") return [];
    // Try localStorage first (Capacitor WKWebView), fall back to document.cookie
    const stored = window.localStorage.getItem("bizops-auth");
    if (stored) {
      try {
        return JSON.parse(stored) as { name: string; value: string }[];
      } catch { /* fall through */ }
    }
    return document.cookie
      .split("; ")
      .filter(Boolean)
      .map((c) => {
        const [name, ...rest] = c.split("=");
        return { name, value: rest.join("=") };
      });
  },
  setAll(cookies) {
    if (typeof window === "undefined") return;
    // Always save to localStorage (works in Capacitor + web)
    window.localStorage.setItem(
      "bizops-auth",
      JSON.stringify(cookies.map(({ name, value }) => ({ name, value })))
    );
    // Also set document.cookie for web SSR compatibility
    cookies.forEach(({ name, value, options }) => {
      const parts = [`${name}=${value}`];
      if (options?.path) parts.push(`path=${options.path}`);
      if (options?.maxAge) parts.push(`max-age=${options.maxAge}`);
      if (options?.sameSite) parts.push(`samesite=${options.sameSite}`);
      document.cookie = parts.join("; ");
    });
  },
};

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: cookieMethods,
      isSingleton: true,
    }
  );
}
