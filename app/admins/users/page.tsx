"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { apiUrl } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface AdminUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  emailVerified: boolean;
  createdAt: string;
  role: string | null;
  isAdmin: boolean;
  adminSource: "env" | "metadata" | null;
}

export default function AdminsUsersPage() {
  const t = useT();
  const { getToken } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (q: string) => {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not authenticated");
        const params = new URLSearchParams();
        if (q) params.set("search", q);
        const res = await fetch(apiUrl(`/api/admins/users?${params.toString()}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed");
          return;
        }
        setUsers(data.users);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [getToken],
  );

  useEffect(() => {
    load("");
  }, [load]);

  async function setRole(user: AdminUser, role: "admin" | null) {
    if (user.adminSource === "env") {
      toast.info(t("admins.users.envLocked"));
      return;
    }
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(apiUrl(`/api/admins/users/${user.id}/role`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(role === "admin" ? t("admins.users.toast.promoted") : t("admins.users.toast.demoted"));
      load(search);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500">
          / {t("admins.shellTag")} / users
        </div>
        <h1 className="mt-2 font-sans text-[28px] font-semibold tracking-tight text-stone-950">
          {t("admins.users.title")}
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-stone-600">{t("admins.users.subtitle")}</p>
      </div>

      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") load(search);
          }}
          placeholder={t("admins.users.searchPlaceholder")}
          className="max-w-sm"
        />
        <Button onClick={() => load(search)} disabled={loading}>
          {loading ? t("admins.users.loading") : t("admins.users.search")}
        </Button>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2 font-mono text-[12px] text-red-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded border border-stone-200 bg-white">
        <table className="min-w-full divide-y divide-stone-200 text-[13px]">
          <thead className="bg-stone-50">
            <tr>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-stone-600">
                {t("admins.users.col.email")}
              </th>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-stone-600">
                {t("admins.users.col.name")}
              </th>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-stone-600">
                {t("admins.users.col.role")}
              </th>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-stone-600">
                {t("admins.users.col.verified")}
              </th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {users.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center font-mono text-[12px] text-stone-500">
                  {t("admins.users.empty")}
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-stone-50">
                  <td className="px-3 py-2 font-mono text-[12px] text-foreground">{u.email}</td>
                  <td className="px-3 py-2 text-stone-800">
                    {[u.firstName, u.lastName].filter(Boolean).join(" ") || (
                      <span className="text-stone-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {u.isAdmin ? (
                      <Badge>
                        {t("admins.users.adminBadge")}
                        {u.adminSource === "env" ? ` · env` : ""}
                      </Badge>
                    ) : (
                      <span className="text-stone-500">{t("admins.users.userBadge")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {u.emailVerified ? (
                      <span className="font-mono text-[11px] text-green-700">✓</span>
                    ) : (
                      <span className="font-mono text-[11px] text-stone-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {u.adminSource === "env" ? (
                      <span className="font-mono text-[11px] text-stone-500">
                        {t("admins.users.envLockedShort")}
                      </span>
                    ) : u.isAdmin ? (
                      <Button variant="ghost" size="sm" onClick={() => setRole(u, null)}>
                        {t("admins.users.demote")}
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setRole(u, "admin")}>
                        {t("admins.users.promote")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
