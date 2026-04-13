"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Users,
  Star,
  Gift,
  ShoppingBag,
  CalendarDays,
  X,
  Edit2,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createTier, updateTier, deleteTier, createPerk, updatePerk, deletePerk, updateOrderStatus, updateBookingStatus } from "@/lib/spacetimedb/actions";
import {
  getMembershipTiers,
  getTierPerks,
  getSiteCustomers,
  getOrgOrders,
  getOrgBookings,
} from "@/lib/db/membership";
import { getSites } from "@/lib/db/sites";
import { usePermissions } from "@/lib/context/permissions";
import type {
  MembershipTier,
  MembershipPerk,
  SiteCustomer,
  SiteOrder,
  SiteBooking,
} from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<string, string> = {
  free: "Free",
  monthly: "/mo",
  yearly: "/yr",
  "one-time": " once",
};

const PERK_TYPE_LABELS: Record<string, string> = {
  discount: "Discount",
  freebie: "Freebie",
  coupon: "Coupon Code",
  "points-multiplier": "Points Multiplier",
  custom: "Custom",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const emptyTier = (): Omit<MembershipTier, "id" | "siteId" | "sortOrder" | "createdAt"> => ({
  name: "",
  description: "",
  price: 0,
  pricePeriod: "free",
  color: "#3b82f6",
  icon: "⭐",
  isDefault: false,
});

const emptyPerk = (): Omit<MembershipPerk, "id" | "tierId" | "sortOrder"> => ({
  type: "discount",
  name: "",
  description: "",
  couponCode: null,
  discountValue: null,
  discountType: "percent",
  cooldownHours: null,
  frequency: null,
  minPurchase: null,
  validDays: null,
  validHours: null,
  active: true,
});

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border mb-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-xs font-medium rounded transition-colors",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}

// ─── Tier form modal ──────────────────────────────────────────────────────────

function TierModal({
  initial,
  onSave,
  onClose,
}: {
  initial: Omit<MembershipTier, "id" | "siteId" | "sortOrder" | "createdAt">;
  onSave: (data: typeof initial) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const f = (k: keyof typeof form, v: unknown) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 bg-background border border-border rounded-sm w-full max-w-sm shadow-lg overflow-y-auto max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background">
          <h2 className="font-semibold text-sm">Membership Tier</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">Name</label>
            <input value={form.name} onChange={(e) => f("name", e.target.value)} placeholder="Gold Member" className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">Description</label>
            <textarea value={form.description ?? ""} onChange={(e) => f("description", e.target.value)} rows={2} placeholder="Unlock exclusive perks…" className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Price</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => f("price", Number(e.target.value))} className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Period</label>
              <select value={form.pricePeriod} onChange={(e) => f("pricePeriod", e.target.value)} className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring">
                <option value="free">Free</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="one-time">One-time</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.color} onChange={(e) => f("color", e.target.value)} className="h-8 w-10 rounded border border-border cursor-pointer" />
                <input value={form.color} onChange={(e) => f("color", e.target.value)} className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs font-mono outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Icon (emoji)</label>
              <input value={form.icon} onChange={(e) => f("icon", e.target.value)} placeholder="⭐" className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => f("isDefault", e.target.checked)} className="rounded" />
            <span className="text-sm">Default tier (auto-assigned to new customers)</span>
          </label>
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <button onClick={onClose} className="flex-1 rounded border border-border px-3 py-2 text-sm hover:bg-muted">Cancel</button>
          <button
            onClick={() => { onSave(form); onClose(); }}
            disabled={!form.name.trim()}
            className="flex-1 rounded bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Perk form modal ──────────────────────────────────────────────────────────

