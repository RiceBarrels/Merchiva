"use client";

import { useState } from "react";
import { useSiteCustomer } from "@/components/site-customer-context";
import { upsertMembership } from "@/lib/db/customers";
import { CustomerLoginElement } from "./customer-login";
import { Loader2 } from "lucide-react";

interface Props {
  props: Record<string, unknown>;
  siteId: string;
}

export function MembershipElement({ props, siteId }: Props) {
  const { customer } = useSiteCustomer();
  const plans = (props.plans as { name: string; price: string; features: string[]; planKey: "free" | "basic" | "premium"; highlighted: boolean }[]) || [
    { name: "Free", price: "$0", features: ["Basic access", "1 location"], planKey: "free", highlighted: false },
    { name: "Basic", price: "$9/mo", features: ["Everything in Free", "Priority support", "5 locations"], planKey: "basic", highlighted: false },
    { name: "Premium", price: "$29/mo", features: ["Everything in Basic", "Unlimited access", "Dedicated support"], planKey: "premium", highlighted: true },
  ];

  const [joining, setJoining] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<"free" | "basic" | "premium" | null>(null);
  const [joined, setJoined] = useState<string | null>(null);

  const handleJoin = async (planKey: "free" | "basic" | "premium") => {
    if (!customer) {
      setPendingPlan(planKey);
      setShowLogin(true);
      return;
    }
    setJoining(planKey);
    try {
      await upsertMembership(siteId, customer.id, planKey);
      setJoined(planKey);
    } catch (err) {
      console.error(err);
    } finally {
      setJoining(null);
    }
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${plans.length}, 1fr)`, gap: "1.5rem", padding: "2rem" }}>
        {plans.map((plan, i) => (
          <div key={i} style={{ border: `2px solid ${plan.highlighted ? "var(--sr-accent, #3b82f6)" : "#e5e7eb"}`, borderRadius: "var(--sr-radius, 6px)", padding: "1.75rem", position: "relative" }}>
            {plan.highlighted && (
              <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", background: "var(--sr-accent, #3b82f6)", color: "#fff", padding: "0.125rem 0.875rem", borderRadius: "99px", fontSize: "0.75rem", fontWeight: 700, whiteSpace: "nowrap" }}>
                Most Popular
              </div>
            )}
            <h3 style={{ fontFamily: "var(--sr-font-heading)", fontWeight: 700, fontSize: "1.125rem", marginBottom: "0.5rem" }}>{plan.name}</h3>
            <p style={{ fontSize: "1.75rem", fontWeight: 800, marginBottom: "1.25rem", color: plan.highlighted ? "var(--sr-accent, #3b82f6)" : undefined }}>{plan.price}</p>
            <ul style={{ listStyle: "none", padding: 0, marginBottom: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {(plan.features || []).map((f, j) => (
                <li key={j} style={{ fontSize: "0.875rem", display: "flex", gap: "0.5rem" }}>
                  <span style={{ color: "var(--sr-accent, #3b82f6)", fontWeight: 700, flexShrink: 0 }}>✓</span>{f}
                </li>
              ))}
            </ul>
            {joined === plan.planKey ? (
              <div style={{ textAlign: "center", padding: "0.625rem", background: "#f0fdf4", color: "#16a34a", borderRadius: "var(--sr-radius, 4px)", fontWeight: 600, fontSize: "0.875rem" }}>Joined!</div>
            ) : (
              <button
                onClick={() => handleJoin(plan.planKey)}
                disabled={joining === plan.planKey}
                style={{ display: "block", width: "100%", textAlign: "center", padding: "0.625rem", background: plan.highlighted ? "var(--sr-accent, #3b82f6)" : "var(--sr-primary, #18181b)", color: "#fff", borderRadius: "var(--sr-radius, 4px)", fontWeight: 700, textDecoration: "none", fontSize: "0.875rem", border: "none", cursor: "pointer", opacity: joining === plan.planKey ? 0.7 : 1 }}
              >
                {joining === plan.planKey ? "Joining…" : "Join " + plan.name}
              </button>
            )}
          </div>
        ))}
      </div>

      {showLogin && !customer && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={() => setShowLogin(false)} />
          <div style={{ position: "relative", background: "white", borderRadius: "8px", padding: "0.5rem", maxWidth: "420px", width: "100%", margin: "1rem", zIndex: 1 }}>
            <CustomerLoginElement props={{ title: "Create an account to join", allowRegister: true }} siteId={siteId} />
            {customer && pendingPlan && (
              <button onClick={async () => { setShowLogin(false); await handleJoin(pendingPlan); }}
                style={{ width: "calc(100% - 2rem)", margin: "0 1rem 1rem", padding: "0.625rem", background: "var(--sr-accent, #3b82f6)", color: "#fff", border: "none", borderRadius: "4px", fontWeight: 700, cursor: "pointer" }}>
                Continue to join
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
