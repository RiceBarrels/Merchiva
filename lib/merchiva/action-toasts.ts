/**
 * The toasts an executed Mr. Merchiva action shows. Pure.
 *
 * The registry used to build them in English with the raw id as a fallback
 * ("Shift 95c5ca9c-… updated", "Punch-in code set for member <uuid>"). They
 * are now translated, and name the row by what the store calls it — resolved
 * BEFORE the action runs, since a delete removes the row it names.
 */

import { ActionError } from "@/lib/merchiva/action-error";

type Translate = (key: string) => string;

const UUID_ANY = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi;

/** The action's translated label, or its name when a locale lacks it. */
export function actionLabel(t: Translate, name: string): string {
  const label = t(`merchiva.actions.${name}`);
  return label.startsWith("merchiva.actions.") ? name : label;
}

/**
 * "Edit shift · Ana · 2026-09-30 · 09:00–17:00". `target` is what the action is
 * about (ref-labels.ts actionTarget), taken before it ran.
 */
export function actionSuccessText(
  t: Translate,
  params: Record<string, unknown>,
  target: string | null,
): string {
  const name = String(params.action ?? "");
  if (name === "orderFromSupplier") {
    return t(params.__emailed ? "merchiva.toast.orderEmailed" : "merchiva.toast.orderDraft");
  }
  const label = actionLabel(t, name);
  return target
    ? t("merchiva.toast.doneWithTarget").replace("{action}", label).replace("{target}", target)
    : t("merchiva.toast.done").replace("{action}", label);
}

/** A reducer's message, with any id in it cut out. */
export function scrubIds(message: string): string {
  return message.replace(UUID_ANY, "…");
}

export function actionFailureText(t: Translate, err: unknown): string {
  if (err instanceof ActionError) return t(`merchiva.toast.${err.key}`);
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (message.startsWith("Action not recognized")) return t("merchiva.toast.unknownAction");
  return t("merchiva.toast.failed").replace("{reason}", scrubIds(message).slice(0, 200));
}
