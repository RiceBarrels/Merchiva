"use client";

import { Check } from "lucide-react";

interface PricingItem {
  name: string;
  price: string;
  description?: string;
  features?: string[];
  popular?: boolean;
  ctaLabel?: string;
  ctaUrl?: string;
}

interface PricingTableProps {
  items?: PricingItem[];
  isEditor?: boolean;
  themeColor?: string;
}

const DEFAULT_ITEMS: PricingItem[] = [
  {
    name: "Basic",
    price: "$9",
    description: "Great for individuals",
    features: ["Up to 5 items", "Email support", "Basic analytics"],
    ctaLabel: "Get started",
  },
  {
    name: "Pro",
    price: "$29",
    description: "For growing businesses",
    features: ["Unlimited items", "Priority support", "Advanced analytics", "Custom domain"],
    popular: true,
    ctaLabel: "Get started",
  },
  {
    name: "Enterprise",
    price: "Custom",
    description: "For large teams",
    features: ["Everything in Pro", "Dedicated support", "SLA guarantee", "Custom integrations"],
    ctaLabel: "Contact us",
  },
];

export function PricingTable({
  items = DEFAULT_ITEMS,
  isEditor = false,
  themeColor = "#0f172a",
}: PricingTableProps) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(items.length, 3)}, minmax(0, 1fr))` }}>
      {items.map((item) => (
        <div
          key={item.name}
          className="relative border bg-white p-5 flex flex-col"
          style={{
            borderRadius: "0.3rem",
            borderColor: item.popular ? themeColor : "#e7e5e4",
            borderWidth: item.popular ? "2px" : "1px",
          }}
        >
          {item.popular && (
            <div
              className="absolute -top-px left-4 px-2 py-0.5 text-xs font-semibold text-white"
              style={{ backgroundColor: themeColor, borderRadius: "0 0 0.3rem 0.3rem" }}
            >
              Most Popular
            </div>
          )}

          <div className="mb-4">
            <p className="font-semibold text-stone-900 text-sm">{item.name}</p>
            {item.description && (
              <p className="text-xs text-stone-500 mt-0.5">{item.description}</p>
            )}
            <p className="text-3xl font-bold text-stone-900 mt-3 font-mono">
              {item.price}
              {item.price !== "Custom" && (
                <span className="text-sm font-normal text-stone-400">/mo</span>
              )}
            </p>
          </div>

          {item.features && item.features.length > 0 && (
            <ul className="space-y-1.5 mb-5 flex-1">
              {item.features.map((feat) => (
                <li key={feat} className="flex items-start gap-2 text-xs text-stone-700">
                  <Check className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" style={{ color: themeColor }} />
                  {feat}
                </li>
              ))}
            </ul>
          )}

          {item.ctaLabel && (
            <a
              href={isEditor ? "#" : (item.ctaUrl ?? "#")}
              onClick={(e) => isEditor && e.preventDefault()}
              className="block text-center py-2 text-xs font-medium transition-colors"
              style={
                item.popular
                  ? { backgroundColor: themeColor, color: "#fff", borderRadius: "0.3rem" }
                  : {
                      border: `1px solid ${themeColor}`,
                      color: themeColor,
                      borderRadius: "0.3rem",
                    }
              }
            >
              {item.ctaLabel}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
