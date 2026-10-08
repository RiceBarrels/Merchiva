// Page-context builders for the data and workspace pages (lib/merchiva/data-page-context.ts,
// lib/merchiva/workspace-page-context.ts): the sentence Mr. Merchiva reads, the params it acts on,
// and that nothing is lost to sanitizePageContext.
import { describe, expect, test } from "bun:test";
import {
  financesPageContext,
  inventoryPageContext,
  pricingPageContext,
  productsPageContext,
  reportsPageContext,
  salesPageContext,
  suppliersPageContext,
  wastePageContext,
  wastePeriodRange,
  type InventoryPageState,
  type SuppliersPageState,
  type WastePageState,
} from "@/lib/merchiva/data-page-context";
import { sanitizePageContext, type MerchivaPageContext } from "@/lib/merchiva/page-context";
import {
  channelPageContext,
  dashboardPageContext,
  docEditorPageContext,
  driveHomePageContext,
  newTabPageContext,
} from "@/lib/merchiva/workspace-page-context";

const OAT = { id: "0b6c7f7e-1d2a-4c55-9a1e-2f3b4c5d6e7f", name: "Oat milk" };

/** What the page publishes must reach the server unchanged: valid keys, at most 12 scalar params. */
function expectSendable(ctx: MerchivaPageContext): void {
  expect(sanitizePageContext(ctx)).toEqual(ctx);
}

const inventory: InventoryPageState = {
  items: 42,
  lowStock: 5,
  outOfStock: 2,
  shown: 42,
  category: "All",
  search: "",
  sortKey: "name",
  sortDir: "asc",
  dialog: null,
  item: null,
};

describe("inventoryPageContext", () => {
  test("unfiltered list: counts only", () => {
    const ctx = inventoryPageContext(inventory);
    expect(ctx.summary).toBe("Inventory, 42 items (5 low stock, 2 out of stock).");
    expect(ctx.params).toEqual({ items: 42, lowStock: 5, outOfStock: 2 });
    expectSendable(ctx);
  });

  test("filters, sort and the item open in the stock sheet", () => {
    const ctx = inventoryPageContext({
      ...inventory,
      category: "Dairy",
      search: "  oat ",
      shown: 1,
      sortKey: "currentStock",
      sortDir: "desc",
      dialog: "adjustStock",
      item: OAT,
    });
    expect(ctx.summary).toBe(
      'Inventory, 42 items (5 low stock, 2 out of stock), category: Dairy, search "oat", showing 1, sorted by currentStock desc, adjusting stock of: Oat milk.',
    );
    expect(ctx.params).toEqual({
      items: 42,
      lowStock: 5,
      outOfStock: 2,
      category: "Dairy",
      search: "oat",
      shown: 1,
      sort: "currentStock desc",
      dialog: "adjustStock",
      itemId: OAT.id,
      itemName: "Oat milk",
    });
    expectSendable(ctx);
  });

  test("item details dialog and adding a new item", () => {
    expect(inventoryPageContext({ ...inventory, items: 1, dialog: "editItem", item: OAT }).summary).toBe(
      "Inventory, 1 item (5 low stock, 2 out of stock), item open: Oat milk.",
    );
    const adding = inventoryPageContext({ ...inventory, dialog: "addItem", item: OAT });
    expect(adding.summary).toEndWith(", adding a new item.");
    expect(adding.params).not.toHaveProperty("itemId");
    expect(adding.params?.dialog).toBe("addItem");
  });

  test("a long item name is clipped in the sentence and the params", () => {
    const ctx = inventoryPageContext({ ...inventory, dialog: "editItem", item: { id: OAT.id, name: "x".repeat(200) } });
    expect(String(ctx.params?.itemName).length).toBe(80);
    expect(String(ctx.params?.itemName)).toEndWith("…");
    expectSendable(ctx);
  });
});

