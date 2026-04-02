import type {
  InventoryItem,
  InventoryTransaction,
  SalesRecord,
  SalesForecast,
  Shift,
  StaffingRecommendation,
  Product,
  DashboardMetrics,
} from "./types";

// ─── Inventory ───────────────────────────────────────────────────────────────

export const inventoryItems: InventoryItem[] = [
  {
    id: "inv-001",
    name: "Arabica Coffee Beans",
    category: "Beverages",
    currentStock: 12,
    minStock: 20,
    maxStock: 100,
    unit: "kg",
    costPerUnit: 18.5,
    supplier: "Pacific Roasters",
    lastRestocked: "2026-03-22",
    status: "low_stock",
    lossRate: 3.2,
  },
  {
    id: "inv-002",
    name: "Whole Milk",
    category: "Dairy",
    currentStock: 45,
    minStock: 30,
    maxStock: 120,
    unit: "liters",
    costPerUnit: 1.2,
    supplier: "Valley Farms",
    lastRestocked: "2026-03-30",
    status: "in_stock",
    lossRate: 5.1,
  },
  {
    id: "inv-003",
    name: "Almond Milk",
    category: "Dairy Alt",
    currentStock: 8,
    minStock: 15,
    maxStock: 60,
    unit: "liters",
    costPerUnit: 3.4,
    supplier: "NutriBlend",
    lastRestocked: "2026-03-28",
    status: "low_stock",
    lossRate: 2.0,
  },
  {
    id: "inv-004",
    name: "Paper Cups (12oz)",
    category: "Supplies",
    currentStock: 0,
    minStock: 200,
    maxStock: 1000,
    unit: "units",
    costPerUnit: 0.08,
    supplier: "EcoPack",
    lastRestocked: "2026-03-15",
    status: "out_of_stock",
    lossRate: 0,
  },
  {
    id: "inv-005",
    name: "Vanilla Syrup",
    category: "Syrups",
    currentStock: 24,
    minStock: 10,
    maxStock: 50,
    unit: "bottles",
    costPerUnit: 8.75,
    supplier: "Monin",
    lastRestocked: "2026-03-25",
    status: "in_stock",
    lossRate: 1.5,
  },
  {
    id: "inv-006",
    name: "Croissants",
    category: "Bakery",
    currentStock: 18,
    minStock: 24,
    maxStock: 80,
    unit: "units",
    costPerUnit: 1.6,
    supplier: "Sunrise Bakery",
    lastRestocked: "2026-04-01",
    status: "low_stock",
    lossRate: 12.0,
  },
  {
    id: "inv-007",
    name: "Espresso Blend",
    category: "Beverages",
    currentStock: 35,
    minStock: 20,
    maxStock: 80,
    unit: "kg",
    costPerUnit: 22.0,
    supplier: "Pacific Roasters",
    lastRestocked: "2026-03-29",
    status: "in_stock",
    lossRate: 2.8,
  },
  {
    id: "inv-008",
    name: "Oat Milk",
    category: "Dairy Alt",
    currentStock: 30,
    minStock: 15,
    maxStock: 60,
    unit: "liters",
    costPerUnit: 2.9,
    supplier: "OatlyPro",
    lastRestocked: "2026-03-31",
    status: "in_stock",
    lossRate: 1.8,
  },
];

export const inventoryTransactions: InventoryTransaction[] = [
  { id: "txn-001", itemId: "inv-001", itemName: "Arabica Coffee Beans", type: "out", quantity: 3, date: "2026-04-01", note: "Daily usage" },
  { id: "txn-002", itemId: "inv-002", itemName: "Whole Milk", type: "in", quantity: 20, date: "2026-04-01", note: "Morning delivery" },
  { id: "txn-003", itemId: "inv-006", itemName: "Croissants", type: "loss", quantity: 4, date: "2026-04-01", note: "End-of-day waste" },
  { id: "txn-004", itemId: "inv-004", itemName: "Paper Cups (12oz)", type: "out", quantity: 50, date: "2026-03-31", note: "Last of stock used" },
  { id: "txn-005", itemId: "inv-005", itemName: "Vanilla Syrup", type: "in", quantity: 6, date: "2026-03-30", note: "Restock order" },
  { id: "txn-006", itemId: "inv-003", itemName: "Almond Milk", type: "out", quantity: 4, date: "2026-03-30", note: "Daily usage" },
  { id: "txn-007", itemId: "inv-007", itemName: "Espresso Blend", type: "in", quantity: 10, date: "2026-03-29", note: "Weekly order" },
  { id: "txn-008", itemId: "inv-008", itemName: "Oat Milk", type: "in", quantity: 15, date: "2026-03-31", note: "Restocked" },
];

