/**
 * Shared list/edit helpers: status tones, the builder and respondent filters, and "is this form waiting for me".
 * Pure; no React.
 */
import type { StatusTone } from "@/components/ui/status-badge";
import { formPeriod } from "@/lib/forms/period";
import type { FormAssignmentView, FormResponseView, FormStatus, FormView, ReviewStatus } from "@/lib/forms/types";

export const FORM_STATUS_TONE: Record<FormStatus, StatusTone> = {
  draft: "neutral",
  open: "success",
  closed: "warning",
  archived: "neutral",
};

export const REVIEW_STATUS_TONE: Record<ReviewStatus, StatusTone> = {
  new: "info",
  reviewed: "success",
};

/** Builder filters (`forms.list.filter.<key>`), mapped one to one onto statuses. */
export const BUILDER_FILTERS = ["active", "drafts", "closed", "archived"] as const;
export type BuilderFilter = (typeof BUILDER_FILTERS)[number];

/** Respondent filters (`forms.list.filter.<key>`). */
export const RESPONDENT_FILTERS = ["toFill", "mine"] as const;
export type RespondentFilter = (typeof RESPONDENT_FILTERS)[number];

export const FILTER_STATUS: Record<BuilderFilter, FormStatus> = {
  active: "open",
  drafts: "draft",
  closed: "closed",
  archived: "archived",
};

/** Open and not past its closing time. */
export function isAcceptingAt(form: FormView, now: Date): boolean {
  return form.status === "open" && (form.closesAt === null || form.closesAt.getTime() > now.getTime());
}

/** The member may answer `form`: it is open to every member, or assigned to them. */
export function isFormForMember(form: FormView, assignments: readonly FormAssignmentView[], memberId: string | null): boolean {
  if (!form.memberVisible) return false;
  if (form.audience === "members") return true;
  if (form.audience !== "assigned" || !memberId) return false;
  const me = memberId.toLowerCase();
  return assignments.some((a) => a.formId === form.id && a.memberId.toLowerCase() === me);
}

/**
 * The member already answered `form` for its current period (once / today / this week). An `unlimited` form is
 * never "done": it stays in To fill while it is open.
 */
export function isDoneThisPeriod(form: FormView, mine: readonly FormResponseView[], now: Date): boolean {
  if (form.perMember === "unlimited") return false;
  const period = formPeriod(form.perMember, now);
  return mine.some((r) => r.formId === form.id && r.period === period);
}

/** The member's due date for an assigned form ('' for none). */
export function dueDateOf(form: FormView, assignments: readonly FormAssignmentView[], memberId: string | null): string {
  if (!memberId) return "";
  const me = memberId.toLowerCase();
  return assignments.find((a) => a.formId === form.id && a.memberId.toLowerCase() === me)?.dueDate ?? "";
}

/** Edit page views: builders get build / preview / responses / share; everyone else only their own responses. */
export const BUILDER_VIEWS = ["build", "preview", "responses", "share"] as const;
export const RESPONDENT_VIEWS = ["responses"] as const;
export type FormEditView = (typeof BUILDER_VIEWS)[number];

/** `/manager/forms/edit?id=<id>&view=<view>` (a static path plus query, for the static export). */
export function formEditHref(formId: string, view?: FormEditView): string {
  const params = new URLSearchParams({ id: formId });
  if (view) params.set("view", view);
  return `/manager/forms/edit?${params.toString()}`;
}

/** `/manager/forms/fill?id=<id>`: answer the form on /manager. */
export function formFillHref(formId: string): string {
  return `/manager/forms/fill?${new URLSearchParams({ id: formId }).toString()}`;
}
