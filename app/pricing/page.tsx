import type { Metadata } from "next";
import { PricingWrapper } from "@/components/landing/pricing-wrapper";

const BASE_URL = "https://project-management-phi-red.vercel.app";

export const metadata: Metadata = {
  title: "Pricing — Merchiva | Per-Location, Flat, No Per-Seat",
  description:
    "Three plans from $49/mo per location. Unlimited forecasts, auto-reorder POs, and data export included. 30-day free trial, no credit card required. Cancel any time.",
  keywords: [
    "inventory software pricing",
    "business management pricing",
    "affordable inventory forecasting",
    "small business software cost",
    "POS inventory pricing",
    "demand forecasting pricing",
  ],
  alternates: { canonical: `${BASE_URL}/pricing` },
  openGraph: {
    title: "Merchiva Pricing — Simple, Per-Location, No Per-Seat",
    description:
      "Starter $49/mo, Operator $129/mo, Chain custom. All plans include 30-day free trial. No credit card to start. Median payback: 11 days.",
    url: `${BASE_URL}/pricing`,
    siteName: "Merchiva",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Merchiva Pricing — From $49/mo Per Location",
    description:
      "Three plans. 30-day free trial. No credit card required. Median payback: 11 days.",
  },
  robots: { index: true, follow: true },
};

function PricingJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Merchiva Pricing",
    description: "Pricing plans for Merchiva inventory forecasting software.",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: [
        {
          "@type": "Offer",
          name: "Starter",
          price: "49",
          priceCurrency: "USD",
          description: "Up to 250 SKUs, daily forecasts, 14-day window, auto reorder suggestions.",
          eligibleDuration: { "@type": "QuantitativeValue", value: "1", unitCode: "MON" },
        },
        {
          "@type": "Offer",
          name: "Operator",
          price: "129",
          priceCurrency: "USD",
          description: "Unlimited SKUs, hourly forecasts, 90-day window, auto-send POs, multi-location.",
          eligibleDuration: { "@type": "QuantitativeValue", value: "1", unitCode: "MON" },
        },
      ],
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

function FAQJsonLd() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: "How accurate is the forecast?", acceptedAnswer: { "@type": "Answer", text: "Median MAPE across all customers is 7.2% on 14-day horizons after seven days of training data." } },
      { "@type": "Question", name: "What POS systems do you connect to?", acceptedAnswer: { "@type": "Answer", text: "Square, Toast, Clover, Lightspeed, Shopify POS, and Merchiva POS. CSV import works for everything else." } },
      { "@type": "Question", name: "Is there a per-SKU charge?", acceptedAnswer: { "@type": "Answer", text: "No. SKU caps apply on Starter (250). Operator and Chain are unlimited. We never charge per forecast, per API call, or per PO." } },
      { "@type": "Question", name: "Can I cancel any time?", acceptedAnswer: { "@type": "Answer", text: "Yes. Cancel from settings — pro-rated refund of any unused days. Data export available on every plan, every day." } },
      { "@type": "Question", name: "What happens after the 30-day trial?", acceptedAnswer: { "@type": "Answer", text: "Your account converts to your selected plan. We email you 7, 3, and 1 day before. If you don't add a card, the account pauses — your data stays for 90 days." } },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}

export default function Page() {
  return (
    <>
      <PricingJsonLd />
      <FAQJsonLd />
      <PricingWrapper />
    </>
  );
}