// ─── Sales ───────────────────────────────────────────────────────────────────

export const salesHistory: SalesRecord[] = Array.from({ length: 30 }, (_, i) => {
  const date = new Date("2026-03-01");
  date.setDate(date.getDate() + i);
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  const base = isWeekend ? 920 : 720;
  const actual = base + Math.floor(Math.random() * 200 - 100);
  const predicted = base + Math.floor(Math.random() * 80 - 40);
  return {
    date: date.toISOString().split("T")[0],
    actual,
    predicted,
    weather: ["sunny", "cloudy", "rainy", "sunny", "sunny"][Math.floor(Math.random() * 5)],
    footTraffic: 200 + Math.floor(Math.random() * 400),
    isHoliday: i === 14,
  };
});

export const hourlyForecast: SalesRecord[] = Array.from({ length: 14 }, (_, i) => {
  const hour = i + 7; // 7am to 8pm
  const peak = hour >= 8 && hour <= 10 ? 1.5 : hour >= 12 && hour <= 14 ? 1.3 : 1.0;
  const base = Math.floor(45 * peak);
  return {
    date: "2026-04-01",
    hour,
    actual: hour <= 13 ? base + Math.floor(Math.random() * 20 - 10) : 0,
    predicted: base + Math.floor(Math.random() * 10 - 5),
    weather: "cloudy",
    footTraffic: Math.floor(50 * peak),
    isHoliday: false,
  };
});

export const upcomingForecasts: SalesForecast[] = [
  { date: "2026-04-02", predicted: 840, confidence: 88, factors: { weather: "sunny", footTraffic: "high", isHoliday: false, dayOfWeek: "Thursday" } },
  { date: "2026-04-03", predicted: 960, confidence: 82, factors: { weather: "sunny", footTraffic: "high", isHoliday: false, dayOfWeek: "Friday" } },
  { date: "2026-04-04", predicted: 1100, confidence: 79, factors: { weather: "cloudy", footTraffic: "high", isHoliday: false, dayOfWeek: "Saturday" } },
  { date: "2026-04-05", predicted: 980, confidence: 85, factors: { weather: "sunny", footTraffic: "high", isHoliday: false, dayOfWeek: "Sunday" } },
  { date: "2026-04-06", predicted: 680, confidence: 91, factors: { weather: "rainy", footTraffic: "low", isHoliday: false, dayOfWeek: "Monday" } },
  { date: "2026-04-07", predicted: 720, confidence: 90, factors: { weather: "cloudy", footTraffic: "medium", isHoliday: false, dayOfWeek: "Tuesday" } },
];

// ─── Staffing ────────────────────────────────────────────────────────────────

export const weeklySchedule: Shift[] = [
  { id: "s-001", memberId: "m-001", staffName: "Alex Chen", staffRole: "Barista", date: "2026-04-01", shiftType: "morning", startTime: "07:00", endTime: "14:00", predictedDemand: "high" },
  { id: "s-002", memberId: "m-002", staffName: "Maria Lopez", staffRole: "Shift Lead", date: "2026-04-01", shiftType: "morning", startTime: "07:00", endTime: "15:00", predictedDemand: "high" },
  { id: "s-003", memberId: "m-005", staffName: "Taylor Nguyen", staffRole: "Barista", date: "2026-04-01", shiftType: "afternoon", startTime: "13:00", endTime: "20:00", predictedDemand: "medium" },
  { id: "s-004", memberId: "m-003", staffName: "Jordan Kim", staffRole: "Cashier", date: "2026-04-02", shiftType: "morning", startTime: "07:00", endTime: "14:00", predictedDemand: "high" },
  { id: "s-005", memberId: "m-006", staffName: "Casey Brown", staffRole: null, date: "2026-04-02", shiftType: "morning", startTime: "07:00", endTime: "15:00", predictedDemand: "high" },
  { id: "s-006", memberId: "m-004", staffName: "Sam Patel", staffRole: "Barista", date: "2026-04-03", shiftType: "morning", startTime: "07:00", endTime: "14:00", predictedDemand: "high" },
  { id: "s-007", memberId: "m-002", staffName: "Maria Lopez", staffRole: "Shift Lead", date: "2026-04-03", shiftType: "evening", startTime: "14:00", endTime: "21:00", predictedDemand: "medium" },
  { id: "s-008", memberId: "m-001", staffName: "Alex Chen", staffRole: "Barista", date: "2026-04-04", shiftType: "morning", startTime: "07:00", endTime: "14:00", predictedDemand: "high" },
];

