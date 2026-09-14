"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { ADMIN_NAV } from "./nav";

export function AdminShell({ username, children }: { username: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function logout() {
    setSigningOut(true);
    try {
      await fetch("/api/merchiva-admin/logout", { method: "POST" });
    } finally {
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-2.5">
          <div className="flex items-center gap-3">
            <Link href="/merchivaAdmin" className="flex items-center gap-2">
              <svg width={18} height={18} viewBox="0 0 100 100" className="rounded-sm">
                <path d="M14 14 L40 14 L50 42 L60 14 L86 14 L86 86 L14 86 Z" fill="currentColor" />
              </svg>
              <span className="font-sans text-[14px] font-semibold tracking-tight">Merchiva</span>
            </Link>
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">/ platform admin</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden font-mono text-[11px] text-stone-500 sm:inline">{username}</span>
            <button
              type="button"
              onClick={logout}
              disabled={signingOut}
              className="rounded-[0.15rem] border border-stone-300 bg-white px-3 py-1.5 text-[12px] font-medium hover:bg-stone-50 disabled:opacity-60"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-2">
          {ADMIN_NAV.map((item) => {
            const active =
              item.href === "/merchivaAdmin" ? pathname === "/merchivaAdmin" : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  "whitespace-nowrap rounded-[0.15rem] px-3 py-1.5 text-[13px] font-medium transition-colors " +
                  (active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100 hover:text-stone-900")
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>
    </div>
  );
}
