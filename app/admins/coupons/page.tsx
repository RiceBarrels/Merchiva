"use client";

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { apiUrl } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Coupon {
  id: string;
  name: string | null;
  percentOff: number | null;
  amountOff: number | null;
  currency: string | null;
  duration: string;
  durationInMonths: number | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  valid: boolean;
  redeemBy: number | null;
  created: number;
}

interface PromoCode {
  id: string;
  code: string;
  couponId: string;
  active: boolean;
  expiresAt: number | null;
  maxRedemptions: number | null;
  timesRedeemed: number;
  created: number;
}

interface FormState {
  name: string;
  discountType: "percent" | "amount";
  percentOff: string;
  amountOff: string;
  currency: string;
  duration: "once" | "repeating" | "forever";
  durationInMonths: string;
  maxRedemptions: string;
  redeemBy: string;
  promoCode: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  discountType: "percent",
  percentOff: "10",
  amountOff: "500",
  currency: "usd",
  duration: "once",
  durationInMonths: "",
  maxRedemptions: "",
  redeemBy: "",
  promoCode: "",
};

function formatDiscount(c: Coupon): string {
  if (c.percentOff != null) return `${c.percentOff}%`;
  if (c.amountOff != null) {
    const cur = (c.currency ?? "usd").toUpperCase();
    return `${(c.amountOff / 100).toFixed(2)} ${cur}`;
  }
  return "—";
}

function formatDate(unix: number | null): string {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleDateString();
}

