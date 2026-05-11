"use client";

import dynamic from "next/dynamic";

const PricingPage = dynamic(() => import("@/components/landing/pricing-page").then((m) => m.PricingPage), {
  ssr: false,
  loading: () => <div style={{ background: "#f0eee9", minHeight: "100vh" }} />,
});

export function PricingWrapper() {
  return <PricingPage />;
}
