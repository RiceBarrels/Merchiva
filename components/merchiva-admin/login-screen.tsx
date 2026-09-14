"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/merchiva-admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4 text-stone-900">
      <form onSubmit={submit} className="w-full max-w-sm rounded-[0.15rem] border border-stone-200 bg-white p-6">
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">Merchiva / platform admin</div>
        <h1 className="mt-1 font-sans text-[20px] font-semibold tracking-tight">Sign in</h1>
        <label className="mt-5 block text-[12px] font-medium text-stone-600" htmlFor="admin-username">
          Username
        </label>
        <input
          id="admin-username"
          autoComplete="username"
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mt-1 w-full rounded-[0.15rem] border border-stone-300 bg-white px-3 py-2 font-mono text-[13px] outline-none focus:border-stone-900"
          required
        />
        <label className="mt-3 block text-[12px] font-medium text-stone-600" htmlFor="admin-password">
          Password
        </label>
        <input
          id="admin-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-[0.15rem] border border-stone-300 bg-white px-3 py-2 font-mono text-[13px] outline-none focus:border-stone-900"
          required
        />
        {error && (
          <div className="mt-3 rounded-[0.15rem] border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-[0.15rem] bg-stone-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-stone-800 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
