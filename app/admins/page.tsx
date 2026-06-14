"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/context";

const TILES = [
  { href: "/admins/database", key: "database" },
  { href: "/admins/blogs", key: "blogs" },
  { href: "/admins/coupons", key: "coupons" },
  { href: "/admins/users", key: "users" },
  { href: "/admins/usage", key: "usage" },
] as const;

export default function AdminsHomePage() {
  const t = useT();
  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500">
        / {t("admins.shellTag")}
      </div>
      <h1 className="mt-2 font-sans text-[32px] font-semibold tracking-tight text-stone-950">
        {t("admins.home.title")}
      </h1>
      <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-stone-600">
        {t("admins.home.subtitle")}
      </p>
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TILES.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="group rounded border border-stone-200 bg-white p-5 transition-colors hover:border-stone-400"
          >
            <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500">
              {t(`admins.tiles.${tile.key}.tag`)}
            </div>
            <div className="mt-2 font-sans text-[18px] font-semibold tracking-tight text-stone-950">
              {t(`admins.tiles.${tile.key}.title`)}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-stone-600">
              {t(`admins.tiles.${tile.key}.body`)}
            </p>
            <div className="mt-3 font-mono text-[11px] text-stone-500 group-hover:text-foreground">
              {t("admins.home.open")} →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
