/**
 * Mr. Merchiva read-tools — server-only.
 *
 * Native LLM tool calling (AI SDK v6) for Mr. Merchiva. These are READ-ONLY:
 * the model calls them to fetch live store data on demand (team, roles,
 * schedule history, inventory, sales, …) instead of receiving one giant
 * `LIVE STORE DATA` JSON dump up-front. WRITES stay as ```action``` blocks so
 * the existing approval-card UI and permission flow are untouched.
 *
 * Data comes from the cached SpacetimeDB service connection
 * (SPACETIMEDB_SERVICE_TOKEN). If the token isn't configured the caller should
 * skip tools (see `merchivaToolsEnabled`) and fall back to the inline dump.
 *
 * Tools return real row `id`s — the model needs them to emit updateShift /
 * deleteShift / updateRole / addRoleTask / updatePrice / orderFromSupplier
 * action blocks.
 */

import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { getServiceConn, subscribeAndWait } from "@/lib/spacetimedb/service-client";
import { productsFromInventoryRows } from "@/lib/products/from-inventory";

/** Tools are only usable when the server can open the service connection. */
export function merchivaToolsEnabled(): boolean {
  return !!process.env.SPACETIMEDB_SERVICE_TOKEN;
}

// ── Row helpers ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceConn = any;

/** A uuid/identity column decodes to an object with toHexString(); fall back to String. */
function rowId(r: Row): string {
  const id = r?.id;
  return id?.toHexString ? id.toHexString() : String(id ?? "");
}

/** option<T> columns come back as the value, or undefined/null when unset. */
function opt<T>(v: T | null | undefined): T | null {
  return v == null ? null : v;
}

function jsonArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v !== "string" || !v.trim()) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** An identity column decodes to an object with toHexString(); always return a string. */
function idHex(u: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = u as any;
  return v?.toHexString ? v.toHexString() : String(v ?? "");
}

/** All rows of a table for one org. `orgIdField` defaults to `organizationId`. */
function orgRows(conn: ServiceConn, table: string, organizationId: string): Row[] {
  const t = conn?.db?.[table];
  if (!t || typeof t.iter !== "function") return [];
  return [...t.iter()].filter((r: Row) => {
    const oid = r?.organizationId;
    // organizationId is sometimes an option<string> (e.g. role_task) → unwrap.
    const v = oid && typeof oid === "object" && "some" in oid ? oid.some : oid;
    return v === organizationId;
  });
}

// ── Subscriptions ────────────────────────────────────────────────────────────
//
// The service connection's row cache is empty until a subscription delivers
// rows. We subscribe once per connection to the superset of tables the tools
// read. Subscriptions stay live on the cached (warm) connection.

const TOOL_QUERIES = [
  "SELECT * FROM organization",
  "SELECT * FROM org_member",
  "SELECT * FROM staff_member",
  "SELECT * FROM staff_role",
  "SELECT * FROM role_task",
  "SELECT * FROM shift",
  "SELECT * FROM shift_preset",
  "SELECT * FROM staff_availability",
  "SELECT * FROM time_off_request",
  "SELECT * FROM shift_trade",
  "SELECT * FROM inventory_item",
  "SELECT * FROM supplier",
  "SELECT * FROM sales_record",
  "SELECT * FROM settings",
];

const toolsSubscribed = new WeakSet<object>();