export const staffingRecommendations: StaffingRecommendation[] = [
  { date: "2026-04-04", shift: "morning", recommendedCount: 4, currentScheduled: 2, reason: "Saturday peak — predicted +34% foot traffic vs last week" },
  { date: "2026-04-05", shift: "morning", recommendedCount: 3, currentScheduled: 1, reason: "Sunday brunch rush — historically high demand 9am–1pm" },
  { date: "2026-04-06", shift: "afternoon", recommendedCount: 2, currentScheduled: 2, reason: "Rainy Monday — reduced traffic expected, on track" },
];

// ─── Products ────────────────────────────────────────────────────────────────

export const products: Product[] = [
  { id: "prod-001", name: "Latte", category: "Hot Beverages", price: 5.5, cost: 1.8, unitsSoldThisMonth: 420, unitsSoldLastMonth: 395, revenue: 2310, margin: 67.3, rating: 4.8, trend: "up", alert: "none" },
  { id: "prod-002", name: "Cappuccino", category: "Hot Beverages", price: 5.0, cost: 1.6, unitsSoldThisMonth: 310, unitsSoldLastMonth: 325, revenue: 1550, margin: 68.0, rating: 4.7, trend: "down", alert: "none" },
  { id: "prod-003", name: "Cold Brew", category: "Cold Beverages", price: 6.0, cost: 1.5, unitsSoldThisMonth: 285, unitsSoldLastMonth: 210, revenue: 1710, margin: 75.0, rating: 4.9, trend: "up", alert: "none" },
  { id: "prod-004", name: "Matcha Latte", category: "Specialty", price: 6.5, cost: 2.4, unitsSoldThisMonth: 88, unitsSoldLastMonth: 95, revenue: 572, margin: 63.1, rating: 4.2, trend: "down", alert: "underperforming", alertReason: "Sales dropped 7.4% MoM; below category average" },
  { id: "prod-005", name: "Croissant", category: "Bakery", price: 4.0, cost: 1.6, unitsSoldThisMonth: 180, unitsSoldLastMonth: 190, revenue: 720, margin: 60.0, rating: 4.5, trend: "stable", alert: "none" },
  { id: "prod-006", name: "Lavender Lemonade", category: "Cold Beverages", price: 5.5, cost: 1.9, unitsSoldThisMonth: 32, unitsSoldLastMonth: 55, revenue: 176, margin: 65.5, rating: 3.4, trend: "down", alert: "remove", alertReason: "Sales down 41.8% MoM; low rating 3.4/5; high prep complexity" },
  { id: "prod-007", name: "Americano", category: "Hot Beverages", price: 4.0, cost: 0.9, unitsSoldThisMonth: 340, unitsSoldLastMonth: 330, revenue: 1360, margin: 77.5, rating: 4.6, trend: "up", alert: "none" },
  { id: "prod-008", name: "Avocado Toast", category: "Food", price: 9.5, cost: 3.8, unitsSoldThisMonth: 125, unitsSoldLastMonth: 118, revenue: 1187.5, margin: 60.0, rating: 4.7, trend: "up", alert: "none" },
  { id: "prod-009", name: "Seasonal Spice Blend", category: "Specialty", price: 7.0, cost: 2.8, unitsSoldThisMonth: 22, unitsSoldLastMonth: 41, revenue: 154, margin: 60.0, rating: 3.8, trend: "down", alert: "underperforming", alertReason: "Seasonal decline expected; review for menu rotation" },
];

// ─── Dashboard ───────────────────────────────────────────────────────────────

export const dashboardMetrics: DashboardMetrics = {
  inventoryValue: inventoryItems.reduce((sum, i) => sum + i.currentStock * i.costPerUnit, 0),
  lowStockItems: inventoryItems.filter((i) => i.status === "low_stock" || i.status === "out_of_stock").length,
  todaySalesPredicted: 780,
  todaySalesActual: 432, // partial day
  staffScheduledToday: 3,
  staffNeededToday: 4,
  productsAtRisk: products.filter((p) => p.alert !== "none").length,
  totalProducts: products.length,
};
