import Link from "next/link";
import { adminSql } from "@/lib/merchiva-admin/stdb";
import { ADMIN_NAV } from "@/components/merchiva-admin/nav";

export const dynamic = "force-dynamic";

async function count(table: string): Promise<number | null> {
  try {
    const rows = await adminSql(`SELECT * FROM ${table}`);
    return rows.length;
  } catch {
    return null;
  }
}

export default async function MerchivaAdminHome() {
  const [orgs, users, members, admins, items, staff] = await Promise.all([
    count("organization"),
    count("user"),
    count("org_member"),
    count("platform_admin"),
    count("inventory_item"),
    count("staff_member"),
  ]);

  const stats: Array<[string, number | null]> = [
    ["Organizations", orgs],
    ["Users", users],
    ["Memberships", members],
    ["Inventory items", items],
    ["Staff", staff],
    ["Platform admins", admins],
  ];

  return (
    <div>
      <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500">/ overview</div>
      <h1 className="mt-1 font-sans text-[24px] font-semibold tracking-tight">Platform console</h1>
      <p className="mt-1 max-w-2xl text-[13px] text-stone-600">
        Full access to every organization&apos;s data. Changes take effect immediately for the affected stores.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-[0.15rem] border border-stone-200 bg-white px-4 py-3">
            <div className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">{label}</div>
            <div className="mt-1 font-mono text-[22px] font-semibold tabular-nums">{value ?? "—"}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ADMIN_NAV.filter((n) => n.href !== "/merchivaAdmin").map((n) => (
          <Link key={n.href} href={n.href} className="rounded-[0.15rem] border border-stone-200 bg-white px-4 py-3 text-[13px] font-medium hover:border-stone-400">
            {n.label} →
          </Link>
        ))}
      </div>
    </div>
  );
}
