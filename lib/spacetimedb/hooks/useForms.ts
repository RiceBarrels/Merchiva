"use client";

// Forms read hooks (design B.5).
//
//   useForms()               every form this identity may see in the active store, with its counters for builders
//   useForm(formId)          one form and its counters
//   useMyFormResponses()     the signed-in member's own responses (last 90 days), subscribed while mounted
//   useFormResponses(formId) one form's responses and review notes, subscribed while mounted
//   useFormAssignments()     the store's assignments, and the signed-in member's
//   useFormCompletions()     today's completions (who did which checklist), never answers
//   useCanManageForms()      owners and managers build forms (decision C2; no permission key)
//
// `form`, `form_meta`, `form_assignment` and `form_completion` come from the
// provider's isolated formSubscriptions batch (lib/spacetimedb/provider.tsx).
// Responses are never subscribed org-wide: an admin's RLS would stream every
// response of the store, so they are subscribed on demand, scoped to one form or
// to the member, and released on unmount (shared by every mounted reader).
//
// Rows are read from the connection's client cache (./formsLive.ts) rather than
// through `useTable`, which opens its own bare `SELECT * FROM <table>` and would
// undo those scopes (and the completions window).
//
// Works against a module without Forms: a zero-row probe over the Forms tables
// (lib/docs/backend-probe.ts) reports `not_published`, every hook then returns
// empty lists with `notPublished: true` and `isReady: true`, and nothing else is
// subscribed. The probe is sent after the provider's batch on the same socket, so
// once it applies the provider's Forms rows have arrived too.

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { usePermissions } from "@/lib/context/permissions";
import { dateKey, dateKeyOffset } from "@/lib/date-key";
import { DocsBackendMonitor, type DocsBackendStatus, type DocsProbeConnection } from "@/lib/docs/backend-probe";
import { docScopedSql } from "@/lib/docs/queries";
import {
  mapForm, mapFormAssignment, mapFormCompletion, mapFormMeta, mapFormResponse, mapFormResponseReview,
} from "@/lib/forms/mappers";
import type {
  FormAssignmentView, FormCompletionView, FormMetaView, FormResponseReviewView, FormResponseView, FormView,
} from "@/lib/forms/types";
import type { OrgRole } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { tables } from "@/lib/spacetimedb/generated";
import { useDeviceOperatorSession } from "@/lib/spacetimedb/hooks";
import { useCachedRows, useOnDemandSubscription } from "@/lib/spacetimedb/hooks/formsLive";
import { useLiveSpacetimeConnection, useSignedInMember } from "@/lib/spacetimedb/hooks/useDocs";

// ── Backend availability ─────────────────────────────────────────────────────

/** Client-cache accessors of the Forms tables a client reads (form_public is service-only). */
export const FORMS_TABLE_ACCESSORS = [
  "form", "formMeta", "formResponse", "formResponseReview", "formAssignment", "formCompletion",
] as const;
export type FormsTableAccessor = (typeof FORMS_TABLE_ACCESSORS)[number];

/** Whether `lib/spacetimedb/generated` contains the Forms tables. */
export const FORMS_BINDINGS_GENERATED: boolean = FORMS_TABLE_ACCESSORS.every((accessor) =>
  Boolean((tables as unknown as Record<string, unknown>)[accessor]),
);

/** Zero-row queries over every Forms table a client reads: they apply only when the module has all of them. */
export function formsProbeQueries(): string[] {
  return [
    docScopedSql("form", "id", ""),
    docScopedSql("form_meta", "form_id", ""),
    docScopedSql("form_response", "id", ""),
    docScopedSql("form_response_review", "response_id", ""),
    docScopedSql("form_assignment", "id", ""),
    docScopedSql("form_completion", "id", ""),
  ];
}

export type FormsBackendStatus = DocsBackendStatus;

const backendMonitor = new DocsBackendMonitor({ bindingsGenerated: FORMS_BINDINGS_GENERATED, queries: formsProbeQueries });

const getServerBackendStatus = (): FormsBackendStatus => (FORMS_BINDINGS_GENERATED ? "checking" : "not_published");

/** Whether Forms can be used against the current SpacetimeDB connection. */
export function useFormsBackendStatus(): FormsBackendStatus {
  const conn: DocsProbeConnection | null = useLiveSpacetimeConnection();
  const subscribe = useCallback((onChange: () => void) => backendMonitor.subscribe(conn, onChange), [conn]);
  const getSnapshot = useCallback((): FormsBackendStatus => backendMonitor.status(conn), [conn]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerBackendStatus);
}

// ── Who builds ───────────────────────────────────────────────────────────────

