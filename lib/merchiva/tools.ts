/**
 * Mr. Merchiva read-tools — server-only.
 *
 * Native LLM tool calling (AI SDK v6) for Mr. Merchiva. These are READ-ONLY:
 * the model calls them to fetch live store data on demand (team, roles,
 * schedule history, inventory, sales, …) instead of receiving one giant
 * `LIVE STORE DATA` JSON dump up-front. WRITES stay as ```action``` blocks so
 * the existing approval-card UI and permission flow are untouched.
 *
 * Data is read AS THE CALLING MEMBER: each request gets its own source
 * (lib/merchiva/tools/sql-source.ts) that loads the store's tables with the
 * caller's token over the SQL endpoint, so row-level security returns what
 * that member's app shows. Without a token the caller skips tools (see
 * `merchivaToolsEnabled`) and falls back to the inline dump.
 *
 * Tools return real row ids, hyphenated as the client and the reducers match
 * them — every id an action block takes comes from one of them, under a name
 * that says which action parameter it is (lib/merchiva/tools/id-sources.ts).
 *
 * "Algorithms compute, AI explains": finance, forecast, restock and schedule
 * numbers come from the app's engines (lib/payroll + lib/money, lib/forecast,
 * lib/restock, lib/scheduler) through the engine tools in lib/merchiva/tools/.
 * The model only explains their output.
 */

import "server-only";

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { productsFromInventoryRows } from "@/lib/products/from-inventory";
import type { MerchivaToolName } from "@/lib/merchiva/tools/names";
import {
  canonicalUuid,
  idHex,
  jsonArray,
  opt,
  orgRows,
  rowId,
  type Row,
  type ToolContext,
  type ToolData,
  type ToolExec,
} from "@/lib/merchiva/tools/rows";
import { createSqlToolSource } from "@/lib/merchiva/tools/sql-source";
import type { ToolTable } from "@/lib/merchiva/tools/tool-tables";
import { addDaysToKey, resolveStoreToday, validTimeZone } from "@/lib/merchiva/tools/store-time";
import { roleViews, trainingViews } from "@/lib/merchiva/tools/view-roles";
import {
  VIEW_INVENTORY_DESCRIPTION,
  inventoryView,
  viewInventoryInput,
  type ViewInventoryArgs,
} from "@/lib/merchiva/tools/view-inventory";
import { VIEW_SALES_DESCRIPTION, salesFromRows, viewSalesInput, type ViewSalesArgs } from "@/lib/merchiva/tools/view-sales";
import { viewFinanceTool } from "@/lib/merchiva/tools/view-finance";
import { viewForecastTool } from "@/lib/merchiva/tools/view-forecast";
import { viewRestockSuggestionsTool } from "@/lib/merchiva/tools/view-restock-suggestions";
import { proposeScheduleTool } from "@/lib/merchiva/tools/propose-schedule";

/**
 * Tools read as the caller, so all they need is the caller's token — the one
 * the route just verified their membership with.
 */
