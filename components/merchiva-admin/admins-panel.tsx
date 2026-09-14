"use client";

import { useCallback, useEffect, useState } from "react";
import { formatTs } from "@/lib/merchiva-admin/client";

interface AdminRow {
  username: string;
  createdAt: number;
  createdBy: string;
  lastLoginAt: number | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export function AdminsPanel({ me }: { me: string }) {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);

  const [curPass, setCurPass] = useState("");
  const [nextPass, setNextPass] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeMsg, setChangeMsg] = useState<string | null>(null);

  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPass, setResetPass] = useState("");
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ admins: AdminRow[] }>("/api/merchiva-admin/admins");
      setAdmins(data.admins);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admins");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  async function addAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddMsg(null);
    try {
      await api("/api/merchiva-admin/admins", { method: "POST", body: JSON.stringify({ username: newUser, password: newPass }) });
      setAddMsg(`Added ${newUser.trim().toLowerCase()}`);
      setNewUser("");
      setNewPass("");
      await load();
    } catch (err) {
      setAddMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setAdding(false);
    }
  }

  async function removeAdmin(username: string) {
    if (!window.confirm(`Remove platform admin "${username}"?`)) return;
    setError(null);
    try {
      await api("/api/merchiva-admin/admins", { method: "DELETE", body: JSON.stringify({ username }) });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove admin");
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setChanging(true);
    setChangeMsg(null);
    try {
      await api("/api/merchiva-admin/password", { method: "POST", body: JSON.stringify({ currentPassword: curPass, newPassword: nextPass }) });
      setChangeMsg("Password updated");
      setCurPass("");
      setNextPass("");
    } catch (err) {
      setChangeMsg(err instanceof Error ? err.message : "Failed");
    } finally {
      setChanging(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    setResetMsg(null);
    try {
      await api("/api/merchiva-admin/password", { method: "POST", body: JSON.stringify({ username: resetTarget, newPassword: resetPass }) });
      setResetMsg(`Password reset for ${resetTarget}`);
      setResetTarget(null);
      setResetPass("");
    } catch (err) {
      setResetMsg(err instanceof Error ? err.message : "Failed");
    }
  }

  const input = "w-full rounded-[0.15rem] border border-stone-300 bg-white px-3 py-1.5 font-mono text-[13px] outline-none focus:border-stone-900";
  const btn = "rounded-[0.15rem] bg-stone-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-stone-800 disabled:opacity-60";
  const btnGhost = "rounded-[0.15rem] border border-stone-300 bg-white px-2.5 py-1 text-[12px] font-medium hover:bg-stone-50";

  return (
    <div className="space-y-6">
      <section className="rounded-[0.15rem] border border-stone-200 bg-white">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5">
          <h2 className="text-[13px] font-semibold">Platform admins</h2>
          <button type="button" onClick={() => load()} className={btnGhost}>
            Refresh
          </button>
        </div>
        {error && <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-[12px] text-red-700">{error}</div>}
        <table className="w-full text-[13px]">
          <thead className="bg-stone-50 text-left font-mono text-[11px] uppercase tracking-wider text-stone-500">
            <tr>
              <th className="px-4 py-2 font-medium">Username</th>
              <th className="px-4 py-2 font-medium">Created</th>
              <th className="px-4 py-2 font-medium">Created by</th>
              <th className="px-4 py-2 font-medium">Last login</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading && admins.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-stone-500">
                  Loading…
                </td>
              </tr>
            ) : admins.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-stone-500">
                  No admins
                </td>
              </tr>
            ) : (
              admins.map((a) => (
                <tr key={a.username} className="border-t border-stone-100">
                  <td className="px-4 py-2 font-mono">
                    {a.username}
                    {a.username === me && <span className="ml-2 text-[10.5px] uppercase text-stone-400">you</span>}
                  </td>
                  <td className="px-4 py-2 text-stone-600">{formatTs(a.createdAt)}</td>
                  <td className="px-4 py-2 font-mono text-stone-600">{a.createdBy}</td>
                  <td className="px-4 py-2 text-stone-600">{formatTs(a.lastLoginAt)}</td>
                  <td className="px-4 py-2 text-right">
                    {a.username !== me && (
                      <span className="inline-flex gap-1.5">
                        <button type="button" className={btnGhost} onClick={() => { setResetTarget(a.username); setResetPass(""); setResetMsg(null); }}>
                          Reset password
                        </button>
                        <button type="button" className={btnGhost + " text-red-700"} onClick={() => removeAdmin(a.username)}>
                          Remove
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {resetTarget && (
          <form onSubmit={resetPassword} className="flex flex-wrap items-end gap-2 border-t border-stone-200 bg-stone-50 px-4 py-3">
            <div className="text-[12px] text-stone-600">
              New password for <span className="font-mono">{resetTarget}</span>
            </div>
            <input type="password" className={input + " max-w-xs"} value={resetPass} onChange={(e) => setResetPass(e.target.value)} minLength={8} required />
            <button type="submit" className={btn}>Set</button>
            <button type="button" className={btnGhost} onClick={() => setResetTarget(null)}>Cancel</button>
            {resetMsg && <span className="text-[12px] text-stone-600">{resetMsg}</span>}
          </form>
        )}
        {!resetTarget && resetMsg && <div className="border-t border-stone-200 px-4 py-2 text-[12px] text-stone-600">{resetMsg}</div>}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <form onSubmit={addAdmin} className="rounded-[0.15rem] border border-stone-200 bg-white p-4">
          <h2 className="text-[13px] font-semibold">Add admin</h2>
          <p className="mt-1 text-[12px] text-stone-500">New admins have the same full access as you.</p>
          <label className="mt-3 block text-[12px] font-medium text-stone-600">Username</label>
          <input className={input + " mt-1"} value={newUser} onChange={(e) => setNewUser(e.target.value)} autoCapitalize="none" required />
          <label className="mt-3 block text-[12px] font-medium text-stone-600">Password</label>
          <input type="password" className={input + " mt-1"} value={newPass} onChange={(e) => setNewPass(e.target.value)} minLength={8} required />
          <div className="mt-4 flex items-center gap-3">
            <button type="submit" disabled={adding} className={btn}>{adding ? "Adding…" : "Add admin"}</button>
            {addMsg && <span className="text-[12px] text-stone-600">{addMsg}</span>}
          </div>
        </form>

        <form onSubmit={changePassword} className="rounded-[0.15rem] border border-stone-200 bg-white p-4">
          <h2 className="text-[13px] font-semibold">Change my password</h2>
          <p className="mt-1 text-[12px] text-stone-500">Signed in as <span className="font-mono">{me}</span>.</p>
          <label className="mt-3 block text-[12px] font-medium text-stone-600">Current password</label>
          <input type="password" className={input + " mt-1"} value={curPass} onChange={(e) => setCurPass(e.target.value)} autoComplete="current-password" required />
          <label className="mt-3 block text-[12px] font-medium text-stone-600">New password</label>
          <input type="password" className={input + " mt-1"} value={nextPass} onChange={(e) => setNextPass(e.target.value)} autoComplete="new-password" minLength={8} required />
          <div className="mt-4 flex items-center gap-3">
            <button type="submit" disabled={changing} className={btn}>{changing ? "Saving…" : "Update password"}</button>
            {changeMsg && <span className="text-[12px] text-stone-600">{changeMsg}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
