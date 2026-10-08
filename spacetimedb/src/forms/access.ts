// Who may do what with a form (design B.4): errors, row lookups, the builder
// check, the respondent (a tablet acting for its operator), and the shared
// counter / storage writes of the form reducers.
//
// Runtime imports: only pure module files (../drive/{context,access-index,
// logic,storage} and ./logic), never ../index.ts, so Bun tests load this file
// directly; index.ts values arrive through FormDeps (the Drive deps).

import type { DriveDeps } from '../drive/context';
import { activeDriveMember, callerDriveMember, operatorSessionFresh } from '../drive/context';
import { syncDriveAdminIndex } from '../drive/access-index';
import { driveAccessOf, isOrgAdminRole } from '../drive/logic';
import { addOrgStorageUsage } from '../drive/storage';
import type { DriveCtx, MemberRow } from '../drive/types';
import { DRIVE_ITEM_ID_RE } from './logic';

export type FormDeps = DriveDeps;
export type FormCtx = DriveCtx;
type Db = FormCtx['db'];
export type FormRow = NonNullable<ReturnType<Db['form']['id']['find']>>;
export type FormMetaRow = NonNullable<ReturnType<Db['formMeta']['formId']['find']>>;
export type FormResponseRow = NonNullable<ReturnType<Db['formResponse']['id']['find']>>;

/** Codes beyond the validation issues (FormIssueCode); lib/forms maps both to copy. */
export type FormErrorCode =
  | 'forbidden' | 'not_found' | 'invalid' | 'exists' | 'conflict' | 'operator' | 'not_open' | 'closed'
  | 'not_assigned' | 'invalid_date' | 'already_submitted' | 'response_limit' | 'too_many_forms'
  | 'org_storage_full' | 'file_not_found' | 'files_not_allowed' | 'public_unsafe' | 'rate_limited'
  | 'invalid_settings' | 'invalid_status';

/** `[forms.<code>] message`. */
export function formError(deps: Pick<FormDeps, 'SenderError'>, code: FormErrorCode, message: string): Error {
  return new deps.SenderError(`[forms.${code}] ${message}`);
}

/** Client-generated ids: lowercase UUID v4 (the Drive item id shape). */
export function isFormUuid(value: unknown): value is string {
  return typeof value === 'string' && DRIVE_ITEM_ID_RE.test(value);
}

/** Owners and managers build forms (decision C2: by role, no permission key). */
export function isFormBuilder(member: { role: string }): boolean {
  return isOrgAdminRole(member.role);
}

/** A builder may edit a form they own, or any form of the org with the Drive edit power (owner/manager by role). */
export function canEditForm(member: MemberRow, form: FormRow): boolean {
  if (!isFormBuilder(member) || member.organizationId !== form.organizationId) return false;
  return form.ownerMemberId === member.id.toString() || driveAccessOf(member).edit;
}

/** The form with this id, or `[forms.not_found]`. */
export function requireForm(ctx: FormCtx, deps: FormDeps, formId: string): FormRow {
  const form = isFormUuid(formId) ? ctx.db.form.id.find(formId) : null;
  if (form == null) throw formError(deps, 'not_found', 'Form not found');
  return form;
}

/** The form's form_meta row (inserted by createForm; re-created with zeros if ever missing). */
export function formMetaOf(ctx: FormCtx, form: FormRow): FormMetaRow {
  const meta = ctx.db.formMeta.formId.find(form.id);
  if (meta != null) return meta;
  return ctx.db.formMeta.insert({
    formId: form.id, organizationId: form.organizationId, adminScope: form.adminScope,
    ownerMemberId: form.ownerMemberId, publicToken: '', responseCount: 0, answerBytes: 0n, fileBytes: 0n,
    fileCount: 0, lastResponseAt: 0n, publicWindowStart: 0n, publicWindowCount: 0, updatedAt: ctx.timestamp,
    publicResponseCount: 0, publicAnswerBytes: 0n, publicPrevWindowCount: 0,
  });
}