/** Owners and managers build, edit, assign and review forms (= isFormBuilder in spacetimedb/src/forms/access.ts). */
export function canManageForms(role: OrgRole | string | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

/** The current member builds forms. */
export function useCanManageForms(): boolean {
  const { role } = usePermissions();
  return canManageForms(role);
}

// ── Response queries ─────────────────────────────────────────────────────────

/** One form's responses and review notes (RLS: the respondent's own rows, or every row for a Drive admin). */
export function formResponseQueries(formId: string): string[] {
  const id = String(formId ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return [];
  return [
    docScopedSql("form_response", "form_id", id),
    docScopedSql("form_response_review", "form_id", id),
  ];
}

/** Days of the member's own responses useMyFormResponses keeps live. */
export const MY_FORM_RESPONSES_WINDOW_DAYS = 90;

/** The member's own responses since `sinceKey` (YYYY-MM-DD); [] for anything but a uuid member id or a date key. */
export function myFormResponseQueries(memberId: string, sinceKey: string): string[] {
  const id = String(memberId ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceKey)) return [];
  return [`${docScopedSql("form_response", "respondent_member_id", id)} AND "form_response"."date" >= '${sinceKey}'`];
}

// ── Hooks ────────────────────────────────────────────────────────────────────

interface FormsReadState {
  /** True once the rows can be trusted (also when Forms is not published: the lists are then final and empty). */
  isReady: boolean;
  /** The connected module has no Forms tables yet. */
  notPublished: boolean;
}

function useFormsReadState(): FormsReadState & { enabled: boolean } {
  const status = useFormsBackendStatus();
  return { enabled: status === "ready", isReady: status !== "checking", notPublished: status === "not_published" };
}

const byNewest = <T extends { updatedAt: Date }>(a: T, b: T): number => b.updatedAt.getTime() - a.updatedAt.getTime();

function useFormRows(enabled: boolean, organizationId: string | null): FormView[] {
  const rows = useCachedRows("form", enabled);
  return useMemo(
    () => (organizationId ? rows.map(mapForm).filter((f) => f.organizationId === organizationId).sort(byNewest) : []),
    [rows, organizationId],
  );
}

function useMetaById(enabled: boolean, organizationId: string | null): Map<string, FormMetaView> {
  const rows = useCachedRows("formMeta", enabled);
  return useMemo(() => {
    const out = new Map<string, FormMetaView>();
    if (!organizationId) return out;
    for (const row of rows) {
      const meta = mapFormMeta(row);
      if (meta.organizationId === organizationId) out.set(meta.formId, meta);
    }
    return out;
  }, [rows, organizationId]);
}

export interface FormListItem {
  form: FormView;
  /** Counters and the public token; null for anyone but a Drive admin (owner, manager, drive.view). */
  meta: FormMetaView | null;
}

export interface UseFormsResult extends FormsReadState {
  /** Every form this identity may see in the active store, newest first: builders see drafts and archived ones too. */
  forms: FormListItem[];
  canManage: boolean;
}

export function useForms(): UseFormsResult {
  const { organizationId } = usePermissions();
  const { enabled, isReady, notPublished } = useFormsReadState();
  const canManage = useCanManageForms();
  const forms = useFormRows(enabled, organizationId);
  const metaById = useMetaById(enabled, organizationId);
  const items = useMemo(() => forms.map((form) => ({ form, meta: metaById.get(form.id) ?? null })), [forms, metaById]);
  return { forms: items, canManage, isReady, notPublished };
}

export interface UseFormResult extends FormsReadState {
  /** null while loading, or when the form does not exist or is not visible to this identity. */
  form: FormView | null;
  meta: FormMetaView | null;
}

export function useForm(formId: string | null | undefined): UseFormResult {
  const { organizationId } = usePermissions();
  const { enabled, isReady, notPublished } = useFormsReadState();
  const forms = useFormRows(enabled, organizationId);
  const metaById = useMetaById(enabled, organizationId);
  const id = String(formId ?? "").trim().toLowerCase();
  const form = useMemo(() => (id ? (forms.find((f) => f.id === id) ?? null) : null), [forms, id]);
  return { form, meta: form ? (metaById.get(form.id) ?? null) : null, isReady, notPublished };
}

export interface UseFormResponsesResult extends FormsReadState {
  /** Newest first. */
  responses: FormResponseView[];
  /** Review notes by response id (Drive admins only; empty for everyone else). */
  reviews: Map<string, FormResponseReviewView>;
  /** The scoped subscription was refused (shown like an empty, failed load). */
  failed: boolean;
}

const byCreatedNewest = (a: FormResponseView, b: FormResponseView): number => b.createdAt.getTime() - a.createdAt.getTime();

/** One form's responses, subscribed while mounted. A respondent sees their own; a Drive admin every one. */
export function useFormResponses(formId: string | null | undefined): UseFormResponsesResult {
  const { organizationId } = usePermissions();
  const read = useFormsReadState();
  const id = String(formId ?? "").trim().toLowerCase();
  const queries = useMemo(() => (read.enabled && id ? formResponseQueries(id) : []), [read.enabled, id]);
  const sub = useOnDemandSubscription(queries.length ? queries : null);
  const responseRows = useCachedRows("formResponse", read.enabled);
  const reviewRows = useCachedRows("formResponseReview", read.enabled);
  const responses = useMemo(
    () => (id && organizationId
      ? responseRows.map(mapFormResponse).filter((r) => r.formId === id && r.organizationId === organizationId).sort(byCreatedNewest)
      : []),
    [responseRows, id, organizationId],
  );
  const reviews = useMemo(() => {
    const out = new Map<string, FormResponseReviewView>();
    for (const row of reviewRows) {
      const review = mapFormResponseReview(row);
      if (review.formId === id) out.set(review.responseId, review);
    }
    return out;
  }, [reviewRows, id]);
  const settled = !read.enabled || !id || queries.length === 0 || sub === "applied" || sub === "failed";
  return { responses, reviews, failed: sub === "failed", isReady: read.isReady && settled, notPublished: read.notPublished };
}

export interface UseMyFormResponsesResult extends FormsReadState {
  /** The signed-in member's own responses of the last MY_FORM_RESPONSES_WINDOW_DAYS days, newest first. */
  responses: FormResponseView[];
  failed: boolean;
}

/**
 * The signed-in identity's own responses (on /personal and /manager). A store tablet reads none: its account is not
 * the respondent, and checklists there read useFormCompletions instead (decision C7).
 */
export function useMyFormResponses(): UseMyFormResponsesResult {
  const { organizationId } = usePermissions();
  const read = useFormsReadState();
  const { memberId, ready: memberReady } = useSignedInMember();
  const since = useMemo(() => dateKeyOffset(-MY_FORM_RESPONSES_WINDOW_DAYS), []);
  const queries = useMemo(
    () => (read.enabled && memberId ? myFormResponseQueries(memberId, since) : []),
    [read.enabled, memberId, since],
  );
  const sub = useOnDemandSubscription(queries.length ? queries : null);
  const rows = useCachedRows("formResponse", read.enabled);
  const me = memberId?.toLowerCase() ?? "";
  const responses = useMemo(
    () => (me && organizationId
      ? rows.map(mapFormResponse)
        .filter((r) => r.respondentMemberId.toLowerCase() === me && r.organizationId === organizationId && r.date >= since)
        .sort(byCreatedNewest)
      : []),
    [rows, me, organizationId, since],
  );
  const settled = !read.enabled || (memberReady && (queries.length === 0 || sub === "applied" || sub === "failed"));
  return { responses, failed: sub === "failed", isReady: read.isReady && settled, notPublished: read.notPublished };
}

export interface UseFormAssignmentsResult extends FormsReadState {
  /** Every assignment in the active store. */
  assignments: FormAssignmentView[];
  /** The member's own: `forMemberId` (the PIN operator on /store), else the signed-in member. */
  mine: FormAssignmentView[];
}

export function useFormAssignments(forMemberId?: string | null): UseFormAssignmentsResult {
  const { organizationId } = usePermissions();
  const { enabled, isReady, notPublished } = useFormsReadState();
  const signedIn = useSignedInMember();
  const memberId = forMemberId || signedIn.memberId;
  const rows = useCachedRows("formAssignment", enabled);
  const assignments = useMemo(
    () => (organizationId ? rows.map(mapFormAssignment).filter((a) => a.organizationId === organizationId) : []),
    [rows, organizationId],
  );
  const me = memberId?.toLowerCase() ?? "";
  const mine = useMemo(() => (me ? assignments.filter((a) => a.memberId.toLowerCase() === me) : []), [assignments, me]);
  return { assignments, mine, isReady, notPublished };
}

export interface UseFormCompletionsResult extends FormsReadState {
  /** Completions dated `date` (default today, store-local), newest first. */
  completions: FormCompletionView[];
  /**
   * Every completion the provider keeps live (the last seven days), newest first: enough to tell whether a member
   * already answered a daily or weekly form in its current period. A `once` form answered earlier is not here.
   */
  recent: FormCompletionView[];
}

/** Who completed which form on one day (the provider keeps the last seven days live). Never carries answers. */
export function useFormCompletions(date?: string): UseFormCompletionsResult {
  const { organizationId } = usePermissions();
  const { enabled, isReady, notPublished } = useFormsReadState();
  const rows = useCachedRows("formCompletion", enabled);
  // Re-read each minute, so a tablet left on overnight rolls over to the new day.
  const today = dateKey(useNow(60_000));
  const day = date ?? today;
  const recent = useMemo(
    () => (organizationId
      ? rows.map(mapFormCompletion)
        .filter((c) => c.organizationId === organizationId)
        .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
      : []),
    [rows, organizationId],
  );
  const completions = useMemo(() => recent.filter((c) => c.date === day), [recent, day]);
  return { completions, recent, isReady, notPublished };
}

export interface FormUploadDevice {
  /** The signed-in account's role (on /store the tablet's, not the PIN operator's). */
  deviceAccountRole: OrgRole | null;
  /** This identity holds a device_operator_session in the active org; see FormUploadContext.holdsStoreSession. */
  holdsStoreSession: boolean;
}

/** What formFilesAllowed needs to agree with submitFormResponse about this device. */
export function useFormUploadDevice(): FormUploadDevice {
  const { organizationId } = usePermissions();
  const { role } = useSignedInMember();
  const [sessions] = useDeviceOperatorSession();
  const holdsStoreSession = useMemo(
    () => !!organizationId && (sessions as readonly { organizationId: string }[]).some((s) => s.organizationId === organizationId),
    [sessions, organizationId],
  );
  return { deviceAccountRole: role, holdsStoreSession };
}