export default function AdminsCouponsPage() {
  const t = useT();
  const { getToken } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(apiUrl("/api/admins/coupons"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed");
        return;
      }
      setCoupons(data.coupons);
      setPromos(data.promoCodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const payload: Record<string, unknown> = {
        name: form.name || undefined,
        discountType: form.discountType,
        duration: form.duration,
      };
      if (form.discountType === "percent") {
        payload.percentOff = Number(form.percentOff);
      } else {
        payload.amountOff = Number(form.amountOff);
        payload.currency = form.currency;
      }
      if (form.duration === "repeating") {
        payload.durationInMonths = Number(form.durationInMonths);
      }
      if (form.maxRedemptions) payload.maxRedemptions = Number(form.maxRedemptions);
      if (form.redeemBy) {
        payload.redeemBy = Math.floor(new Date(form.redeemBy).getTime() / 1000);
      }
      if (form.promoCode.trim()) payload.promoCode = form.promoCode.trim();

      const res = await fetch(apiUrl("/api/admins/coupons"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(t("admins.coupons.toast.created"));
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("admins.coupons.confirmDelete").replace("{id}", id))) return;
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(apiUrl(`/api/admins/coupons/${id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed");
      }
      toast.success(t("admins.coupons.toast.deleted"));
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-stone-500">
            / {t("admins.shellTag")} / coupons
          </div>
          <h1 className="mt-2 font-sans text-[28px] font-semibold tracking-tight text-stone-950">
            {t("admins.coupons.title")}
          </h1>
          <p className="mt-1 text-[13px] text-stone-600">{t("admins.coupons.subtitle")}</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          {showForm ? t("admins.coupons.cancel") : t("admins.coupons.newCoupon")}
        </Button>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-2 font-mono text-[12px] text-red-700">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <div className="rounded border border-stone-200 bg-white p-4 space-y-3">
          <h2 className="font-sans text-[16px] font-semibold tracking-tight text-stone-950">
            {t("admins.coupons.createTitle")}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("admins.coupons.field.name")}>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Holiday 2026"
              />
            </Field>
            <Field label={t("admins.coupons.field.type")}>
              <div className="flex gap-2">
                {(["percent", "amount"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm({ ...form, discountType: type })}
                    className={
                      "flex-1 rounded border px-3 py-1.5 text-[13px] font-medium " +
                      (form.discountType === type
                        ? "border-stone-900 bg-stone-900 text-white"
                        : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50")
                    }
                  >
                    {t(`admins.coupons.type.${type}`)}
                  </button>
                ))}
              </div>
            </Field>
            {form.discountType === "percent" ? (
              <Field label={t("admins.coupons.field.percentOff")}>
                <Input
                  type="number"
                  value={form.percentOff}
                  onChange={(e) => setForm({ ...form, percentOff: e.target.value })}
                  min={0}
                  max={100}
                />
              </Field>
            ) : (
              <>
                <Field label={t("admins.coupons.field.amountOff")}>
                  <Input
                    type="number"
                    value={form.amountOff}
                    onChange={(e) => setForm({ ...form, amountOff: e.target.value })}
                    min={0}
                  />
                </Field>
                <Field label={t("admins.coupons.field.currency")}>
                  <Input
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value.toLowerCase() })}
                  />
                </Field>
              </>
            )}
            <Field label={t("admins.coupons.field.duration")}>
              <div className="flex gap-2">
                {(["once", "repeating", "forever"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setForm({ ...form, duration: d })}
                    className={
                      "flex-1 rounded border px-2 py-1.5 text-[12px] font-medium " +
                      (form.duration === d
                        ? "border-stone-900 bg-stone-900 text-white"
                        : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50")
                    }
                  >
                    {t(`admins.coupons.duration.${d}`)}
                  </button>
                ))}
              </div>
            </Field>
            {form.duration === "repeating" ? (
              <Field label={t("admins.coupons.field.durationMonths")}>
                <Input
                  type="number"
                  value={form.durationInMonths}
                  onChange={(e) => setForm({ ...form, durationInMonths: e.target.value })}
                  min={1}
                />
              </Field>
            ) : null}
            <Field label={t("admins.coupons.field.maxRedemptions")}>
              <Input
                type="number"
                value={form.maxRedemptions}
                onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
                min={1}
                placeholder={t("admins.coupons.unlimited")}
              />
            </Field>
            <Field label={t("admins.coupons.field.redeemBy")}>
              <Input
                type="date"
                value={form.redeemBy}
                onChange={(e) => setForm({ ...form, redeemBy: e.target.value })}
              />
            </Field>
            <Field label={t("admins.coupons.field.promoCode")}>
              <Input
                value={form.promoCode}
                onChange={(e) => setForm({ ...form, promoCode: e.target.value.toUpperCase() })}
                placeholder="MERCHIVA10"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowForm(false)} disabled={submitting}>
              {t("admins.coupons.cancel")}
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? t("admins.coupons.creating") : t("admins.coupons.create")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded border border-stone-200 bg-white">
        <table className="min-w-full divide-y divide-stone-200 text-[13px]">
          <thead className="bg-stone-50">
            <tr>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-stone-600">
                {t("admins.coupons.col.name")}
              </th>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-stone-600">
                {t("admins.coupons.col.discount")}
              </th>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-stone-600">
                {t("admins.coupons.col.duration")}
              </th>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-stone-600">
                {t("admins.coupons.col.redemptions")}
              </th>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-stone-600">
                {t("admins.coupons.col.promoCodes")}
              </th>
              <th className="px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-stone-600">
                {t("admins.coupons.col.redeemBy")}
              </th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center font-mono text-[12px] text-stone-500">
                  {t("admins.coupons.loading")}
                </td>
              </tr>
            ) : coupons.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center font-mono text-[12px] text-stone-500">
                  {t("admins.coupons.empty")}
                </td>
              </tr>
            ) : (
              coupons.map((c) => {
                const matched = promos.filter((p) => p.couponId === c.id);
                return (
                  <tr key={c.id} className="hover:bg-stone-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-stone-900">{c.name ?? c.id}</div>
                      <div className="font-mono text-[11px] text-stone-500">{c.id}</div>
                    </td>
                    <td className="px-3 py-2 font-mono">{formatDiscount(c)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={c.valid ? "default" : "secondary"}>{c.duration}</Badge>
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px]">
                      {c.timesRedeemed}
                      {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      {matched.length === 0 ? (
                        <span className="text-stone-400">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {matched.map((p) => (
                            <code
                              key={p.id}
                              className="rounded bg-stone-100 px-2 py-0.5 font-mono text-[11px] text-stone-900"
                            >
                              {p.code}
                            </code>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px] text-stone-600">
                      {formatDate(c.redeemBy)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => remove(c.id)}>
                        {t("admins.coupons.delete")}
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-mono text-[10.5px] uppercase tracking-wider text-stone-500">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