describe("wastePeriodRange", () => {
  test("each filter's days, as the page filters them", () => {
    expect(wastePeriodRange("today", "2026-09-27")).toEqual({ from: "2026-09-27", to: "2026-09-27" });
    expect(wastePeriodRange("week", "2026-09-27")).toEqual({ from: "2026-09-21", to: "2026-09-27" });
    expect(wastePeriodRange("month", "2026-09-27")).toEqual({ from: "2026-09-01", to: "2026-09-27" });
    expect(wastePeriodRange("all", "2026-09-27")).toBeNull();
  });

  test("the 7-day window crosses a month boundary", () => {
    expect(wastePeriodRange("week", "2026-03-03")).toEqual({ from: "2026-02-25", to: "2026-03-03" });
  });
});

describe("wastePageContext", () => {
  const base: WastePageState = {
    today: "2026-09-27",
    period: "month",
    entries: 12,
    search: "",
    logging: false,
    itemId: null,
    itemName: "",
  };

  test("period with its days", () => {
    const ctx = wastePageContext(base);
    expect(ctx.summary).toBe("Waste log, 12 entries this month (2026-09-01 to 2026-09-27).");
    expect(ctx.params).toEqual({ period: "month", from: "2026-09-01", to: "2026-09-27", entries: 12 });
    expectSendable(ctx);
  });

  test("today, all time and a single entry", () => {
    expect(wastePageContext({ ...base, period: "today", entries: 1 }).summary).toBe(
      "Waste log, 1 entry today (2026-09-27).",
    );
    const all = wastePageContext({ ...base, period: "all", entries: 40 });
    expect(all.summary).toBe("Waste log, 40 entries all time.");
    expect(all.params).not.toHaveProperty("from");
  });

  test("search and the item picked in the log dialog", () => {
    const ctx = wastePageContext({ ...base, search: "milk", logging: true, itemId: OAT.id, itemName: "Oat milk" });
    expect(ctx.summary).toBe(
      'Waste log, 12 entries this month (2026-09-01 to 2026-09-27), search "milk", logging waste for: Oat milk.',
    );
    expect(ctx.params).toMatchObject({ search: "milk", dialog: "logWaste", itemId: OAT.id, itemName: "Oat milk" });
    expectSendable(ctx);
  });

  test("a typed-in item has a name but no id; a closed dialog sends neither", () => {
    const typed = wastePageContext({ ...base, logging: true, itemName: "Croissants" });
    expect(typed.params).toMatchObject({ itemName: "Croissants" });
    expect(typed.params).not.toHaveProperty("itemId");
    const closed = wastePageContext({ ...base, logging: false, itemId: OAT.id, itemName: "Oat milk" });
    expect(closed.params).not.toHaveProperty("itemId");
    expect(closed.params).not.toHaveProperty("itemName");
    expect(wastePageContext({ ...base, logging: true }).summary).toEndWith(", logging a waste entry.");
  });
});

describe("suppliersPageContext", () => {
  const base: SuppliersPageState = {
    suppliers: 8,
    shown: 8,
    search: "",
    openOrders: 3,
    needsReview: 0,
    dialog: null,
    supplier: null,
  };
  const FARM = { id: "5d1f2e3a-0000-4000-8000-000000000001", name: "Green Farm" };

  test("counts; the review count only when something needs review", () => {
    expect(suppliersPageContext(base).summary).toBe("Suppliers, 8 suppliers, 3 open purchase orders.");
    expect(suppliersPageContext({ ...base, openOrders: 1, needsReview: 1 }).summary).toBe(
      "Suppliers, 8 suppliers, 1 open purchase order, 1 supplier email to review.",
    );
  });

  test("the supplier being edited", () => {
    const ctx = suppliersPageContext({ ...base, search: "farm", shown: 2, dialog: "editSupplier", supplier: FARM });
    expect(ctx.summary).toBe(
      'Suppliers, 8 suppliers, 3 open purchase orders, search "farm", showing 2, supplier open: Green Farm.',
    );
    expect(ctx.params).toMatchObject({ search: "farm", shown: 2, dialog: "editSupplier", supplierId: FARM.id, supplierName: "Green Farm" });
    expectSendable(ctx);
  });

  test("a new purchase order, with and without a supplier picked", () => {
    expect(suppliersPageContext({ ...base, dialog: "newOrder", supplier: FARM }).summary).toEndWith(
      ", new purchase order for: Green Farm.",
    );
    const none = suppliersPageContext({ ...base, dialog: "newOrder", supplier: null });
    expect(none.summary).toEndWith(", new purchase order.");
    expect(none.params).not.toHaveProperty("supplierId");
  });

  test("adding a supplier carries no supplier id", () => {
    const ctx = suppliersPageContext({ ...base, dialog: "addSupplier", supplier: FARM });
    expect(ctx.summary).toEndWith(", adding a new supplier.");
    expect(ctx.params).not.toHaveProperty("supplierId");
  });
});