/**
 * ctx.sender's active member row in the organization, with its drive_admin_index
 * row self-healed (the admin read rules of form, form_meta and form_response join
 * it). `outsider` is the code for a non-member: 'not_found' for reducers
 * addressed by a row id, so an id from another organization reveals nothing.
 */
export function callerFormMember(
  ctx: FormCtx, deps: FormDeps, organizationId: string, outsider: 'forbidden' | 'not_found' = 'forbidden',
): MemberRow {
  const member = callerDriveMember(ctx, organizationId);
  if (!member) throw formError(deps, outsider, 'Not an active member of this organization');
  syncDriveAdminIndex(ctx, member, deps.docMemberGate);
  return member;
}

/** The caller, who must be able to edit `form`; `[forms.not_found]` to outsiders, `[forms.forbidden]` to others. */
export function requireFormEditor(ctx: FormCtx, deps: FormDeps, form: FormRow): MemberRow {
  const member = callerFormMember(ctx, deps, form.organizationId, 'not_found');
  if (!canEditForm(member, form)) throw formError(deps, 'forbidden', 'Only the form owner or a manager can change this form');
  return member;
}

export interface FormRespondent {
  caller: MemberRow;
  respondent: MemberRow;
  /** A store tablet answering for its PIN/QR operator. */
  acting: boolean;
}

/**
 * Who a submission is by (B.4 check 1). '' or the caller's own member id → the
 * caller. Otherwise the tablet acts for its operator: an active member of the
 * org, and only when the caller is an owner/manager or ctx.sender's
 * device_operator_session names that member within its TTL (as Drive does).
 */
export function resolveFormRespondent(
  ctx: FormCtx, deps: FormDeps, organizationId: string, actingMemberId: string,
): FormRespondent {
  const caller = callerFormMember(ctx, deps, organizationId);
  const actingId = String(actingMemberId ?? '').trim().toLowerCase();
  if (actingId === '' || actingId === caller.id.toString()) return { caller, respondent: caller, acting: false };
  const respondent = activeDriveMember(ctx, organizationId, actingId);
  if (!respondent) throw formError(deps, 'operator', 'That person is not an active member of this store');
  if (!isOrgAdminRole(caller.role) && !operatorSessionFresh(ctx, deps, organizationId, actingId)) {
    throw formError(deps, 'operator', 'Enter your PIN again to continue');
  }
  return { caller, respondent, acting: true };
}

/**
 * The organization's stored response bytes (≤ FORM_MAX_FORMS_PER_ORG rows), split in two budgets: `member` (members'
 * responses and every review note, cap FORM_MAX_ORG_ANSWER_BYTES) and `public` (anonymous responses, cap
 * FORM_MAX_ORG_PUBLIC_ANSWER_BYTES), so public traffic can never use up what members need.
 */
export function orgFormAnswerBytes(ctx: FormCtx, organizationId: string): { member: bigint; public: bigint } {
  let all = 0n;
  let pub = 0n;
  for (const meta of ctx.db.formMeta.byOrganizationId.filter(organizationId)) {
    all += meta.answerBytes;
    pub += meta.publicAnswerBytes;
  }
  return { member: all > pub ? all - pub : 0n, public: pub };
}

/**
 * Whether ctx.sender is used as a store tablet in this organization: it holds a
 * device_operator_session there (any age — a PIN or QR unlock ever happened on it
 * and it was not locked since). A server-side signal for decision C6b on top of
 * the client's `surface` / actingMemberId; a tablet whose session was cleared and
 * that claims another surface is still indistinguishable from a phone.
 */
export function senderIsStoreDevice(ctx: FormCtx, organizationId: string): boolean {
  const session = ctx.db.deviceOperatorSession.identity.find(ctx.sender);
  return session != null && session.organizationId === organizationId;
}

/**
 * Form text is module-resident content like a document's, so it counts in
 * org_storage_usage.docBytes (never docCount): definitions and stored answers.
 * recomputeOrgStorage adds the same sums back (formStoredBytes).
 */
export function addFormStorage(ctx: FormCtx, organizationId: string, bytes: bigint): void {
  addOrgStorageUsage(ctx, organizationId, { docBytes: bytes });
}
