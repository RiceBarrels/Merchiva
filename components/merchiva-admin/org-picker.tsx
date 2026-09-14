"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAdminQuery } from "./use-admin-query";

export interface OrgRow {
  id: string;
  name: string;
  ownerId: string;
  parentOrgId: string | null;
  subscriptionStatus: string | null;
  createdAt: number;
}

const STORAGE_KEY = "merchiva_admin_org";

// Tiny external store around localStorage so the hook can read it with
// useSyncExternalStore (no setState-in-effect, SSR-safe: server snapshot is null).
const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function writeStored(id: string | null) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/**
 * Organization selector shared by every per-org admin page. The selection is
 * kept in the `?org=` query param (shareable) and mirrored to localStorage so
 * it follows the admin between pages.
 */
export function useSelectedOrg(): { orgId: string | null; setOrgId: (id: string | null) => void } {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get("org");
  const stored = useSyncExternalStore(subscribe, readStored, () => null);

  const orgId = fromUrl ?? stored;

  useEffect(() => {
    if (fromUrl && fromUrl !== readStored()) writeStored(fromUrl);
  }, [fromUrl]);

  const setOrgId = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("org", id);
    else next.delete("org");
    writeStored(id);
    router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`);
  };

  return { orgId, setOrgId };
}

export function OrgPicker({ orgId, onChange }: { orgId: string | null; onChange: (id: string | null) => void }) {
  const { rows, loading, error } = useAdminQuery<OrgRow>("SELECT * FROM organization");
  const sorted = useMemo(() => [...rows].sort((a, b) => a.name.localeCompare(b.name)), [rows]);
  const current = sorted.find((o) => o.id === orgId) ?? null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="font-mono text-[11px] uppercase tracking-wider text-stone-500" htmlFor="admin-org-picker">
        Organization
      </label>
      <select
        id="admin-org-picker"
        value={orgId ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-w-[220px] rounded-[0.15rem] border border-stone-300 bg-white px-2 py-1.5 text-[13px] outline-none focus:border-stone-900"
      >
        <option value="">{loading ? "Loading…" : "— select —"}</option>
        {sorted.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {o.parentOrgId ? " (sub-store)" : ""}
          </option>
        ))}
      </select>
      {current && <span className="font-mono text-[11px] text-stone-400">{current.id}</span>}
      {error && <span className="text-[12px] text-red-700">{error}</span>}
    </div>
  );
}