describe("productsPageContext and pricingPageContext", () => {
  test("products with filters", () => {
    const ctx = productsPageContext({
      products: 24,
      flagged: 3,
      shown: 2,
      category: "Drinks",
      search: "latte",
      flaggedOnly: true,
      adding: true,
    });
    expect(ctx.summary).toBe(
      'Products, 24 products (3 flagged), category: Drinks, flagged only, search "latte", showing 2, adding a new product.',
    );
    expect(ctx.params).toEqual({
      products: 24,
      flagged: 3,
      category: "Drinks",
      flaggedOnly: true,
      search: "latte",
      shown: 2,
      dialog: "addProduct",
    });
    expectSendable(ctx);
  });

  test("products without filters", () => {
    const ctx = productsPageContext({ products: 1, flagged: 0, shown: 1, category: "All", search: "", flaggedOnly: false, adding: false });
    expect(ctx.summary).toBe("Products, 1 product (0 flagged).");
    expect(ctx.params).toEqual({ products: 1, flagged: 0 });
  });

  test("pricing, loading and ready", () => {
    expect(pricingPageContext({ ready: false, products: 0, search: "" }).summary).toBe("Pricing, loading products.");
    const ctx = pricingPageContext({ ready: true, products: 24, search: "latte" });
    expect(ctx.summary).toBe('Pricing (price suggestions, happy hour, competitors), 24 products, search "latte".');
    expect(ctx.params).toEqual({ products: 24, search: "latte" });
  });
});

describe("salesPageContext, reportsPageContext, financesPageContext", () => {
  test("sales history range and tab", () => {
    const ctx = salesPageContext({ tab: "hourly", days: 40, range: { from: "2026-08-01", to: "2026-09-26" } });
    expect(ctx.summary).toBe("Sales, 40 days of daily sales (2026-08-01 to 2026-09-26), tab: today's hourly sales.");
    expect(ctx.params).toEqual({ tab: "hourly", from: "2026-08-01", to: "2026-09-26", daysTracked: 40 });
    expectSendable(ctx);
  });

  test("sales with nothing recorded", () => {
    const ctx = salesPageContext({ tab: null, days: 0, range: null });
    expect(ctx.summary).toBe("Sales, no daily sales recorded yet.");
    expect(ctx.params).toEqual({ daysTracked: 0 });
  });

  test("reports: both periods with their days", () => {
    const ctx = reportsPageContext({
      sales: { range: "this_month", from: "2026-09-01", to: "2026-09-27" },
      staff: { range: "last_month", from: "2026-08-01", to: "2026-08-31" },
    });
    expect(ctx.summary).toBe(
      "Reports (sales, staff, inventory, products), sales period: this month (2026-09-01 to 2026-09-27), staff period: last month (2026-08-01 to 2026-08-31).",
    );
    expect(ctx.params).toEqual({
      salesPeriod: "this_month",
      salesFrom: "2026-09-01",
      salesTo: "2026-09-27",
      staffPeriod: "last_month",
      staffFrom: "2026-08-01",
      staffTo: "2026-08-31",
    });
    expectSendable(ctx);
  });

  test("finances tab", () => {
    expect(financesPageContext("cashflow")).toEqual({ summary: "Finances, tab: cash flow.", params: { tab: "cashflow" } });
    expect(financesPageContext("overview").summary).toBe("Finances, tab: overview (revenue, expenses, profit).");
  });
});

