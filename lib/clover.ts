/**
 * Clover POS integration utilities.
 *
 * All Clover API calls use plain `fetch()` — no SDK required.
 * Prices come from Clover in **cents**; helpers convert to dollars where needed.
 */

import type { Product, SalesRecord } from "@/lib/types";

// ─── Clover API types ──────────────────────────────────────────────────────────

export interface CloverItem {
  id: string;
  name: string;
  price: number; // cents
  priceType: string;
  code?: string; // SKU
  sku?: string;
  categories?: { elements: { id: string; name: string }[] };
}

export interface CloverOrder {
  id: string;
  total: number; // cents
  createdTime: number; // unix ms
  state: string;
  lineItems?: {
    elements: { name: string; price: number; quantity?: number }[];
  };
}

export interface CloverConfig {
  accessToken: string;
  merchantId: string;
  environment: "sandbox" | "production";
}

// ─── Base URL ──────────────────────────────────────────────────────────────────

export function getCloverBaseUrl(env: "sandbox" | "production"): string {
  return env === "sandbox"
    ? "https://sandbox.dev.clover.com"
    : "https://api.clover.com";
}

export function getCloverOAuthUrl(env: "sandbox" | "production"): string {
  return env === "sandbox"
    ? "https://sandbox.dev.clover.com"
    : "https://www.clover.com";
}

// ─── API helpers ───────────────────────────────────────────────────────────────

async function cloverFetch<T>(
  config: CloverConfig,
  path: string,
): Promise<T> {
  const base = getCloverBaseUrl(config.environment);
  const url = `${base}/v3/merchants/${config.merchantId}${path}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Clover API ${res.status}: ${res.statusText}${body ? ` — ${body}` : ""}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Fetch items ───────────────────────────────────────────────────────────────

export async function fetchCloverItems(
  config: CloverConfig,
): Promise<CloverItem[]> {
  const data = await cloverFetch<{ elements?: CloverItem[] }>(
    config,
    "/items?expand=categories&limit=1000",
  );
  return data.elements ?? [];
}

// ─── Fetch orders ──────────────────────────────────────────────────────────────

export async function fetchCloverOrders(
  config: CloverConfig,
  since?: Date,
): Promise<CloverOrder[]> {
  let path = "/orders?expand=lineItems&limit=500&orderBy=createdTime+DESC";

  if (since) {
    const sinceMs = since.getTime();
    path += `&filter=createdTime>=${sinceMs}`;
  }

  const data = await cloverFetch<{ elements?: CloverOrder[] }>(config, path);
  return data.elements ?? [];
}

// ─── Mappers ───────────────────────────────────────────────────────────────────

export function mapCloverItemToProduct(item: CloverItem): Partial<Product> {
  const category =
    item.categories?.elements?.[0]?.name ?? "Uncategorized";

  return {
    name: item.name,
    category,
    price: item.price / 100, // cents -> dollars
    cost: 0,
    unitsSoldThisMonth: 0,
    unitsSoldLastMonth: 0,
    revenue: 0,
    margin: 0,
    rating: 0,
    trend: "stable" as const,
    alert: "none" as const,
  };
}

export function mapCloverOrderToSalesRecord(
  order: CloverOrder,
): Partial<SalesRecord> {
  const d = new Date(order.createdTime);

  return {
    date: d.toISOString().slice(0, 10), // YYYY-MM-DD
    hour: d.getHours(),
    actual: order.total / 100, // cents -> dollars
    predicted: 0,
    weather: "",
    footTraffic: 0,
    isHoliday: false,
  };
}

// ─── Environment helper ────────────────────────────────────────────────────────

export function getCloverEnvironment(): "sandbox" | "production" {
  const env = process.env.CLOVER_ENVIRONMENT ?? process.env.CLOVER_ENV ?? "sandbox";
  return env === "production" ? "production" : "sandbox";
}