async function ready(): Promise<ServiceConn> {
  const conn = await getServiceConn();
  if (!toolsSubscribed.has(conn)) {
    await subscribeAndWait(conn, TOOL_QUERIES);
    toolsSubscribed.add(conn);
  }
  return conn;
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function addDays(isoDate: string, delta: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function shiftView(s: Row) {
  return {
    id: rowId(s),
    staffName: s.staffName,
    date: s.date,
    start: s.startTime,
    end: s.endTime,
    type: s.shiftType,
    roles: s.staffRoles,
  };
}

// ── Slim inline context ──────────────────────────────────────────────────────
//
// Replaces the full JSON dump. A compact overview the model sees up-front;
// everything else is fetched via tools. openingHours + upcomingHolidays stay
// inline because the auto-scheduler reasons over them directly and they're tiny.

export function buildSlimContext(context: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = context as any;
  const teamNames = Array.isArray(c.team) ? c.team.map((m: Row) => m.name).filter(Boolean) : [];
  const roleNames = Array.isArray(c.roles) ? c.roles.map((r: Row) => r.name).filter(Boolean) : [];
  const lines = [
    c.storeName && `Store: ${c.storeName}`,
    c.today && `Today: ${c.today}`,
    `Opening hours: ${c.hoursStatus ?? "unknown"}`,
    c.openingHours && `Opening hours detail: ${JSON.stringify(c.openingHours)}`,
    Array.isArray(c.upcomingHolidays) && c.upcomingHolidays.length > 0 &&
      `Upcoming holidays: ${JSON.stringify(c.upcomingHolidays)}`,
    teamNames.length ? `Team (${teamNames.length}): ${teamNames.join(", ")}` : "Team: (none yet)",
    roleNames.length ? `Roles: ${roleNames.join(", ")}` : "Roles: (none yet)",
    Array.isArray(c.inventory) && `Inventory items on file: ${c.inventory.length}`,
    Array.isArray(c.products) && `Products on file: ${c.products.length}`,
  ].filter(Boolean);
  return lines.join("\n");
}

// ── Tool definitions ─────────────────────────────────────────────────────────

export function buildMerchivaTools(opts: { organizationId: string; today?: string }) {
  const { organizationId } = opts;
  const today = opts.today && /^\d{4}-\d{2}-\d{2}$/.test(opts.today)
    ? opts.today
    : new Date().toISOString().slice(0, 10);

  // Wrap each executor: open+subscribe the conn, log the call, and turn any
  // failure into a structured result the model can recover from (rather than
  // throwing, which would abort the whole generation).
  function exec<A>(label: string, fn: (conn: ServiceConn, args: A) => Promise<unknown>) {
    return async (args: A) => {
      try {
        const conn = await ready();
        const out = await fn(conn, args);
        console.log(`[store-ai/tool] ${label}(${JSON.stringify(args)}) →`, JSON.stringify(out).slice(0, 300));
        return out;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[store-ai/tool] ${label} failed:`, msg);
        return { error: "live store data unavailable", detail: msg };
      }
    };
  }

  return {
    viewTeam: tool({
      description:
        "List all team members with their job role. Call before scheduling shifts so addShift.staffName matches an existing member, or when the user asks who works here / how many staff. Includes loginable members (org_member) and placeholder staff (added by name).",
      inputSchema: z.object({}),
      execute: exec("viewTeam", async (conn) => {
        // Loginable team members carry their display name + role here.
        const members = orgRows(conn, "orgMember", organizationId).map((m) => ({
          name: m.displayName,
          role: m.role,
          hasPunchInCode: !!opt(m.punchInCode),
          source: "member" as const,
        }));
        // Placeholder/contractor rows added via addStaffMember (no login).
        const placeholders = orgRows(conn, "staffMember", organizationId).map((r) => ({
          name: r.name,
          role: r.role,
          hasPunchInCode: false,
          source: "placeholder" as const,
        }));
        return { team: [...members, ...placeholders] };
      }),
    }),

    viewRoles: tool({
      description:
        "List all roles/positions with ids, plus each role's tasks (id, title, times, requiresEvidence). Call before adding/editing roles or role tasks — updateRole/deleteRole/addRoleTask/updateRoleTask need these ids.",
      inputSchema: z.object({}),
      execute: exec("viewRoles", async (conn) => {
        const tasks = orgRows(conn, "roleTask", organizationId);
        return {
          roles: orgRows(conn, "staffRole", organizationId).map((r) => {
            const rid = rowId(r);
            return {
              id: rid,
              name: r.name,
              icon: r.icon,
              color: r.color,
              description: r.description,
              tasks: tasks
                .filter((t) => t.roleId === rid)
                .map((t) => ({
                  id: rowId(t),
                  title: t.title,
                  description: t.description,
                  startTime: opt(t.startTime),
                  endTime: opt(t.endTime),
                  requiresEvidence: !!t.requiresEvidence,
                })),
            };
          }),
        };
      }),
    }),

    viewScheduleHistory: tool({
      description:
        "Past shifts within the last N days (default 14). Use this to detect recurring patterns (who usually works which weekday/time) BEFORE auto-scheduling. Returns id, staffName, date, start, end, type, roles.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(90).optional().describe("How many days back to look. Default 14."),
      }),
      execute: exec("viewScheduleHistory", async (conn, { days }: { days?: number }) => {
        const since = addDays(today, -(days ?? 14));
        const shifts = orgRows(conn, "shift", organizationId)
          .filter((s) => typeof s.date === "string" && s.date >= since && s.date <= today)
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .slice(0, 200)
          .map(shiftView);
        return { since, today, count: shifts.length, shifts };
      }),
    }),

    viewUpcomingShifts: tool({
      description:
        "Today's and future shifts. Use to avoid double-booking, and to edit or delete a shift (returns shift ids needed for updateShift/deleteShift).",
      inputSchema: z.object({}),
      execute: exec("viewUpcomingShifts", async (conn) => {
        const shifts = orgRows(conn, "shift", organizationId)
          .filter((s) => typeof s.date === "string" && s.date >= today)
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .slice(0, 100)
          .map(shiftView);
        return { today, count: shifts.length, shifts };
      }),
    }),

    viewShiftPresets: tool({
      description: "Shift templates (name, startTime, endTime). Use when the user references a preset like \"morning shift\".",
      inputSchema: z.object({}),
      execute: exec("viewShiftPresets", async (conn) => ({
        presets: orgRows(conn, "shiftPreset", organizationId).map((p) => ({
          id: rowId(p),
          name: p.name,
          startTime: p.startTime,
          endTime: p.endTime,
        })),
      })),
    }),

    viewAvailability: tool({
      description:
        "Staff availability per weekday, plus pending time-off requests and pending shift trades. Call before auto-scheduling so you skip people who are unavailable or off.",
      inputSchema: z.object({}),
      execute: exec("viewAvailability", async (conn) => {
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        // userId (identity) → display name, from org members.
        const nameByUser = new Map<string, string>();
        for (const m of orgRows(conn, "orgMember", organizationId)) {
          nameByUser.set(idHex(m.userId), m.displayName);
        }
        const nameFor = (userId: unknown) => {
          const hex = idHex(userId);
          return nameByUser.get(hex) ?? hex;
        };
        // staff_availability.days is a JSON-encoded array (string), not a JS array.
        const parseDays = (raw: unknown): boolean[] => {
          if (Array.isArray(raw)) return raw as boolean[];
          if (typeof raw === "string") {
            try {
              const v = JSON.parse(raw);
              return Array.isArray(v) ? v : [];
            } catch {
              return [];
            }
          }
          return [];
        };
        const availability = orgRows(conn, "staffAvailability", organizationId).slice(0, 50).map((a) => ({
          staffName: nameFor(a.userId),
          type: a.type,
          availableDays: parseDays(a.days)
            .map((ok, i) => (ok ? dayNames[i] : null))
            .filter(Boolean),
          startDate: opt(a.startDate),
          endDate: opt(a.endDate),
        }));
        const timeOff = orgRows(conn, "timeOffRequest", organizationId)
          .filter((r) => r.status === "pending")
          .map((r) => ({
            id: rowId(r),
            staffName: nameFor(r.userId),
            startDate: r.startDate,
            endDate: r.endDate,
            fullDays: !!r.fullDays,
          }));
        const trades = orgRows(conn, "shiftTrade", organizationId)
          .filter((t) => t.status === "pending")
          .map((t) => ({ id: rowId(t), type: t.type, managerApproved: !!t.managerApproved }));
        return { availability, pendingTimeOff: timeOff, pendingShiftTrades: trades };
      }),
    }),

    viewInventory: tool({
      description:
        "Inventory items with stock levels and ordering specs (id, name, stock, min, max, unit, supplier, minOrderQty, unitsPerCase). Pass lowOnly=true for items at or below their minimum. Use the ids for restock / orderFromSupplier action blocks.",
      inputSchema: z.object({
        lowOnly: z.boolean().optional().describe("Only items at or below min stock."),
      }),
      execute: exec("viewInventory", async (conn, { lowOnly }: { lowOnly?: boolean }) => {
        let items = orgRows(conn, "inventoryItem", organizationId);
        if (lowOnly) items = items.filter((i) => Number(i.currentStock) <= Number(i.minStock));
        return {
          count: items.length,
          items: items.slice(0, 200).map((i) => ({
            id: rowId(i),
            name: i.name,
            category: i.category,
            stock: i.currentStock,
            min: i.minStock,
            max: i.maxStock,
            unit: i.unit,
            supplier: i.supplier,
            minOrderQty: opt(i.minOrderQty),
            unitsPerCase: opt(i.unitsPerCase),
            unitContentAmount: opt(i.unitContentAmount),
            unitContentUnit: opt(i.unitContentUnit),
          })),
        };
      }),
    }),

    viewSuppliers: tool({
      description:
        "Supplier records (id, name, contact, email, phone, language). orderFromSupplier needs the supplier id and language — match an inventory item's supplier NAME to a supplier here to get the id.",
      inputSchema: z.object({}),
      execute: exec("viewSuppliers", async (conn) => ({
        suppliers: orgRows(conn, "supplier", organizationId).map((s) => ({
          id: rowId(s),
          name: s.name,
          contactName: opt(s.contactName),
          email: opt(s.email),
          phone: opt(s.phone),
          language: opt(s.language) ?? "en",
        })),
      })),
    }),

    viewProducts: tool({
      description: "Menu/products (id, name, price, category, inventoryUsage). Use the id for updatePrice / product edits.",
      inputSchema: z.object({}),
      execute: exec("viewProducts", async (conn) => ({
        // product table no longer exists — retail-enabled inventory rows ARE the products
        products: productsFromInventoryRows(orgRows(conn, "inventoryItem", organizationId))
          .slice(0, 200)
          .map((p) => ({
            id: rowId(p),
            name: p.name,
            price: p.price,
            category: p.category,
            inventoryUsage: jsonArray(p.inventoryUsage),
          })),
      })),
    }),

    viewSales: tool({
      description: "Daily revenue for the last N days (default 14), for trend/anomaly analysis. Never invent revenue — fetch it here.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(90).optional().describe("How many days back. Default 14."),
      }),
      execute: exec("viewSales", async (conn, { days }: { days?: number }) => {
        const since = addDays(today, -(days ?? 14));
        const daily: Record<string, number> = {};
        for (const r of orgRows(conn, "salesRecord", organizationId)) {
          if (typeof r.date !== "string" || r.date < since) continue;
          daily[r.date] = (daily[r.date] ?? 0) + (Number(r.actual) || 0);
        }
        const series = Object.entries(daily)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([date, revenue]) => ({ date, revenue: Math.round(revenue * 100) / 100 }));
        return { since, today, daily: series };
      }),
    }),
  };
}

// Instruction block appended to the system prompt when tools are enabled.
export const TOOLS_PROMPT_BLOCK = `LIVE DATA ACCESS — READ TOOLS:
You start with only a brief STORE OVERVIEW (below). Before answering data questions or producing any \`\`\`action\`\`\` blocks, CALL THE READ TOOLS to fetch the current data you need. The tools return real row \`id\`s — you NEED those ids for updateShift/deleteShift/updateRole/deleteRole/addRoleTask/updateRoleTask/updatePrice/orderFromSupplier blocks.
- Scheduling ("排班"): call viewTeam, viewScheduleHistory, viewUpcomingShifts and viewAvailability (and viewShiftPresets if presets are referenced) BEFORE emitting addShift blocks.
- Roles / tasks: call viewRoles to get role ids and task ids.
- Inventory / restock: call viewInventory (lowOnly:true for shortages) and viewSuppliers.
- Supplier restock actions must pass suppliers[].language as supplierLanguage, include every item name, and include unitsPerCase/caseCount when ordering full cases.
- Pricing / products: call viewProducts.
- Sales / trends / anomalies: call viewSales.
Fetch only what the request needs — don't call every tool. NEVER invent ids, names, or numbers; if a tool returns an error, tell the user the live data is unavailable. After fetching, give your answer and any action blocks as usual.`;
