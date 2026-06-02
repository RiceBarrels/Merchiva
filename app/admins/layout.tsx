"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/context";
import { useT } from "@/lib/i18n/context";
import { apiUrl } from "@/lib/api-client";
import { SpacetimeProvider } from "@/lib/spacetimedb/provider";

const NAV = [
  { href: "/admins", key: "overview" },
  { href: "/admins/database", key: "database" },
  { href: "/admins/blogs", key: "blogs" },
  { href: "/admins/coupons", key: "coupons" },
  { href: "/admins/users", key: "users" },
  { href: "/admins/usage", key: "usage" },
] as const;

export default function AdminsLayout({ children }: { children: React.ReactNode }) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [state, setState] = useState<"checking" | "ok" | "denied">("checking");
  const [adminEmail, setAdminEmail] = useState<string>("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/login?redirect=/admins");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token) {
          if (!cancelled) router.replace("/login?redirect=/admins");
          return;
        }
        const res = await fetch(apiUrl("/api/admins/check"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (!res.ok) {
          setState("denied");
          return;
        }
        const data = await res.json();
        if (data.isAdmin) {
          setAdminEmail(data.user?.email ?? "");
          setState("ok");
        } else {
          setState("denied");
        }
      } catch {
        if (!cancelled) setState("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken, router]);

  if (state === "checking") {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50">
        <div className="font-mono text-[12px] text-stone-500">{t("admins.checking")}</div>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-50 px-6">
        <div className="max-w-md rounded border border-stone-200 bg-white px-8 py-10 text-center">
          <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500">
            {t("admins.deniedTag")}
          </div>
          <h1 className="mt-3 font-sans text-[22px] font-semibold tracking-tight text-stone-950">
            {t("admins.deniedTitle")}
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-stone-600">
            {t("admins.deniedBody")}
          </p>
          <Link
            href="/~/dashboard"
            className="mt-6 inline-block rounded border border-stone-300 bg-white px-4 py-2 text-[13px] font-medium text-stone-900 hover:bg-stone-50"
          >
            {t("admins.backToApp")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <SpacetimeProvider>
      <AdminShell adminEmail={adminEmail} pathname={pathname} t={t}>{children}</AdminShell>
    </SpacetimeProvider>
  );
}

function AdminShell({
  adminEmail,
  pathname,
  t,
  children,
}: {
  adminEmail: string;
  pathname: string | null;
  t: (k: string) => string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <svg width={20} height={20} viewBox="0 0 100 100" className="rounded-sm">
                <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill="currentColor" />
              </svg>
              <span className="font-sans text-[15px] font-semibold tracking-tight">
                Merchiva
              </span>
            </Link>
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">
              / {t("admins.shellTag")}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-[11px] text-stone-500 sm:inline">{adminEmail}</span>
            <Link
              href="/~/dashboard"
              className="rounded border border-stone-300 bg-white px-3 py-1.5 text-[12px] font-medium text-stone-900 hover:bg-stone-50"
            >
              {t("admins.exit")}
            </Link>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map((item) => {
            const active =
              item.href === "/admins"
                ? pathname === "/admins"
                : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "rounded px-3 py-1.5 text-[13px] font-medium transition-colors " +
                  (active
                    ? "bg-stone-900 text-white"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900")
                }
              >
                {t(`admins.nav.${item.key}`)}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