function PerkModal({
  initial,
  onSave,
  onClose,
}: {
  initial: Omit<MembershipPerk, "id" | "tierId" | "sortOrder">;
  onSave: (data: typeof initial) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const f = (k: keyof typeof form, v: unknown) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 bg-background border border-border rounded-sm w-full max-w-sm shadow-lg overflow-y-auto max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background">
          <h2 className="font-semibold text-sm">Membership Perk</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">Type</label>
            <select value={form.type} onChange={(e) => f("type", e.target.value)} className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring">
              {Object.entries(PERK_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">Name</label>
            <input value={form.name} onChange={(e) => f("name", e.target.value)} placeholder="Free drink every 3 hours" className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">Description (optional)</label>
            <textarea value={form.description ?? ""} onChange={(e) => f("description", e.target.value || null)} rows={2} className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring resize-none" />
          </div>

          {(form.type === "discount" || form.type === "coupon") && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Discount value</label>
                  <input type="number" min="0" value={form.discountValue ?? ""} onChange={(e) => f("discountValue", e.target.value ? Number(e.target.value) : null)} className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
                </div>
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Type</label>
                  <select value={form.discountType ?? "percent"} onChange={(e) => f("discountType", e.target.value)} className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring">
                    <option value="percent">Percent (%)</option>
                    <option value="fixed">Fixed ($)</option>
                  </select>
                </div>
              </div>
              {form.type === "coupon" && (
                <div>
                  <label className="block text-[11px] text-muted-foreground mb-1">Coupon code</label>
                  <input value={form.couponCode ?? ""} onChange={(e) => f("couponCode", e.target.value || null)} placeholder="MEMBER10" className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm font-mono outline-none focus:ring-1 focus:ring-ring uppercase" />
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Cooldown (hours)</label>
              <input type="number" min="0" value={form.cooldownHours ?? ""} onChange={(e) => f("cooldownHours", e.target.value ? Number(e.target.value) : null)} placeholder="e.g. 3" className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-[11px] text-muted-foreground mb-1">Min. purchase ($)</label>
              <input type="number" min="0" step="0.01" value={form.minPurchase ?? ""} onChange={(e) => f("minPurchase", e.target.value ? Number(e.target.value) : null)} className="w-full rounded border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={(e) => f("active", e.target.checked)} className="rounded" />
            <span className="text-sm">Active</span>
          </label>
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <button onClick={onClose} className="flex-1 rounded border border-border px-3 py-2 text-sm hover:bg-muted">Cancel</button>
          <button
            onClick={() => { onSave(form); onClose(); }}
            disabled={!form.name.trim()}
            className="flex-1 rounded bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tiers tab ────────────────────────────────────────────────────────────────

function TiersTab({ siteId }: { siteId: string }) {
  const [tiers, setTiers] = useState<MembershipTier[]>([]);
  const [perksMap, setPerksMap] = useState<Record<string, MembershipPerk[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTierModal, setShowTierModal] = useState(false);
  const [editTier, setEditTier] = useState<MembershipTier | null>(null);
  const [showPerkModal, setShowPerkModal] = useState<string | null>(null);
  const [editPerk, setEditPerk] = useState<{ tierId: string; perk: MembershipPerk } | null>(null);

  useEffect(() => {
    getMembershipTiers(siteId)
      .then(setTiers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId]);

  const loadPerks = async (tierId: string) => {
    if (perksMap[tierId]) return;
    const perks = await getTierPerks(tierId).catch(() => []);
    setPerksMap((prev) => ({ ...prev, [tierId]: perks }));
  };

  const toggleExpand = (tierId: string) => {
    const next = expanded === tierId ? null : tierId;
    setExpanded(next);
    if (next) loadPerks(next);
  };

  const handleSaveTier = async (data: ReturnType<typeof emptyTier>) => {
    if (editTier) {
      await updateTier(editTier.id, data).catch(console.error);
      setTiers((prev) => prev.map((t) => t.id === editTier.id ? { ...t, ...data } : t));
      setEditTier(null);
    } else {
      const tierId = crypto.randomUUID();
      await createTier(siteId, data).catch(console.error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTiers((prev) => [...prev, { id: tierId, siteId, ...data } as any]);
    }
  };

  const handleDeleteTier = async (id: string) => {
    if (!confirm("Delete this tier and all its perks?")) return;
    await deleteTier(id).catch(console.error);
    setTiers((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSavePerk = async (tierId: string, data: ReturnType<typeof emptyPerk>) => {
    if (editPerk) {
      await updatePerk(editPerk.perk.id, data).catch(console.error);
      setPerksMap((prev) => ({
        ...prev,
        [tierId]: (prev[tierId] ?? []).map((p) =>
          p.id === editPerk.perk.id ? { ...p, ...data } : p
        ),
      }));
      setEditPerk(null);
    } else {
      const perkId = crypto.randomUUID();
      await createPerk({ tierId, ...data }).catch(console.error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPerksMap((prev) => ({ ...prev, [tierId]: [...(prev[tierId] ?? []), { id: perkId, tierId, ...data } as any] }));
    }
  };

  const handleDeletePerk = async (tierId: string, perkId: string) => {
    await deletePerk(perkId).catch(console.error);
    setPerksMap((prev) => ({
      ...prev,
      [tierId]: (prev[tierId] ?? []).filter((p) => p.id !== perkId),
    }));
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <SectionHeader title="Membership Tiers">
        <button
          onClick={() => { setEditTier(null); setShowTierModal(true); }}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded bg-foreground text-background hover:bg-foreground/90"
        >
          <Plus className="h-3.5 w-3.5" /> Add Tier
        </button>
      </SectionHeader>

      {tiers.length === 0 && (
        <div className="rounded border border-dashed border-border py-12 text-center text-muted-foreground text-sm">
          No tiers yet. Create your first membership tier.
        </div>
      )}

      <div className="space-y-2">
        {tiers.map((tier) => (
          <div key={tier.id} className="rounded border border-border overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => toggleExpand(tier.id)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                {expanded === tier.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <span style={{ color: tier.color }} className="text-xl flex-shrink-0">{tier.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{tier.name}</span>
                  {tier.isDefault && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">Default</span>}
                </div>
                {tier.description && <p className="text-xs text-muted-foreground truncate">{tier.description}</p>}
              </div>
              <span className="text-sm font-mono font-semibold flex-shrink-0" style={{ color: tier.color }}>
                {tier.price === 0 ? "Free" : `$${tier.price}${PERIOD_LABELS[tier.pricePeriod] ?? ""}`}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => { setEditTier(tier); setShowTierModal(true); }}
                  className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteTier(tier.id)}
                  className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {expanded === tier.id && (
              <div className="border-t border-border bg-muted/30 px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Perks</span>
                  <button
                    onClick={() => { setEditPerk(null); setShowPerkModal(tier.id); }}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-border hover:bg-background"
                  >
                    <Plus className="h-3 w-3" /> Add Perk
                  </button>
                </div>
                {(perksMap[tier.id] ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">No perks yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {(perksMap[tier.id] ?? []).map((perk) => (
                      <div key={perk.id} className="flex items-center gap-2 px-3 py-2 rounded bg-background border border-border">
                        <Gift className={cn("h-3.5 w-3.5 flex-shrink-0", perk.active ? "text-green-600" : "text-muted-foreground")} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{perk.name}</p>
                          <p className="text-[11px] text-muted-foreground">{PERK_TYPE_LABELS[perk.type]}{perk.cooldownHours ? ` · ${perk.cooldownHours}h cooldown` : ""}</p>
                        </div>
                        <button
                          onClick={() => { setEditPerk({ tierId: tier.id, perk }); setShowPerkModal(tier.id); }}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground flex-shrink-0"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDeletePerk(tier.id, perk.id)}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex-shrink-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {showTierModal && (
        <TierModal
          initial={editTier ? {
            name: editTier.name,
            description: editTier.description,
            price: editTier.price,
            pricePeriod: editTier.pricePeriod,
            color: editTier.color,
            icon: editTier.icon,
            isDefault: editTier.isDefault,
          } : emptyTier()}
          onSave={handleSaveTier}
          onClose={() => { setShowTierModal(false); setEditTier(null); }}
        />
      )}

      {showPerkModal && (
        <PerkModal
          initial={editPerk ? {
            type: editPerk.perk.type,
            name: editPerk.perk.name,
            description: editPerk.perk.description,
            couponCode: editPerk.perk.couponCode,
            discountValue: editPerk.perk.discountValue,
            discountType: editPerk.perk.discountType,
            cooldownHours: editPerk.perk.cooldownHours,
            frequency: editPerk.perk.frequency,
            minPurchase: editPerk.perk.minPurchase,
            validDays: editPerk.perk.validDays,
            validHours: editPerk.perk.validHours,
            active: editPerk.perk.active,
          } : emptyPerk()}
          onSave={(data) => handleSavePerk(showPerkModal, data)}
          onClose={() => { setShowPerkModal(null); setEditPerk(null); }}
        />
      )}
    </div>
  );
}

// ─── Customers tab ────────────────────────────────────────────────────────────

function CustomersTab({ siteId }: { siteId: string }) {
  const [customers, setCustomers] = useState<SiteCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSiteCustomers(siteId)
      .then(setCustomers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;

  return (
    <div>
      <SectionHeader title={`Customers (${customers.length})`} />
      {customers.length === 0 ? (
        <div className="rounded border border-dashed border-border py-12 text-center text-muted-foreground text-sm">
          No customers yet. They&apos;ll appear here once they register on your site.
        </div>
      ) : (
        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Email</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Joined</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => (
                <tr key={c.id} className={cn("border-b border-border last:border-0", i % 2 === 0 ? "" : "bg-muted/10")}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {(c.name ?? c.email)[0].toUpperCase()}
                      </div>
                      <span className="font-medium">{c.name ?? "—"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{c.email}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Orders tab ───────────────────────────────────────────────────────────────

function OrdersTab({ siteId }: { siteId: string }) {
  const [orders, setOrders] = useState<SiteOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOrgOrders(siteId)
      .then(setOrders)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId]);

  const handleStatus = async (id: string, status: SiteOrder["status"]) => {
    await updateOrderStatus(id, status).catch(console.error);
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status } : o));
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;

  return (
    <div>
      <SectionHeader title={`Orders (${orders.length})`} />
      {orders.length === 0 ? (
        <div className="rounded border border-dashed border-border py-12 text-center text-muted-foreground text-sm">
          No orders yet.
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <div key={order.id} className="rounded border border-border p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-medium text-sm">{order.customerName ?? "Guest"}</p>
                  <p className="text-xs text-muted-foreground font-mono">{order.customerEmail ?? "—"}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-semibold">${order.total.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("px-2 py-0.5 rounded text-[11px] font-medium", STATUS_COLORS[order.status])}>{order.status}</span>
                {(["pending", "confirmed", "completed", "cancelled"] as SiteOrder["status"][]).map((s) =>
                  s !== order.status ? (
                    <button key={s} onClick={() => handleStatus(order.id, s)} className="px-2 py-0.5 rounded text-[11px] border border-border hover:bg-muted">{s}</button>
                  ) : null
                )}
              </div>
              {order.items.length > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {order.items.map((item, i) => (
                    <span key={i}>{item.quantity}× {item.name}{i < order.items.length - 1 ? ", " : ""}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Bookings tab ─────────────────────────────────────────────────────────────

function BookingsTab({ siteId }: { siteId: string }) {
  const [bookings, setBookings] = useState<SiteBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOrgBookings(siteId)
      .then(setBookings)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId]);

  const handleStatus = async (id: string, status: SiteBooking["status"]) => {
    await updateBookingStatus(id, status).catch(console.error);
    setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status } : b));
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;

  return (
    <div>
      <SectionHeader title={`Bookings (${bookings.length})`} />
      {bookings.length === 0 ? (
        <div className="rounded border border-dashed border-border py-12 text-center text-muted-foreground text-sm">
          No bookings yet.
        </div>
      ) : (
        <div className="space-y-2">
          {bookings.map((booking) => (
            <div key={booking.id} className="rounded border border-border p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-medium text-sm">{booking.name}</p>
                  <p className="text-xs text-muted-foreground">{booking.email ?? booking.phone ?? "—"}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-semibold text-sm">{booking.date} {booking.time}</p>
                  <p className="text-xs text-muted-foreground">Party of {booking.partySize}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn("px-2 py-0.5 rounded text-[11px] font-medium", STATUS_COLORS[booking.status])}>{booking.status}</span>
                {(["pending", "confirmed", "cancelled"] as SiteBooking["status"][]).map((s) =>
                  s !== booking.status ? (
                    <button key={s} onClick={() => handleStatus(booking.id, s)} className="px-2 py-0.5 rounded text-[11px] border border-border hover:bg-muted">{s}</button>
                  ) : null
                )}
              </div>
              {booking.notes && <p className="mt-1.5 text-xs text-muted-foreground">{booking.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MembershipPage() {
  const { currentOrg } = usePermissions();
  const [siteId, setSiteId] = useState<string | null>(null);
  const [siteName, setSiteName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"tiers" | "customers" | "orders" | "bookings">("tiers");

  useEffect(() => {
    if (!currentOrg?.id) return;
    getSites(currentOrg.id)
      .then((sites) => {
        if (sites.length > 0) {
          setSiteId(sites[0].id);
          setSiteName(sites[0].name);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentOrg?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!siteId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center px-4">
        <Globe className="h-8 w-8 text-muted-foreground" />
        <div>
          <p className="font-semibold text-sm">No website yet</p>
          <p className="text-muted-foreground text-sm mt-1">Create a website first to manage memberships.</p>
        </div>
        <Link
          href="/builder"
          className="px-4 py-2 rounded bg-foreground text-background text-sm font-medium hover:bg-foreground/90"
        >
          Go to Website Builder
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-12 border-b border-border shrink-0 bg-background">
        <span className="text-sm font-semibold">Membership &amp; Commerce</span>
        <Link href={`/builder/${siteId}`} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <Globe className="h-3.5 w-3.5" />
          {siteName}
        </Link>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-muted/20">
        <TabBtn active={tab === "tiers"} onClick={() => setTab("tiers")}>
          <Star className="h-3.5 w-3.5 inline mr-1" />Tiers &amp; Perks
        </TabBtn>
        <TabBtn active={tab === "customers"} onClick={() => setTab("customers")}>
          <Users className="h-3.5 w-3.5 inline mr-1" />Customers
        </TabBtn>
        <TabBtn active={tab === "orders"} onClick={() => setTab("orders")}>
          <ShoppingBag className="h-3.5 w-3.5 inline mr-1" />Orders
        </TabBtn>
        <TabBtn active={tab === "bookings"} onClick={() => setTab("bookings")}>
          <CalendarDays className="h-3.5 w-3.5 inline mr-1" />Bookings
        </TabBtn>
      </div>

      {/* Content */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        {tab === "tiers"     && <TiersTab siteId={siteId} />}
        {tab === "customers" && <CustomersTab siteId={siteId} />}
        {tab === "orders"    && <OrdersTab siteId={siteId} />}
        {tab === "bookings"  && <BookingsTab siteId={siteId} />}
      </main>
    </div>
  );
}
