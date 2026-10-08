/**
 * Why the autonomy gate (lib/merchiva/autonomy.ts) decided what it did, as a
 * code plus the figures behind it — never a finished sentence. The approval
 * card renders it in the viewer's language with {@link gateReasonLabel}; the
 * English {@link gateReasonText} is for logs and tests. Pure, like the gate.
 */

import type { RiskLevel } from "./action-registry";
import type { AutonomyMode } from "./autonomy";
import { fmt } from "@/lib/i18n/fmt";

export type GateReason =
  | { code: "missingPermission"; section: string; action: string }
  | { code: "autonomyDisabled" }
  | { code: "riskNeedsApproval"; risk: RiskLevel; mode: AutonomyMode }
  | { code: "dailyLimit"; limit: number }
  | { code: "orderInvalidLines"; count: number }
  | { code: "orderUnpriced"; count: number }
  | { code: "orderOverCap"; total: number; limit: number }
  /** `amount` null is a full refund. */
  | { code: "refundOverCap"; amount: number | null; limit: number }
  /** `pct` is the change's magnitude, rounded to a whole percent. */
  | { code: "priceChangeOverCap"; pct: number; limit: number }
  | { code: "auto"; mode: AutonomyMode }
  | { code: "unknownAction" }
  /** A command the user typed: it runs as typed, whatever the config (role-task-gate.ts). */
  | { code: "userCommand" };

/** The reason in English, for logs and tests. The card shows {@link gateReasonLabel}. */
export function gateReasonText(why: GateReason): string {
  switch (why.code) {
    case "missingPermission":
      return `missing permission: ${why.section}.${why.action}`;
    case "autonomyDisabled":
      return "autonomy disabled";
    case "riskNeedsApproval":
      return `${why.risk}-risk needs approval under "${why.mode}"`;
    case "dailyLimit":
      return `daily auto-action limit (${why.limit}) reached`;
    case "orderInvalidLines":
      return `order has ${why.count} line(s) with a negative quantity or cost`;
    case "orderUnpriced":
      return `order value unknown: ${why.count} item(s) without a unit cost`;
    case "orderOverCap":
      return `order total ${why.total} exceeds auto limit ${why.limit}`;
    case "refundOverCap":
      return `refund ${why.amount ?? "full"} exceeds auto limit ${why.limit}`;
    case "priceChangeOverCap":
      return `price change ${why.pct}% exceeds auto limit ${why.limit}%`;
    case "auto":
      return `auto (${why.mode})`;
    case "unknownAction":
      return "unknown action";
    case "userCommand":
      return "user-typed command runs as typed";
  }
}

type Translate = (key: string) => string;

/** The mode under the name Settings gives it: approval required, partially or fully automatic. */
function modeLabel(mode: AutonomyMode, t: Translate): string {
  switch (mode) {
    case "full":
      return t("merchiva.autonomyReason.modes.full");
    case "auto_low":
    case "auto_low_medium":
      return t("merchiva.autonomyReason.modes.partial");
    default:
      return t("merchiva.autonomyReason.modes.approval");
  }
}

function riskLabel(risk: RiskLevel, t: Translate): string {
  switch (risk) {
    case "low":
      return t("merchiva.risk.low");
    case "medium":
      return t("merchiva.risk.medium");
    default:
      return t("merchiva.risk.high");
  }
}

/**
 * The reason in the viewer's language; `money` formats an amount in the org's
 * currency. Null for a code this build does not know (one persisted in chat
 * history by a newer build), so the caller can fall back to the stored English.
 */
export function gateReasonLabel(
  why: GateReason,
  t: Translate,
  money: (amount: number) => string,
): string | null {
  switch (why.code) {
    case "missingPermission":
      return t("merchiva.autonomyReason.missingPermission");
    case "autonomyDisabled":
      return t("merchiva.autonomyReason.autonomyDisabled");
    case "riskNeedsApproval":
      return fmt(t("merchiva.autonomyReason.riskNeedsApproval"), {
        risk: riskLabel(why.risk, t),
        mode: modeLabel(why.mode, t),
      });
    case "dailyLimit":
      return fmt(t("merchiva.autonomyReason.dailyLimit"), { limit: why.limit });
    case "orderInvalidLines":
      return fmt(t("merchiva.autonomyReason.orderInvalidLines"), { count: why.count });
    case "orderUnpriced":
      return fmt(t("merchiva.autonomyReason.orderUnpriced"), { count: why.count });
    case "orderOverCap":
      return fmt(t("merchiva.autonomyReason.orderOverCap"), {
        total: money(why.total),
        limit: money(why.limit),
      });
    case "refundOverCap":
      return why.amount == null
        ? fmt(t("merchiva.autonomyReason.refundFullOverCap"), { limit: money(why.limit) })
        : fmt(t("merchiva.autonomyReason.refundOverCap"), {
            amount: money(why.amount),
            limit: money(why.limit),
          });
    case "priceChangeOverCap":
      return fmt(t("merchiva.autonomyReason.priceChangeOverCap"), { pct: why.pct, limit: why.limit });
    case "auto":
      return fmt(t("merchiva.autonomyReason.auto"), { mode: modeLabel(why.mode, t) });
    case "unknownAction":
      return t("merchiva.autonomyReason.unknownAction");
    case "userCommand":
      return t("merchiva.autonomyReason.userCommand");
    default:
      return null;
  }
}