export function merchivaToolsEnabled(token: string | null | undefined): boolean {
  return !!token;
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

/**
 * `today` is the store's calendar day the chat client sent (`context.today`,
 * from lib/date-key's `todayKey()` in the browser). `timeZone` is the store's
 * IANA zone when the client sends one; it only matters where an instant (a
 * payment, a punch) is split into days. Without either, the server's local
 * day stands in — see lib/merchiva/tools/store-time.ts for why the org's
 * `settings.timezone` is not trusted.
 *
 * `allowed` is the caller's permitted tools (allowedMerchivaTools in
 * lib/merchiva/tools/access.ts, from their verified membership). Every other
 * tool is left out of the returned set, so the model cannot call it.
 *
 * `token` is the caller's own token, verified against `organizationId` by the
 * route; every row the tools read is read with it. Build the set once per
 * request: its tools share the rows they load.
 */
export function buildMerchivaTools(opts: {
  token: string;
  organizationId: string;
  allowed: readonly MerchivaToolName[];
  today?: string;
  timeZone?: string;
}): ToolSet {
  const { organizationId } = opts;
  const timeZone = validTimeZone(opts.timeZone);
  const today = resolveStoreToday(opts.today, timeZone);
  const source = createSqlToolSource({ token: opts.token, organizationId, today });

  // Wrap each executor: load the tables it reads, log the call, and turn any
  // failure (an expired token, a failed query) into a structured result the
  // model can recover from (rather than throwing, which would abort the whole
  // generation).
  const exec: ToolExec = <A>(
    label: string,
    tables: readonly ToolTable[],
    fn: (data: ToolData, args: A) => Promise<unknown>,
  ) => {
    return async (args: A) => {
      try {
        const data = await source.load(tables);
        const out = await fn(data, args);
        console.log(`[store-ai/tool] ${label}(${JSON.stringify(args)}) →`, JSON.stringify(out).slice(0, 300));
        return out;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[store-ai/tool] ${label} failed:`, msg);
        return { error: "live store data unavailable", detail: msg };
      }
    };
  };
  const ctx: ToolContext = { organizationId, today, timeZone, exec };

  const tools = {
    viewTeam: tool({
      description:
        "The team roster with the ids the staff actions take. kind \"member\" has an app login: memberId is their org_member id (setPunchInCode, addShift.memberId). kind \"placeholder\" was added by name and has no login: staffMemberId is their staff_member id (updateStaffMember, deleteStaffMember). jobRole is the person's job title on the team page; accessLevel (owner/manager/staff) is an app permission level and never a job role — addShift.staffRoles come from viewRoles. Call before adding a single shift by hand (addShift.staffName must match a name here; a whole schedule comes from proposeSchedule), or when the user asks who works here.",
      inputSchema: z.object({}),
      execute: exec("viewTeam", ["orgMember", "staffMember"], async (data) => {
        // `org_member.role` holds a permission level or, set on the team page, a job role's name.
        const accessLevels = new Set(["owner", "manager", "staff"]);
        const members = orgRows(data, "orgMember", organizationId).map((m) => {
          const role = String(m.role ?? "");
          return {
            kind: "member" as const,
            memberId: rowId(m),
            name: m.displayName,
            ...(accessLevels.has(role.toLowerCase()) ? { accessLevel: role.toLowerCase() } : role ? { jobRole: role } : {}),
            // `punchInCode` is drained (the code lives in the self-scoped member_punch_code);
            // `hasPunchCode` is the flag the team page reads.
            hasPunchInCode: m.hasPunchCode === true,
            ...(m.status !== "active" ? { status: m.status } : {}),
          };
        });
        // Placeholder/contractor rows added via addStaffMember (no login).
        const placeholders = orgRows(data, "staffMember", organizationId).map((r) => ({
          kind: "placeholder" as const,
          staffMemberId: rowId(r),
          name: r.name,
          jobRole: r.role,
        }));
        return { team: [...members, ...placeholders] };
      }),
    }),

    viewRoles: tool({
      description:
        "Roles/positions and their tasks, plus the training curriculum. roles[].id is the roleId (updateRole, deleteRole, addRoleTask) and roles[].name is what addShift.staffRoles take; roles[].tasks[].id is the taskId (updateRoleTask, deleteRoleTask). training[] lists the curriculum days — dayId and dayNumber (updateTrainingDay, deleteTrainingDay, addTrainingObjective) — each with its objectives' objectiveId (updateTrainingObjective, deleteTrainingObjective).",
      inputSchema: z.object({}),
      execute: exec("viewRoles", ["staffRole", "roleTask", "trainingDay", "trainingObjective"], async (data) => ({
        roles: roleViews(orgRows(data, "staffRole", organizationId), orgRows(data, "roleTask", organizationId)),
        training: trainingViews(orgRows(data, "trainingDay", organizationId), orgRows(data, "trainingObjective", organizationId)),
      })),
    }),

    viewScheduleHistory: tool({
      description:
        "Past shifts within the last N days (default 14): who usually works which weekday and time. Returns id (the shiftId updateShift/deleteShift take), staffName, date, start, end, type, roles.",
      inputSchema: z.object({
        days: z.number().int().min(1).max(90).optional().describe("How many days back to look. Default 14."),
      }),
      execute: exec("viewScheduleHistory", ["shift"], async (data, { days }: { days?: number }) => {
        const since = addDaysToKey(today, -(days ?? 14));
        const shifts = orgRows(data, "shift", organizationId)
          .filter((s) => typeof s.date === "string" && s.date >= since && s.date <= today)
          .sort((a, b) => (a.date < b.date ? 1 : -1))
          .slice(0, 200)
          .map(shiftView);
        return { since, today, count: shifts.length, shifts };
      }),
    }),

    viewUpcomingShifts: tool({
      description:
        "Today's and future shifts. Use to avoid double-booking, and to edit or delete a shift: shifts[].id is the shiftId updateShift/deleteShift take.",
      inputSchema: z.object({}),
      execute: exec("viewUpcomingShifts", ["shift"], async (data) => {
        const shifts = orgRows(data, "shift", organizationId)
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
      execute: exec("viewShiftPresets", ["shiftPreset"], async (data) => ({
        presets: orgRows(data, "shiftPreset", organizationId).map((p) => ({
          id: rowId(p),
          name: p.name,
          startTime: p.startTime,
          endTime: p.endTime,
        })),
      })),
    }),

    viewAvailability: tool({
      description:
        "Staff availability per weekday, plus pending time-off requests (requestId for approveTimeOff) and pending shift trades (tradeId for approveShiftTrade). proposeSchedule already applies availability and time off itself.",
      inputSchema: z.object({}),
      execute: exec("viewAvailability", ["orgMember", "staffAvailability", "timeOffRequest", "shiftTrade"], async (data) => {
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        // userId (identity) → display name, and org_member id → display name, from org members.
        const nameByUser = new Map<string, string>();
        const nameByMember = new Map<string, string>();
        for (const m of orgRows(data, "orgMember", organizationId)) {
          nameByUser.set(idHex(m.userId), m.displayName);
          nameByMember.set(canonicalUuid(rowId(m)), m.displayName);
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
        const availability = orgRows(data, "staffAvailability", organizationId).slice(0, 50).map((a) => ({
          staffName: nameFor(a.userId),
          type: a.type,
          availableDays: parseDays(a.days)
            .map((ok, i) => (ok ? dayNames[i] : null))
            .filter(Boolean),
          startDate: opt(a.startDate),
          endDate: opt(a.endDate),
        }));
        const timeOff = orgRows(data, "timeOffRequest", organizationId)
          .filter((r) => r.status === "pending")
          .map((r) => ({
            requestId: rowId(r),
            staffName: nameFor(r.userId),
            startDate: r.startDate,
            endDate: r.endDate,
            fullDays: !!r.fullDays,
          }));
        const trades = orgRows(data, "shiftTrade", organizationId)
          .filter((t) => t.status === "pending")
          .map((t) => ({
            tradeId: rowId(t),
            requester: nameByMember.get(canonicalUuid(t.requesterId)) ?? null,
            type: t.type,
            managerApproved: !!t.managerApproved,
          }));
        return { availability, pendingTimeOff: timeOff, pendingShiftTrades: trades };
      }),
    }),

    viewInventory: tool({
      description: VIEW_INVENTORY_DESCRIPTION,
      inputSchema: viewInventoryInput,
      execute: exec("viewInventory", ["inventoryItem"], async (data, args: ViewInventoryArgs) =>
        inventoryView(orgRows(data, "inventoryItem", organizationId), args ?? {}),
      ),
    }),

    viewSuppliers: tool({
      description:
        "Supplier records (id, name, contact, email, phone, language). suppliers[].id is the supplierId orderFromSupplier, createPurchaseOrder, updateSupplier and deleteSupplier take — match an inventory item's supplier NAME to a supplier here to get it.",
      inputSchema: z.object({}),
      execute: exec("viewSuppliers", ["supplier"], async (data) => ({
        suppliers: orgRows(data, "supplier", organizationId).map((s) => ({
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
      description: "Menu/products (id, name, price, category, inventoryUsage). products[].id is the productId updatePrice, updateProduct and deleteProduct take.",
      inputSchema: z.object({}),
      execute: exec("viewProducts", ["inventoryItem"], async (data) => ({
        // product table no longer exists — retail-enabled inventory rows ARE the products
        products: productsFromInventoryRows(orgRows(data, "inventoryItem", organizationId))
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
      description: VIEW_SALES_DESCRIPTION,
      inputSchema: viewSalesInput,
      execute: exec("viewSales", ["payment", "salesRecord", "settings"], async (data, args: ViewSalesArgs) =>
        salesFromRows(
          {
            salesRecord: orgRows(data, "salesRecord", organizationId),
            payment: orgRows(data, "payment", organizationId),
            settings: orgRows(data, "settings", organizationId)[0],
          },
          today,
          timeZone,
          args ?? {},
        ),
      ),
    }),

    // ── Engine tools: the numbers come from the app's algorithms. ──
    viewFinance: viewFinanceTool(ctx),
    viewForecast: viewForecastTool(ctx),
    viewRestockSuggestions: viewRestockSuggestionsTool(ctx),
    proposeSchedule: proposeScheduleTool(ctx),
    // Compile-time check: the keys are exactly MERCHIVA_TOOL_NAMES (missing or extra both fail).
  } satisfies Record<MerchivaToolName, unknown>;

  const allowed = new Set<string>(opts.allowed);
  return Object.fromEntries(Object.entries(tools).filter(([name]) => allowed.has(name))) as ToolSet;
}

// The read-tool guide for the system prompt is built per caller from the tools
// they were given: buildToolsPromptBlock in lib/merchiva/tools/prompt.ts.