describe("docs", () => {
  const DOC = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

  test("drive: defaults stay out of the params", () => {
    const ctx = driveHomePageContext({ space: "my", type: "", folder: null, search: "", shown: 1 });
    expect(ctx).toEqual({ summary: "Drive, My files, 1 item shown.", params: { space: "my", shown: 1 } });
  });

  test("drive: the documents view an old Docs home link lands on, with folder and search", () => {
    const ctx = driveHomePageContext({ space: "starred", type: "doc", folder: null, search: " menu ", shown: 3 });
    expect(ctx.summary).toBe('Drive, starred, only documents, search "menu", 3 items shown.');
    expect(ctx.params).toEqual({ space: "starred", type: "doc", search: "menu", shown: 3 });
    expect(driveHomePageContext({ space: "store", type: "", folder: "  ", search: "", shown: 0 }).summary).toBe(
      'Drive, Store files, in folder "Untitled folder", 0 items shown.',
    );
  });

  test("editor: open document with its title and access", () => {
    const ctx = docEditorPageContext({ docId: DOC, doc: { title: "Opening checklist", access: "edit" }, versionId: null });
    expect(ctx.summary).toBe('Docs editor, document open: "Opening checklist" (can edit).');
    expect(ctx.params).toEqual({ docId: DOC, docTitle: "Opening checklist", access: "edit" });
    expectSendable(ctx);
  });

  test("editor: untitled, viewing a version", () => {
    const ctx = docEditorPageContext({ docId: DOC, doc: { title: "  ", access: "view" }, versionId: "v-1" });
    expect(ctx.summary).toBe('Docs editor, document open: "Untitled document" (can view), viewing a saved version.');
    expect(ctx.params).toMatchObject({ docTitle: "Untitled document", versionId: "v-1" });
  });

  test("editor: no title before the member may open the document", () => {
    const ctx = docEditorPageContext({ docId: DOC, doc: null, versionId: null });
    expect(ctx.params).toEqual({ docId: DOC });
    expect(ctx.summary).toContain("cannot open");
  });
});

describe("channelPageContext", () => {
  test("list only", () => {
    expect(channelPageContext({ conversations: 6, open: null })).toEqual({
      summary: "Channel (team chat), 6 conversations.",
      params: { conversations: 6 },
    });
  });

  test("group chat and direct messages", () => {
    const group = channelPageContext({ conversations: 6, open: { id: "c-1", name: "Kitchen", type: "group", members: 5 } });
    expect(group.summary).toBe('Channel (team chat), 6 conversations, open: group chat "Kitchen" (5 members).');
    expect(group.params).toEqual({
      conversations: 6,
      conversationId: "c-1",
      conversationName: "Kitchen",
      conversationType: "group",
      members: 5,
    });
    expectSendable(group);
    const dm = channelPageContext({ conversations: 1, open: { id: "c-2", name: "Ana", type: "direct", members: 2 } });
    expect(dm.summary).toBe("Channel (team chat), 1 conversation, open: direct messages with Ana.");
  });
});

describe("newTabPageContext and dashboardPageContext", () => {
  test("new tab, with and without a search", () => {
    expect(newTabPageContext("").params).toEqual({});
    const ctx = newTabPageContext(" inv ");
    expect(ctx.summary).toEndWith(', search "inv".');
    expect(ctx.params).toEqual({ search: "inv" });
  });

  test("dashboard carries today's key", () => {
    const ctx = dashboardPageContext("2026-09-27");
    expect(ctx.summary).toStartWith("Dashboard for today 2026-09-27:");
    expect(ctx.params).toEqual({ today: "2026-09-27" });
    expectSendable(ctx);
  });
});
