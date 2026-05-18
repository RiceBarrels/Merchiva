// @ts-nocheck
import { getConnection } from "@/lib/spacetimedb/client";
import type { Design } from "@/lib/types";

function designFromRow(row: any): Design {
  return {
    id: row.id.toString(),
    organizationId: row.organizationId,
    name: row.name,
    width: row.width,
    height: row.height,
    html: row.html ?? "",
    preset: row.preset ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getDesigns(organizationId: string): Promise<Design[]> {
  const c = getConnection();
  if (!c) return [];
  const rows = (c as any).db.design.iter();
  return Array.from(rows)
    .filter((r: any) => r.organizationId === organizationId)
    .map(designFromRow)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getDesignById(id: string): Promise<Design | null> {
  const c = getConnection();
  if (!c) return null;
  const rows = (c as any).db.design.iter();
  const row = Array.from(rows).find((r: any) => r.id.toString() === id);
  return row ? designFromRow(row) : null;
}
