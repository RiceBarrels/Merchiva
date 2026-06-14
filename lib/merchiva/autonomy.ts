/**
 * Mr. Merchiva autonomy gate.
 *
 * Two orthogonal axes decide what the assistant may do:
 *   1. CAPABILITY  — "is it allowed to touch this at all?"  → reuses the existing
 *      Permissions model via the `can(section, action)` predicate the caller
 *      passes in. In foreground chat this is the *user's* permission ceiling;
 *      in the background path it will be Mr. Merchiva's own assigned permissions.
 *   2. AUTONOMY    — "of the things it's allowed to touch, which does it do
 *      silently vs. propose for one-click approval?" → this module, driven by a
 *      per-org, user-configurable {@link AutonomyConfig}.
 *
 * The hard risk classification (low/medium/high) and the required permission for
 * every action already live in the action registry, so this gate is a thin
 * decision layer on top of that metadata — it never re-classifies actions.
 *
 * The core {@link decideAutonomy} is a pure function (type-only imports) so it
 * is trivially unit-testable and safe to call server-side without pulling in any
 * browser-only client code. {@link gateAction} is the convenience wrapper that
 * resolves action metadata from the registry.
 */

import type { ActionCategory, RiskLevel } from "./action-registry";
import { getAction } from "./action-registry";

// ─── Config ──────────────────────────────────────────────────────────────────

/**
 * Global autonomy posture, from most cautious to most autonomous.
 * - `off`           — autonomy disabled; every write goes to an approval card
 *                     (today's behavior).
 * - `propose_only`  — same as off, but the assistant is "on" and may proactively
 *                     surface proposals; it still never executes on its own.
 * - `auto_low`      — low-risk actions run automatically; medium/high are proposed.
 * - `auto_low_medium` — low + medium run automatically; high is proposed.
 * - `full`          — everything the assistant is *permitted* to do runs
 *                     automatically (caps still apply).
 */
export type AutonomyMode =
  | "off"
  | "propose_only"
  | "auto_low"
  | "auto_low_medium"
  | "full";

/**
 * Hard ceilings that downgrade an otherwise-auto action to "propose" even when
 * the mode would allow it. A null/undefined cap means "no limit".
 */
export interface AutonomyCaps {
  /** Supplier orders / POs with a total above this must be approved. */
  maxAutoOrderValue?: number | null;
  /** Refunds above this amount must be approved. */
  maxAutoRefund?: number | null;
  /** Price changes whose magnitude exceeds this % of the old price must be approved. */
  maxPriceChangePct?: number | null;
  /** Soft cap on how many actions may auto-execute per day before falling back to propose. */
  dailyActionLimit?: number | null;
}

export interface AutonomyConfig {
  /** Master switch. When false, the gate proposes everything (current behavior). */
  enabled: boolean;
  /** Global posture; can be overridden per business category. */
  mode: AutonomyMode;
  /** Optional per-category overrides keyed by the registry's ActionCategory. */
  perCategory?: Partial<Record<ActionCategory, AutonomyMode>>;
  /** Hard spend/quantity ceilings. */
  caps?: AutonomyCaps;
}

/**
 * Default posture: low-risk actions auto-execute; medium and high are proposed
 * for one-click approval ("敏感操作需批准"). This is intentionally MORE cautious
 * than the legacy hardcoded policy (which silently auto-ran medium-risk writes
 * too). `enabled` acts as a kill switch — flip it false to pause autonomy and
 * route everything to approval. Conservative caps keep a fresh org from silently
 * spending or refunding a large amount.
 */
export const DEFAULT_AUTONOMY_CONFIG: AutonomyConfig = {
  enabled: true,
  mode: "auto_low",
  perCategory: {},
  caps: {
    maxAutoOrderValue: 200,
    maxAutoRefund: 0, // never auto-refund by default
    maxPriceChangePct: 10,
    dailyActionLimit: 30,
  },
};

/** Parse a config blob (JSON string or object) from storage, falling back to defaults. */
export function parseAutonomyConfig(raw: unknown): AutonomyConfig {
  if (!raw) return { ...DEFAULT_AUTONOMY_CONFIG };
  let parsed: Partial<AutonomyConfig> = {};
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as Partial<AutonomyConfig>;
    } catch {
      return { ...DEFAULT_AUTONOMY_CONFIG };
    }
  } else if (typeof raw === "object") {
    parsed = raw as Partial<AutonomyConfig>;
  }
  return {
    enabled: parsed.enabled ?? DEFAULT_AUTONOMY_CONFIG.enabled,
    mode: parsed.mode ?? DEFAULT_AUTONOMY_CONFIG.mode,
    perCategory: parsed.perCategory ?? {},
    caps: { ...DEFAULT_AUTONOMY_CONFIG.caps, ...(parsed.caps ?? {}) },
  };
}

// ─── Decision ──────────────────────────────────────────────────────────────────

export type GateDecision = "auto" | "propose" | "deny";

/** Minimal action metadata the gate needs — a subset of ActionDefinition. */
export interface ActionRiskMeta {
  name: string;
  category: ActionCategory;
  riskLevel: RiskLevel;
  requiredPermission?: { section: string; action: "view" | "edit" | "invite" };
}

export interface GateContext {
  /** How many actions have already auto-executed today (for the daily cap). */
  autoActionsToday?: number;
}

export interface GateResult {
  decision: GateDecision;
  /** Short human-readable rationale, surfaced in logs and the UI. */
  reason: string;
  riskLevel: RiskLevel;
  category: ActionCategory;
}

