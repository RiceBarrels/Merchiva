/**
 * The standalone `product` table was removed from the SpacetimeDB module —
 * sellable products now live on inventory_item rows (retailEnabled === true,
 * mirroring the client's useProducts hook). Server-side code that used to
 * `SELECT * FROM product` derives product-shaped rows from the inventory
 * snapshot with this instead.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function productsFromInventoryRows(items: any[]): any[] {
  return items
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((row: any) => row.retailEnabled === true && Number(row.retailPrice ?? 0) > 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((row: any) => {
      const usageQty = Number(row.retailUsageQty ?? 1) || 1;
      const price = Number(row.retailPrice ?? 0) || 0;
      const cost = Math.round((Number(row.costPerUnit ?? 0) || 0) * usageQty * 100) / 100;
      return {
        id: row.id,
        organizationId: String(row.organizationId ?? ""),
        name: row.name,
        category: row.category || "Retail",
        price,
        cost,
        margin: price > 0 ? ((price - cost) / price) * 100 : 0,
        alert: "none",
        inventoryUsage: JSON.stringify([
          {
            inventoryItemId: String(row.id ?? ""),
            inventoryItemName: row.name,
            quantity: usageQty,
            unit: row.unit,
          },
        ]),
      };
    });
}
