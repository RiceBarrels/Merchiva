"use client";

/**
 * /merchivaAdmin/data — tab strip (Tables / Reducers / SQL) driven by
 * `?tab=`. Visited tabs stay mounted (hidden) so loaded rows, reducer
 * history and SQL text survive switching.
 */

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { PageHeader } from "@/components/merchiva-admin/ui";
import { ReducersTab } from "./reducers-tab";
import { SqlTab } from "./sql-tab";
import { TablesTab } from "./tables-tab";
import { TABLE_BY_NAME } from "./tables";

const TABS = [
  { id: "tables", label: "Tables" },
  { id: "reducers", label: "Reducers" },
  { id: "sql", label: "SQL" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function isTab(v: string | null): v is TabId {
  return TABS.some((t) => t.id === v);
}

export function DataConsole() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = params.get("tab");
  const tab: TabId = isTab(tabParam) ? tabParam : "tables";
  const tableParam = params.get("table") ?? "";
  const table = TABLE_BY_NAME[tableParam] ? tableParam : "";
  const reducer = params.get("reducer") ?? "";
  const q = params.get("q") ?? undefined;

  // Visited tabs stay mounted; derive during render (no effect needed).
  const [visited, setVisited] = useState<Set<TabId>>(() => new Set<TabId>([tab]));
  if (!visited.has(tab)) setVisited(new Set(visited).add(tab));

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router]
  );

  function tabHref(id: TabId): string {
    const next = new URLSearchParams(params.toString());
    next.set("tab", id);
    return `${pathname}?${next.toString()}`;
  }

  return (
    <div>
      <PageHeader eyebrow="data" title="Data tools" />
      <div className="mb-4 flex gap-1 border-b border-stone-200">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            replace
            scroll={false}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] ${
              t.id === tab ? "border-stone-900 font-medium text-stone-900" : "border-transparent text-stone-500 hover:text-stone-900"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {visited.has("tables") && (
        <div hidden={tab !== "tables"}>
          <TablesTab table={table} onTableChange={(name) => setParam("table", name)} />
        </div>
      )}
      {visited.has("reducers") && (
        <div hidden={tab !== "reducers"}>
          <ReducersTab reducer={reducer} onReducerChange={(name) => setParam("reducer", name)} />
        </div>
      )}
      {visited.has("sql") && (
        <div hidden={tab !== "sql"}>
          <SqlTab key={q ?? ""} initialQuery={q} />
        </div>
      )}
    </div>
  );
}
