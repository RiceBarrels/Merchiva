"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, ChevronDown, ChevronRight, Users, Star, Gift, ShoppingBag, CalendarDays, X, Edit2, Globe } from "lucide-react";
import { cn, uuid } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PageTabs } from "@/components/page-tabs";
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
import { useT } from "@/lib/i18n/context";
import type {
  MembershipTier,
  MembershipPerk,
  SiteCustomer,
  SiteOrder,
  SiteBooking,
} from "@/lib/types";
import { Spinner } from "@/components/ui/loaders/geometric";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field } from "@/components/ui/field";
import { DialogActions } from "@/components/ui/dialog-actions";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Avatar } from "@/components/ui/avatar";
import { Num } from "@/components/ui/num";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PERIOD_KEYS: Record<string, string> = {
  free: "free",
  monthly: "monthly",
  yearly: "yearly",
  "one-time": "oneTime",
};

const PERK_TYPE_KEYS: Record<string, string> = {
  discount: "discount",
  freebie: "freebie",
  coupon: "coupon",
  "points-multiplier": "pointsMultiplier",
  custom: "custom",
};

const STATUS_TONES: Record<string, StatusTone> = {
  pending: "neutral",
  confirmed: "neutral",
  completed: "neutral",
  cancelled: "neutral",
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
  const t = useT();
  const [form, setForm] = useState(initial);
  const f = (k: keyof typeof form, v: unknown) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 bg-background border border-border rounded-lg w-full max-w-sm overflow-y-auto max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background">
          <h2 className="font-semibold text-sm">{t("membership.tierModal.title")}</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-4 space-y-3">
          <Field label={t("membership.tierModal.nameLabel")}>
            <Input value={form.name} onChange={(e) => f("name", e.target.value)} placeholder={t("membership.tierModal.namePlaceholder")} />
          </Field>
          <Field label={t("membership.tierModal.descriptionLabel")}>
            <Textarea value={form.description ?? ""} onChange={(e) => f("description", e.target.value)} rows={2} placeholder={t("membership.tierModal.descriptionPlaceholder")} className="resize-none" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("membership.tierModal.priceLabel")}>
              <Input type="number" min="0" step="0.01" value={form.price} onChange={(e) => f("price", Number(e.target.value))} />
            </Field>
            <Field label={t("membership.tierModal.periodLabel")}>
              <Select value={form.pricePeriod} onValueChange={(v) => f("pricePeriod", v ?? form.pricePeriod)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">{t("membership.periodOption.free")}</SelectItem>
                  <SelectItem value="monthly">{t("membership.periodOption.monthly")}</SelectItem>
                  <SelectItem value="yearly">{t("membership.periodOption.yearly")}</SelectItem>
                  <SelectItem value="one-time">{t("membership.periodOption.oneTime")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("membership.tierModal.colorLabel")}>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.color} onChange={(e) => f("color", e.target.value)} className="h-8 w-10 rounded-lg border border-border cursor-pointer" />
                <Input value={form.color} onChange={(e) => f("color", e.target.value)} className="flex-1 font-mono text-xs" />
              </div>
            </Field>
            <Field label={t("membership.tierModal.iconLabel")}>
              <Input value={form.icon} onChange={(e) => f("icon", e.target.value)} placeholder={t("membership.tierModal.iconPlaceholder")} />
            </Field>
          </div>
          <Label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={form.isDefault} onCheckedChange={(c) => f("isDefault", c === true)} />
            <span className="text-sm">{t("membership.tierModal.defaultCheckbox")}</span>
          </Label>
        </div>
        <DialogActions
          className="px-4 pb-4"
          divider={false}
          onCancel={onClose}
          onConfirm={() => { onSave(form); onClose(); }}
          disabled={!form.name.trim()}
          cancelLabel={t("membership.modal.cancel")}
          confirmLabel={t("membership.modal.save")}
        />
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
  const t = useT();
  const [form, setForm] = useState(initial);
  const f = (k: keyof typeof form, v: unknown) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 bg-background border border-border rounded-lg w-full max-w-sm overflow-y-auto max-h-[85vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background">
          <h2 className="font-semibold text-sm">{t("membership.perkModal.title")}</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-4 space-y-3">
          <Field label={t("membership.perkModal.typeLabel")}>
            <Select value={form.type} onValueChange={(v) => f("type", v ?? form.type)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PERK_TYPE_KEYS).map(([v, k]) => (
                  <SelectItem key={v} value={v}>{t(`membership.perkType.${k}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("membership.perkModal.nameLabel")}>
            <Input value={form.name} onChange={(e) => f("name", e.target.value)} placeholder={t("membership.perkModal.namePlaceholder")} />
          </Field>
          <Field label={t("membership.perkModal.descriptionLabel")}>
            <Textarea value={form.description ?? ""} onChange={(e) => f("description", e.target.value || null)} rows={2} className="resize-none" />
          </Field>

          {(form.type === "discount" || form.type === "coupon") && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("membership.perkModal.discountValueLabel")}>
                  <Input type="number" min="0" value={form.discountValue ?? ""} onChange={(e) => f("discountValue", e.target.value ? Number(e.target.value) : null)} />
                </Field>
                <Field label={t("membership.perkModal.discountTypeLabel")}>
                  <Select value={form.discountType ?? "percent"} onValueChange={(v) => f("discountType", v ?? form.discountType)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">{t("membership.perkModal.percentOption")}</SelectItem>
                      <SelectItem value="fixed">{t("membership.perkModal.fixedOption")}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              {form.type === "coupon" && (
                <Field label={t("membership.perkModal.couponCodeLabel")}>
                  <Input value={form.couponCode ?? ""} onChange={(e) => f("couponCode", e.target.value || null)} placeholder={t("membership.perkModal.couponCodePlaceholder")} className="font-mono uppercase" />
                </Field>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("membership.perkModal.cooldownLabel")}>
              <Input type="number" min="0" value={form.cooldownHours ?? ""} onChange={(e) => f("cooldownHours", e.target.value ? Number(e.target.value) : null)} placeholder={t("membership.perkModal.cooldownPlaceholder")} />
            </Field>
            <Field label={t("membership.perkModal.minPurchaseLabel")}>
              <Input type="number" min="0" step="0.01" value={form.minPurchase ?? ""} onChange={(e) => f("minPurchase", e.target.value ? Number(e.target.value) : null)} />
            </Field>
          </div>

          <Label className="flex items-center gap-2 cursor-pointer">
            <Checkbox checked={form.active} onCheckedChange={(c) => f("active", c === true)} />
            <span className="text-sm">{t("membership.perkModal.activeCheckbox")}</span>
          </Label>
        </div>
        <DialogActions
          className="px-4 pb-4"
          divider={false}
          onCancel={onClose}
          onConfirm={() => { onSave(form); onClose(); }}
          disabled={!form.name.trim()}
          cancelLabel={t("membership.modal.cancel")}
          confirmLabel={t("membership.modal.save")}
        />
      </div>
    </div>
  );
}

// ─── Tiers tab ────────────────────────────────────────────────────────────────

function TiersTab({ siteId }: { siteId: string }) {
  const t = useT();
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
      setTiers((prev) => prev.map((tier) => tier.id === editTier.id ? { ...tier, ...data } : tier));
      setEditTier(null);
    } else {
      const tierId = uuid();
      await createTier(siteId, data).catch(console.error);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setTiers((prev) => [...prev, { id: tierId, siteId, ...data } as any]);
    }
  };

  const handleDeleteTier = async (id: string) => {
    if (!confirm(t("membership.tiers.confirmDelete"))) return;
    await deleteTier(id).catch(console.error);
    setTiers((prev) => prev.filter((tier) => tier.id !== id));
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
      const perkId = uuid();
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
    return <div className="flex justify-center py-8"><Spinner size={16} className="text-muted-foreground" /></div>;
  }

  return (
    <div>
      <SectionHeader title={t("membership.tiers.sectionTitle")}>
        <Button size="sm" onClick={() => { setEditTier(null); setShowTierModal(true); }}>
          <Plus className="h-3.5 w-3.5" /> {t("membership.tiers.addTier")}
        </Button>
      </SectionHeader>

      {tiers.length === 0 && (
        <EmptyState icon={Star} description={t("membership.tiers.empty")} />
      )}

      <div className="space-y-2">
        {tiers.map((tier) => (
          <div key={tier.id} className="rounded border border-border overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <Button variant="ghost" size="icon-xs" onClick={() => toggleExpand(tier.id)} className="text-muted-foreground flex-shrink-0">
                {expanded === tier.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
              <span style={{ color: tier.color }} className="text-xl flex-shrink-0">{tier.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{tier.name}</span>
                  {tier.isDefault && <StatusBadge size="xs">{t("membership.tiers.defaultBadge")}</StatusBadge>}
                </div>
                {tier.description && <p className="text-xs text-muted-foreground truncate">{tier.description}</p>}
              </div>
              <span className="text-sm font-mono font-semibold tabular-nums flex-shrink-0" style={{ color: tier.color }}>
                {tier.price === 0 ? t("membership.tiers.freePrice") : `$${tier.price}${PERIOD_KEYS[tier.pricePeriod] ? t(`membership.periodSuffix.${PERIOD_KEYS[tier.pricePeriod]}`) : ""}`}
              </span>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground" onClick={() => { setEditTier(tier); setShowTierModal(true); }}>
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDeleteTier(tier.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {expanded === tier.id && (
              <div className="border-t border-border bg-muted/30 px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                  <Eyebrow as="span">{t("membership.tiers.perksTitle")}</Eyebrow>
                  <Button size="xs" variant="outline" onClick={() => { setEditPerk(null); setShowPerkModal(tier.id); }}>
                    <Plus className="h-3 w-3" /> {t("membership.tiers.addPerk")}
                  </Button>
                </div>
                {(perksMap[tier.id] ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">{t("membership.tiers.noPerks")}</p>
                ) : (
                  <div className="space-y-1.5">
                    {(perksMap[tier.id] ?? []).map((perk) => (
                      <div key={perk.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border">
                        <Gift className={cn("h-3.5 w-3.5 flex-shrink-0", perk.active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium">{perk.name}</p>
                          <p className="text-[11px] text-muted-foreground">{PERK_TYPE_KEYS[perk.type] ? t(`membership.perkType.${PERK_TYPE_KEYS[perk.type]}`) : perk.type}{perk.cooldownHours ? ` · ${perk.cooldownHours}${t("membership.tiers.cooldownSuffix")}` : ""}</p>
                        </div>
                        <Button variant="ghost" size="icon-xs" className="text-muted-foreground flex-shrink-0" onClick={() => { setEditPerk({ tierId: tier.id, perk }); setShowPerkModal(tier.id); }}>
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex-shrink-0" onClick={() => handleDeletePerk(tier.id, perk.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
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
  const t = useT();
  const [customers, setCustomers] = useState<SiteCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSiteCustomers(siteId)
      .then(setCustomers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) return <div className="flex justify-center py-8"><Spinner size={16} className="text-muted-foreground" /></div>;

  return (
    <div>
      <SectionHeader title={`${t("membership.customers.sectionTitle")} (${customers.length})`} />
      {customers.length === 0 ? (
        <EmptyState icon={Users} description={t("membership.customers.empty")} />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
         <Table>
           <TableHeader>
             <TableRow>
               <TableHead>{t("membership.customers.headerCustomer")}</TableHead>
               <TableHead>{t("membership.customers.headerEmail")}</TableHead>
               <TableHead>{t("membership.customers.headerJoined")}</TableHead>
             </TableRow>
           </TableHeader>
           <TableBody>
             {customers.map((c) => (
               <TableRow key={c.id}>
                 <TableCell>
                   <div className="flex items-center gap-2">
                     <Avatar name={c.name ?? c.email} size="sm" />
                     <span className="font-medium">{c.name ?? "—"}</span>
                   </div>
                 </TableCell>
                 <TableCell className="text-muted-foreground font-mono text-xs">{c.email}</TableCell>
                 <TableCell className="text-muted-foreground text-xs">{new Date(c.createdAt).toLocaleDateString()}</TableCell>
               </TableRow>
             ))}
           </TableBody>
         </Table>
       </div>
      )}
    </div>
  );
}

// ─── Orders tab ───────────────────────────────────────────────────────────────

function OrdersTab({ siteId }: { siteId: string }) {
  const t = useT();
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

  if (loading) return <div className="flex justify-center py-8"><Spinner size={16} className="text-muted-foreground" /></div>;

  return (
    <div>
      <SectionHeader title={`${t("membership.orders.sectionTitle")} (${orders.length})`} />
      {orders.length === 0 ? (
        <EmptyState icon={ShoppingBag} description={t("membership.orders.empty")} />
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <div key={order.id} className="rounded border border-border p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-medium text-sm">{order.customerName ?? t("membership.orders.guest")}</p>
                  <p className="text-xs text-muted-foreground font-mono">{order.customerEmail ?? "—"}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p><Num value={`$${order.total.toFixed(2)}`} className="font-semibold" /></p>
                  <p className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge tone={STATUS_TONES[order.status] ?? "neutral"} className={order.status === "cancelled" ? "line-through" : undefined}>{t(`status.${order.status}`)}</StatusBadge>
                {(["pending", "confirmed", "completed", "cancelled"] as SiteOrder["status"][]).map((s) =>
                  s !== order.status ? (
                    <Button key={s} size="xs" variant="outline" onClick={() => handleStatus(order.id, s)}>{t(`status.${s}`)}</Button>
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
  const t = useT();
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

  if (loading) return <div className="flex justify-center py-8"><Spinner size={16} className="text-muted-foreground" /></div>;

  return (
    <div>
      <SectionHeader title={`${t("membership.bookings.sectionTitle")} (${bookings.length})`} />
      {bookings.length === 0 ? (
        <EmptyState icon={CalendarDays} description={t("membership.bookings.empty")} />
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
                  <p className="text-xs text-muted-foreground">{t("membership.bookings.partyOf")} {booking.partySize}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge tone={STATUS_TONES[booking.status] ?? "neutral"} className={booking.status === "cancelled" ? "line-through" : undefined}>{t(`status.${booking.status}`)}</StatusBadge>
                {(["pending", "confirmed", "cancelled"] as SiteBooking["status"][]).map((s) =>
                  s !== booking.status ? (
                    <Button key={s} size="xs" variant="outline" onClick={() => handleStatus(booking.id, s)}>{t(`status.${s}`)}</Button>
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
  const t = useT();
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

  const websiteTabs = [
    { label: t("nav.website"), href: "/manager/builder" },
    { label: t("nav.membership"), href: "/manager/membership" },
    { label: t("nav.bookings"), href: "/manager/bookings" },
    { label: t("nav.reviews"), href: "/manager/reviews" },
  ];

  if (loading) {
    return (
      <div>
        <PageHeader title={t("membership.header.title")} />
        <PageTabs tabs={websiteTabs} />
        <div className="flex items-center justify-center h-64">
          <Spinner size={16} className="text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!siteId) {
    return (
      <div>
        <PageHeader title={t("membership.header.title")} />
        <PageTabs tabs={websiteTabs} />
        <EmptyState
          className="h-64"
          icon={Globe}
          title={t("membership.noSite.title")}
          description={t("membership.noSite.desc")}
          action={
            <Link href="/manager/builder" className={buttonVariants({ size: "sm" })}>
              {t("membership.noSite.button")}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <PageHeader
        title={t("membership.header.title")}
        right={
          <Link href={`/manager/builder/${siteId}`} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <Globe className="h-3.5 w-3.5" />
            {siteName}
          </Link>
        }
      />
      <PageTabs tabs={[
        { label: t("nav.website"), href: "/manager/builder" },
        { label: t("nav.membership"), href: "/manager/membership" },
        { label: t("nav.bookings"), href: "/manager/bookings" },
        { label: t("nav.reviews"), href: "/manager/reviews" },
      ]} />

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border bg-muted/20">
        <SegmentedControl
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: "tiers", label: t("membership.header.tabTiers"), icon: Star },
            { value: "customers", label: t("membership.header.tabCustomers"), icon: Users },
            { value: "orders", label: t("membership.header.tabOrders"), icon: ShoppingBag },
            { value: "bookings", label: t("membership.header.tabBookings"), icon: CalendarDays },
          ]}
        />
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
