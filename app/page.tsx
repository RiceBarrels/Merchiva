import type { Metadata } from "next";
import { HomepageWrapper } from "@/components/landing/homepage-wrapper";

const BASE_URL = "https://project-management-phi-red.vercel.app";

export const metadata: Metadata = {
  title: "Merchiva — Inventory Forecasting for Small Business",
  description:
    "Stop guessing what to order. Merchiva watches your sales every minute and tells you exactly how much to order, and when — for every SKU, every supplier, every location. Median forecast error: 7.2%.",
  keywords: [
    "inventory forecasting",
    "demand prediction",
    "reorder automation",
    "small business inventory",
    "stockout prevention",
    "POS integration",
    "Square integration",
    "inventory management",
    "supply chain",
    "restaurant inventory",
    "cafe management",
    "retail forecasting",
  ],
  alternates: { canonical: BASE_URL },
  openGraph: {
    title: "Merchiva — Know What Sells Next",
    description:
      "AI-powered inventory forecasting that pays back in week one. Per-SKU demand models, auto-reorder POs, stockout alerts. 7.2% median forecast error across 2,841 businesses.",
    url: BASE_URL,
    siteName: "Merchiva",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Merchiva — Know What Sells Next",
    description:
      "AI-powered inventory forecasting. Per-SKU demand models, auto-reorder POs, stockout alerts. 7.2% median forecast error.",
  },
  robots: { index: true, follow: true },
};

function HomeJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Merchiva",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    description:
      "AI-powered inventory forecasting and daily management for small businesses. Per-SKU demand models, auto-reorder purchase orders, stockout alerts.",
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "49",
      highPrice: "129",
      priceCurrency: "USD",
      offerCount: "2",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "318",
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default function LandingPage() {
  return (
    <>
      <HomeJsonLd />
      <HomepageWrapper />
    </>
  );
}
