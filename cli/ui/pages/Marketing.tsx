// Marketing page (Customers → Marketing tab, key "marketing").
// Read-only dashboard: org coupons + loyalty top point-holders.
//
// Data model notes:
//   - `coupon` is org-scoped (organizationId).
//   - `customerPoints` is keyed by customerId/siteId (NOT organizationId), so we
//     org-filter by first building the set of the org's site IDs (from `site`)
//     and resolving customer names through `siteCustomer`.
// Permission section is "sales" — the parent already gates the page by view, so
// we only read here (no writes exposed).
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { useTable } from "spacetimedb/react";
import { tables } from "../../../lib/spacetimedb/generated/index.ts";
import { Gate } from "../components/Gate.tsx";
import { Table, type Column } from "../components/Table.tsx";
import { useOrg } from "../data/provider.tsx";
import { theme } from "../theme.ts";

interface CouponRow {
  code: string;
  discount: string;
  active: boolean;
  uses: string;
  expires: string;
}

interface PointRow {
  name: string;
  points: number;
  lifetime: number;
}

function fmtDate(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "—";
  // valid_until is a plain string; keep just the date portion if ISO.
  const m = s.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : s.slice(0, 10);
}

export function Marketing({
  height,
  // focused/setCapturing are part of the page contract; this view is read-only
  // so it never captures input or reacts to focus.
  focused: _focused,
  setCapturing: _setCapturing,
}: {
  height: number;
  focused: boolean;
  setCapturing: (b: boolean) => void;
}) {
  const { orgId } = useOrg();
  const [coupons, couponsReady] = useTable(tables.coupon as any);
  const [points, pointsReady] = useTable(tables.customerPoints as any);
  const [sites, sitesReady] = useTable(tables.site as any);
  const [siteCustomers, customersReady] = useTable(tables.siteCustomer as any);

  const ready = couponsReady && pointsReady && sitesReady && customersReady;

  // Coupons for this org, active first, then by code.
  const couponRows = useMemo<CouponRow[]>(() => {
    if (!orgId) return [];
    return (coupons as any[])
      .filter((c) => c.organizationId === orgId)
      .map((c) => {
        const type = String(c.discountType ?? "");
        const val = Number(c.discountValue ?? 0);
        const discount =
          type === "percentage" || type === "percent"
            ? `${val}%`
            : `$${val.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
        const max = Number(c.maxUses ?? 0);
        const used = Number(c.usedCount ?? 0);
        return {
          code: String(c.code ?? "—"),
          discount,
          active: Boolean(c.active),
          uses: max > 0 ? `${used}/${max}` : String(used),
          expires: fmtDate(c.validUntil),
        };
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || a.code.localeCompare(b.code));
  }, [coupons, orgId]);

  // Loyalty top holders — org-filtered via the org's site IDs.
  const pointRows = useMemo<PointRow[]>(() => {
    if (!orgId) return [];
    const orgSiteIds = new Set(
      (sites as any[]).filter((s) => s.organizationId === orgId).map((s) => String(s.id)),
    );
    const nameById = new Map<string, string>();
    for (const sc of siteCustomers as any[]) {
      nameById.set(String(sc.id), String(sc.name ?? sc.email ?? "—"));
    }
    return (points as any[])
      .filter((p) => orgSiteIds.has(String(p.siteId)))
      .map((p) => ({
        name: nameById.get(String(p.customerId)) ?? String(p.customerId).slice(0, 8),
        points: Number(p.points ?? 0),
        lifetime: Number(p.lifetimePoints ?? 0),
      }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 8);
  }, [points, sites, siteCustomers, orgId]);

  const activeCoupons = couponRows.filter((c) => c.active).length;
  const members = pointRows.length; // top slice; full count below
  const totalMembers = useMemo(() => {
    if (!orgId) return 0;
    const orgSiteIds = new Set(
      (sites as any[]).filter((s) => s.organizationId === orgId).map((s) => String(s.id)),
    );
    return (points as any[]).filter((p) => orgSiteIds.has(String(p.siteId))).length;
  }, [points, sites, orgId]);

  const couponCols: Column<CouponRow>[] = [
    { header: "Code", width: 16, render: (r) => r.code },
    { header: "Discount", width: 10, align: "right", render: (r) => r.discount },
    {
      header: "Status",
      width: 9,
      render: (r) => (r.active ? "active" : "inactive"),
      color: (r) => (r.active ? theme.good : theme.dim),
    },
    { header: "Uses", width: 9, align: "right", render: (r) => r.uses },
    { header: "Expires", width: 12, render: (r) => r.expires },
  ];

  const pointCols: Column<PointRow>[] = [
    { header: "Customer", width: 26, render: (r) => r.name },
    { header: "Points", width: 9, align: "right", render: (r) => String(r.points), color: () => theme.accent },
    { header: "Lifetime", width: 10, align: "right", render: (r) => String(r.lifetime) },
  ];

  // Split the available height between the two tables.
  const couponMax = Math.max(3, Math.floor((height - 10) / 2));

  return (
    <Gate ready={ready}>
      <Box flexDirection="column">
        <Text color={theme.dim}>
          {couponRows.length} coupons (<Text color={theme.good}>{activeCoupons}</Text> active) ·{" "}
          {totalMembers} loyalty members
        </Text>

        <Box marginTop={1} flexDirection="column">
          <Text color={theme.muted} bold>
            Coupons
          </Text>
          <Table
            columns={couponCols}
            rows={couponRows}
            maxRows={couponMax}
            emptyText="No coupons yet."
          />
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text color={theme.muted} bold>
            Loyalty · top point-holders {members > 0 ? `(top ${members})` : ""}
          </Text>
          <Table columns={pointCols} rows={pointRows} maxRows={8} emptyText="No loyalty points yet." />
        </Box>
      </Box>
    </Gate>
  );
}
