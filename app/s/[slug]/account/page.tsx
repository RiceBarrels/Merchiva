"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, ShoppingBag, CalendarDays, Star, Gift, LogOut } from "lucide-react";
import { claimPerk } from "@/lib/spacetimedb/actions";
import { getCustomer, getCustomerOrders, getCustomerBookings, getCustomerMembership, canClaimPerk } from "@/lib/db/membership";
import type { SiteCustomer, SiteOrder, SiteBooking, MembershipTier, MembershipPerk } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/context";

// ─── Session helpers ──────────────────────────────────────────────────────────

function sessionKey(slug: string) { return `site_session_${slug}`; }

function loadSession(slug: string): SiteCustomer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(sessionKey(slug));
    return raw ? (JSON.parse(raw) as SiteCustomer) : null;
  } catch {
    return null;
  }
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  confirmed: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-xs font-medium rounded transition-colors",
        active ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
      )}
    >
      {children}
    </button>
  );
}

// ─── Orders tab ───────────────────────────────────────────────────────────────

function OrdersTab({ customerId }: { customerId: string }) {
  const t = useT();
  const [orders, setOrders] = useState<SiteOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCustomerOrders(customerId)
      .then(setOrders)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>;

  if (!orders.length) {
    return <p className="text-center py-10 text-sm text-gray-500">{t("storefront.account.noOrders")}</p>;
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => (
        <div key={order.id} className="rounded border border-gray-200 p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <p className="font-semibold text-sm">${order.total.toFixed(2)}</p>
              <p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</p>
            </div>
            <span className={cn("px-2 py-0.5 rounded text-[11px] font-medium", STATUS_PILL[order.status])}>{t(`status.${order.status}`)}</span>
          </div>
          {order.items.length > 0 && (
            <p className="text-xs text-gray-500">{order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Bookings tab ─────────────────────────────────────────────────────────────

function BookingsTab({ customerId }: { customerId: string }) {
  const t = useT();
  const [bookings, setBookings] = useState<SiteBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCustomerBookings(customerId)
      .then(setBookings)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>;

  if (!bookings.length) {
    return <p className="text-center py-10 text-sm text-gray-500">{t("storefront.account.noBookings")}</p>;
  }

  return (
    <div className="space-y-3">
      {bookings.map((b) => (
        <div key={b.id} className="rounded border border-gray-200 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-sm">{b.date} at {b.time}</p>
              <p className="text-xs text-gray-500">{t("storefront.account.partyOf")} {b.partySize}</p>
              {b.notes && <p className="text-xs text-gray-400 mt-0.5">{b.notes}</p>}
            </div>
            <span className={cn("px-2 py-0.5 rounded text-[11px] font-medium", STATUS_PILL[b.status])}>{t(`status.${b.status}`)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Membership tab ───────────────────────────────────────────────────────────

function MembershipTab({ customerId, siteId }: { customerId: string; siteId: string }) {
  const t = useT();
  const [tier, setTier] = useState<MembershipTier | null>(null);
  const [perks, setPerks] = useState<MembershipPerk[]>([]);
  const [points, setPoints] = useState(0);
  const [perkStatus, setPerkStatus] = useState<Record<string, { canClaim: boolean; nextClaimAt: Date | null }>>({});
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCustomerMembership(customerId, siteId)
      .then(async ({ tier, perks, points }) => {
        setTier(tier);
        setPerks(perks);
        setPoints(points);
        // Load claim availability
        const statuses = await Promise.all(
          perks.map((p) => canClaimPerk(customerId, p.id).then((s) => [p.id, s] as const))
        );
        setPerkStatus(Object.fromEntries(statuses));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [customerId, siteId]);

  const handleClaim = async (perkId: string) => {
    setClaiming(perkId);
    try {
      await claimPerk({ customerId, perkId });
      setClaimed((prev) => ({ ...prev, [perkId]: t("storefront.account.claimed") }));
      setPerkStatus((prev) => ({ ...prev, [perkId]: { canClaim: false, nextClaimAt: null } }));
    } catch (err) {
      console.error("Claim failed:", err);
    } finally {
      setClaiming(null);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>;

  if (!tier) {
    return (
      <div className="text-center py-10">
        <Star className="h-8 w-8 mx-auto text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">{t("storefront.account.noMembership")}</p>
        <p className="text-xs text-gray-400 mt-1">{t("storefront.account.askStaff")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tier card */}
      <div className="rounded border-2 p-4" style={{ borderColor: tier.color }}>
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl">{tier.icon}</span>
          <div>
            <p className="font-bold text-base" style={{ color: tier.color }}>{tier.name}</p>
            {tier.description && <p className="text-xs text-gray-500">{tier.description}</p>}
          </div>
        </div>
        <div className="rounded px-3 py-2 flex justify-between items-center" style={{ background: `${tier.color}15`, border: `1px solid ${tier.color}30` }}>
          <span className="text-sm font-medium">{t("storefront.account.pointsBalance")}</span>
          <span className="font-mono font-bold text-lg" style={{ color: tier.color }}>{points}</span>
        </div>
      </div>

      {/* Perks */}
      {perks.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">{t("storefront.account.yourPerks")}</p>
          <div className="space-y-2">
            {perks.map((perk) => {
              const status = perkStatus[perk.id];
              const alreadyClaimed = claimed[perk.id];
              return (
                <div key={perk.id} className="flex items-center gap-3 rounded border border-gray-200 p-3">
                  <Gift className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{perk.name}</p>
                    {perk.description && <p className="text-xs text-gray-500">{perk.description}</p>}
                    {alreadyClaimed && (
                      <p className="text-xs font-mono font-bold mt-0.5" style={{ color: tier.color }}>{t("storefront.account.codeLabel")} {alreadyClaimed}</p>
                    )}
                    {!alreadyClaimed && status?.nextClaimAt && (
                      <p className="text-xs text-gray-400">{t("storefront.account.availableAt")} {new Date(status.nextClaimAt).toLocaleTimeString()}</p>
                    )}
                  </div>
                  {!alreadyClaimed && perk.active && (
                    <button
                      onClick={() => handleClaim(perk.id)}
                      disabled={!status?.canClaim || claiming === perk.id}
                      className="flex-shrink-0 px-3 py-1.5 rounded text-xs font-semibold text-white disabled:opacity-40"
                      style={{ background: tier.color }}
                    >
                      {claiming === perk.id ? <Loader2 className="h-3 w-3 animate-spin" /> : t("storefront.account.claim")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CustomerAccountPage({ params }: { params: Promise<{ slug: string }> }) {
  const t = useT();
  const { slug } = use(params);
  const [customer, setCustomer] = useState<SiteCustomer | null | "loading">("loading");
  const [siteId, setSiteId] = useState<string | null>(null);
  const [tab, setTab] = useState<"membership" | "orders" | "bookings">("membership");

  useEffect(() => {
    const session = loadSession(slug);
    setCustomer(session);
    if (session) {
      // Fetch site id for membership lookup
      import("@/lib/db/sites").then(({ getSiteBySlug }) =>
        getSiteBySlug(slug).then((site) => {
          if (site) setSiteId(site.id);
        }).catch(console.error)
      );
    }
  }, [slug]);

  const handleLogout = () => {
    localStorage.removeItem(sessionKey(slug));
    setCustomer(null);
  };

  if (customer === "loading") {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;
  }

  if (!customer) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 gap-4">
        <p className="text-gray-600 text-sm">{t("storefront.account.notSignedIn")}</p>
        <Link href={`/s/${slug}`} className="px-4 py-2 rounded bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800">
          {t("storefront.account.backToSite")}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between max-w-2xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href={`/s/${slug}`} className="text-gray-400 hover:text-gray-700">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="font-semibold text-sm">{customer.name ?? customer.email}</p>
            <p className="text-xs text-gray-500">{customer.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-gray-200 text-xs text-gray-500 hover:text-gray-900 hover:bg-gray-50"
        >
          <LogOut className="h-3.5 w-3.5" /> {t("storefront.account.signOut")}
        </button>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2 bg-white border-b border-gray-200 max-w-2xl mx-auto">
        <TabBtn active={tab === "membership"} onClick={() => setTab("membership")}>
          <Star className="h-3.5 w-3.5 inline mr-1" />{t("storefront.account.tabMembership")}
        </TabBtn>
        <TabBtn active={tab === "orders"} onClick={() => setTab("orders")}>
          <ShoppingBag className="h-3.5 w-3.5 inline mr-1" />{t("storefront.account.tabOrders")}
        </TabBtn>
        <TabBtn active={tab === "bookings"} onClick={() => setTab("bookings")}>
          <CalendarDays className="h-3.5 w-3.5 inline mr-1" />{t("storefront.account.tabBookings")}
        </TabBtn>
      </div>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {tab === "membership" && siteId && <MembershipTab customerId={customer.id} siteId={siteId} />}
        {tab === "membership" && !siteId && <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>}
        {tab === "orders"     && <OrdersTab customerId={customer.id} />}
        {tab === "bookings"   && <BookingsTab customerId={customer.id} />}
      </main>
    </div>
  );
}