type CanFn = (section: string, action: "view" | "edit" | "invite") => boolean;

/** Does `mode` permit auto-executing an action at `risk`? */
function modeAllowsRisk(mode: AutonomyMode, risk: RiskLevel): boolean {
  switch (mode) {
    case "off":
    case "propose_only":
      return false;
    case "auto_low":
      return risk === "low";
    case "auto_low_medium":
      return risk === "low" || risk === "medium";
    case "full":
      return true;
    default:
      return false;
  }
}

/**
 * Returns the cap that an action would breach if auto-executed, or null if it's
 * within limits. Best-effort: when the necessary figure isn't present in
 * `params` (e.g. no price baseline) the cap is treated as not breached.
 */
function capBreach(
  meta: ActionRiskMeta,
  params: Record<string, unknown>,
  caps: AutonomyCaps | undefined,
  ctx: GateContext,
): string | null {
  if (!caps) return null;
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // Daily volume cap applies to any auto action.
  if (
    caps.dailyActionLimit != null &&
    (ctx.autoActionsToday ?? 0) >= caps.dailyActionLimit
  ) {
    return `daily auto-action limit (${caps.dailyActionLimit}) reached`;
  }

  // Supplier order / purchase order value.
  if (meta.name === "orderFromSupplier" || meta.name === "createPurchaseOrder") {
    if (caps.maxAutoOrderValue != null) {
      const total = num(params.total) ?? num(params.subtotal);
      if (total != null && total > caps.maxAutoOrderValue) {
        return `order total ${total} exceeds auto limit ${caps.maxAutoOrderValue}`;
      }
    }
  }

  // Refund amount.
  if (meta.name === "refundPayment") {
    if (caps.maxAutoRefund != null) {
      const amount = num(params.amount) ?? num(params.refundAmount);
      // No amount = full refund → always over a 0 cap.
      const effective = amount ?? Number.POSITIVE_INFINITY;
      if (effective > caps.maxAutoRefund) {
        return `refund ${amount ?? "full"} exceeds auto limit ${caps.maxAutoRefund}`;
      }
    }
  }

  // Price change magnitude (needs a baseline to compute %).
  if (meta.name === "updatePrice" || meta.name === "updateProduct") {
    if (caps.maxPriceChangePct != null) {
      const newPrice = num(params.newPrice) ?? num(params.price);
      const oldPrice =
        num(params.__oldPrice) ?? num(params.currentPrice) ?? num(params.oldPrice);
      if (newPrice != null && oldPrice != null && oldPrice > 0) {
        const pct = (Math.abs(newPrice - oldPrice) / oldPrice) * 100;
        if (pct > caps.maxPriceChangePct) {
          return `price change ${pct.toFixed(0)}% exceeds auto limit ${caps.maxPriceChangePct}%`;
        }
      }
    }
  }

  return null;
}

/**
 * Pure decision: given action metadata, params, config, a capability predicate
 * and runtime context, decide whether to auto-execute, propose for approval, or
 * deny outright. No imports beyond types — safe and testable anywhere.
 */
export function decideAutonomy(
  meta: ActionRiskMeta,
  params: Record<string, unknown>,
  config: AutonomyConfig,
  can: CanFn,
  ctx: GateContext = {},
): GateResult {
  const base = { riskLevel: meta.riskLevel, category: meta.category };

  // 1. Capability gate — the hard ceiling. No permission ⇒ can't do it at all.
  if (meta.requiredPermission) {
    const { section, action } = meta.requiredPermission;
    if (!can(section, action)) {
      return {
        ...base,
        decision: "deny",
        reason: `missing permission: ${section}.${action}`,
      };
    }
  }

  // 2. Autonomy off ⇒ everything is proposed (today's behavior, unchanged).
  if (!config.enabled || config.mode === "off") {
    return { ...base, decision: "propose", reason: "autonomy disabled" };
  }

  // 3. Resolve the effective mode (per-category override beats the global mode).
  const effectiveMode = config.perCategory?.[meta.category] ?? config.mode;

  if (!modeAllowsRisk(effectiveMode, meta.riskLevel)) {
    return {
      ...base,
      decision: "propose",
      reason: `${meta.riskLevel}-risk needs approval under "${effectiveMode}"`,
    };
  }

  // 4. Caps can still downgrade an otherwise-auto action to propose.
  const breach = capBreach(meta, params, config.caps, ctx);
  if (breach) {
    return { ...base, decision: "propose", reason: breach };
  }

  return { ...base, decision: "auto", reason: `auto (${effectiveMode})` };
}

/**
 * Convenience wrapper that resolves action metadata from the registry by name.
 * Unknown actions are proposed (never auto-run) so a model typo can't bypass
 * approval.
 */
export function gateAction(
  actionName: string,
  params: Record<string, unknown>,
  config: AutonomyConfig,
  can: CanFn,
  ctx: GateContext = {},
): GateResult {
  const def = getAction(actionName);
  if (!def) {
    return {
      decision: "propose",
      reason: "unknown action",
      riskLevel: "high",
      category: "notifications",
    };
  }
  return decideAutonomy(
    {
      name: def.name,
      category: def.category,
      riskLevel: def.riskLevel,
      requiredPermission: def.requiredPermission as ActionRiskMeta["requiredPermission"],
    },
    params,
    config,
    can,
    ctx,
  );
}
