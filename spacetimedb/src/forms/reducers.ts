// Form lifecycle reducers (design B.4): create, edit the definition and the
// settings, open/close/archive, the public link, transfer, delete, and member
// assignments. Submissions and reviews are ./responses.ts. index.ts wires both:
// `export const { … } = defineFormReducers(spacetimedb, driveDeps)`.
//
// A builder is an owner or manager by role (decision C2). Every reducer
// addressed by a form id answers `[forms.not_found]` to outsiders, so an id from
// another store reveals nothing. Everything is validated before the first write.

import type { DriveSchema } from '../drive/types';
import { driveAdminScopeOf } from '../drive/access-index';
import { activeDriveMember } from '../drive/context';
import { DRIVE_SERVICE_SCOPE } from '../drive/logic';
import { assertOrgStorageRoom } from '../drive/storage';
import {
  FORM_AUDIENCES, FORM_DEFAULT_RESPONSE_LIMIT, FORM_KINDS, FORM_MAX_FORMS_PER_ORG, FORM_MAX_RESPONSE_LIMIT,
  FORM_STATUSES, PER_MEMBER_RULES, answerableQuestions, checkDefinitionEdit, formIssueError, formMemberVisible,
  hasFileQuestions, isPublicSafe, isValidDateKey, parseDefinitionJson, serializeDefinition, utf8ByteLength,
  type FormDefinitionV1,
} from './logic';
import {
  addFormStorage, callerFormMember, formError, formMetaOf, isFormBuilder, isFormUuid, requireForm, requireFormEditor,
  type FormCtx, type FormDeps, type FormRow,
} from './access';
import { defineFormResponseReducers } from './responses';

const includes = (list: readonly string[], value: unknown): value is string =>
  typeof value === 'string' && list.includes(value);

/** A stored definition, re-validated (it was valid when written). */
function storedDefinition(deps: FormDeps, form: FormRow): FormDefinitionV1 {
  const parsed = parseDefinitionJson(form.definitionJson);
  if (!parsed.ok) throw new deps.SenderError(formIssueError(parsed.issues));
  return parsed.value;
}

/** The submitted definition, validated, or the first issue as `[forms.<code>]`. */
function submittedDefinition(deps: FormDeps, json: string): FormDefinitionV1 {
  const parsed = parseDefinitionJson(String(json ?? ''));
  if (!parsed.ok) throw new deps.SenderError(formIssueError(parsed.issues));
  return parsed.value;
}

/** The organization's display name for the public page (organization.orgIdText is the plain-string id). */
function storeNameOf(ctx: FormCtx, organizationId: string): string {
  for (const org of ctx.db.organization.byOrgIdText.filter(organizationId)) return org.name;
  return '';
}

/** A fresh public token: two uuid v4s without dashes, 64 lowercase hex. */
function newPublicToken(ctx: FormCtx): string {
  return `${ctx.newUuidV4().toString()}${ctx.newUuidV4().toString()}`.replace(/-/g, '').toLowerCase();
}

/** Bring the form_public copy in line with the form (no-op when the link is off). */
function refreshFormPublic(ctx: FormCtx, form: FormRow): void {
  const meta = ctx.db.formMeta.formId.find(form.id);
  const token = meta?.publicToken ?? '';
  for (const row of [...ctx.db.formPublic.byFormId.filter(form.id)]) {
    if (row.token !== token || !form.publicEnabled) ctx.db.formPublic.delete(row);
  }
  if (!form.publicEnabled || token === '') return;
  const row = {
    token, scope: DRIVE_SERVICE_SCOPE, formId: form.id, organizationId: form.organizationId,
    storeName: storeNameOf(ctx, form.organizationId), title: form.title, definitionJson: form.definitionJson,
    version: form.version, status: form.status, closesAt: form.closesAt, updatedAt: ctx.timestamp,
  };
  if (ctx.db.formPublic.token.find(token) != null) ctx.db.formPublic.token.update(row);
  else ctx.db.formPublic.insert(row);
}

/** Delete a form and everything hanging off it. Drive files of answers stay in respondents' My files (C9). */
function deleteFormCascade(ctx: FormCtx, form: FormRow): void {
  const meta = ctx.db.formMeta.formId.find(form.id);
  for (const r of [...ctx.db.formResponse.byFormId.filter(form.id)]) ctx.db.formResponse.delete(r);
  for (const a of [...ctx.db.formAssignment.byFormId.filter(form.id)]) ctx.db.formAssignment.delete(a);
  for (const c of [...ctx.db.formCompletion.byFormId.filter(form.id)]) ctx.db.formCompletion.delete(c);
  for (const p of [...ctx.db.formPublic.byFormId.filter(form.id)]) ctx.db.formPublic.delete(p);
  for (const v of [...ctx.db.formResponseReview.byFormId.filter(form.id)]) ctx.db.formResponseReview.delete(v);
  for (const m of [...ctx.db.formPeriodMark.byFormId.filter(form.id)]) ctx.db.formPeriodMark.delete(m);
  if (meta != null) ctx.db.formMeta.delete(meta);
  addFormStorage(ctx, form.organizationId, -(BigInt(form.definitionBytes) + (meta?.answerBytes ?? 0n)));
  ctx.db.form.delete(form);
}

export function defineFormReducers(spacetimedb: DriveSchema, deps: FormDeps) {
  const { t } = deps;

  /** A draft form for members, owned by the caller. Settings go through updateFormSettings. */
  const createForm = spacetimedb.reducer(
    { organizationId: t.string(), formId: t.string(), kind: t.string(), definitionJson: t.string() },
    (ctx, args) => {
      const member = callerFormMember(ctx, deps, args.organizationId);
      if (!isFormBuilder(member)) throw formError(deps, 'forbidden', 'Only owners and managers can create forms');
      const formId = String(args.formId ?? '');
      if (!isFormUuid(formId)) throw formError(deps, 'invalid', 'Invalid form id');
      if (ctx.db.form.id.find(formId) != null) throw formError(deps, 'exists', 'A form with this id already exists');
      if (!includes(FORM_KINDS, args.kind)) throw formError(deps, 'invalid_settings', 'Invalid form kind');
      const def = submittedDefinition(deps, args.definitionJson);
      if ([...ctx.db.form.byOrganizationId.filter(args.organizationId)].length >= FORM_MAX_FORMS_PER_ORG) {
        throw formError(deps, 'too_many_forms', 'This store has too many forms');
      }
      const definitionJson = serializeDefinition(def);
      const bytes = utf8ByteLength(definitionJson);
      assertOrgStorageRoom(ctx, deps, args.organizationId, BigInt(bytes));
      const memberId = member.id.toString();
      const form = ctx.db.form.insert({
        id: formId, organizationId: args.organizationId, adminScope: driveAdminScopeOf(ctx, args.organizationId),
        ownerMemberId: memberId, title: def.title, kind: args.kind, status: 'draft', audience: 'members',
        memberVisible: formMemberVisible('draft', 'members'), definitionJson, definitionBytes: bytes, version: 1,
        perMember: 'unlimited', responseLimit: FORM_DEFAULT_RESPONSE_LIMIT, closesAt: 0n, publicEnabled: false,
        hasFileQuestions: hasFileQuestions(def), trackCompletion: args.kind === 'checklist', notifyOwner: true,
        createdByMemberId: memberId, updatedByMemberId: memberId, createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
      });
      formMetaOf(ctx, form);
      addFormStorage(ctx, form.organizationId, BigInt(bytes));
    }
  );

  /**
   * Replace the definition. A stale `expectedVersion` is `[forms.conflict]`; once
   * the form has responses a question keeps its type and is archived, not removed
   * (checkDefinitionEdit). A form with its public link on never gains a file question.
   */
  const updateFormDefinition = spacetimedb.reducer(
    { formId: t.string(), definitionJson: t.string(), expectedVersion: t.u32() },
    (ctx, args) => {
      const form = requireForm(ctx, deps, args.formId);
      const member = requireFormEditor(ctx, deps, form);
      if (form.version !== args.expectedVersion) throw formError(deps, 'conflict', 'This form was changed by someone else');
      const next = submittedDefinition(deps, args.definitionJson);
      const meta = formMetaOf(ctx, form);
      const issues = checkDefinitionEdit(storedDefinition(deps, form), next, meta.responseCount > 0);
      if (issues.length > 0) throw new deps.SenderError(formIssueError(issues));
      if (form.publicEnabled && !isPublicSafe(next)) {
        throw formError(deps, 'public_unsafe', 'Turn off the public link before adding photo or file questions');
      }
      const definitionJson = serializeDefinition(next);
      const bytes = utf8ByteLength(definitionJson);
      const updated = ctx.db.form.id.update({
        ...form, title: next.title, definitionJson, definitionBytes: bytes, version: form.version + 1,
        hasFileQuestions: hasFileQuestions(next), updatedByMemberId: member.id.toString(), updatedAt: ctx.timestamp,
      });
      addFormStorage(ctx, form.organizationId, BigInt(bytes) - BigInt(form.definitionBytes));
      refreshFormPublic(ctx, updated);
    }
  );

  /** Audience, once/daily/weekly, response cap, closing time, completion tracking and owner notifications. */
  const updateFormSettings = spacetimedb.reducer(
    {
      formId: t.string(), audience: t.string(), perMember: t.string(), responseLimit: t.u32(), closesAt: t.u64(),
      trackCompletion: t.bool(), notifyOwner: t.bool(),
    },
    (ctx, args) => {
      const form = requireForm(ctx, deps, args.formId);
      const member = requireFormEditor(ctx, deps, form);
      if (!includes(FORM_AUDIENCES, args.audience)) throw formError(deps, 'invalid_settings', 'Invalid audience');
      if (!includes(PER_MEMBER_RULES, args.perMember)) throw formError(deps, 'invalid_settings', 'Invalid repeat rule');
      if (args.responseLimit < 1 || args.responseLimit > FORM_MAX_RESPONSE_LIMIT) {
        throw formError(deps, 'invalid_settings', 'Invalid response limit');
      }
      const updated = ctx.db.form.id.update({
        ...form, audience: args.audience, perMember: args.perMember, responseLimit: args.responseLimit,
        closesAt: args.closesAt, trackCompletion: args.trackCompletion, notifyOwner: args.notifyOwner,
        memberVisible: formMemberVisible(form.status, args.audience),
        updatedByMemberId: member.id.toString(), updatedAt: ctx.timestamp,
      });
      refreshFormPublic(ctx, updated);
    }
  );

  /** draft | open | closed | archived. Opening needs at least one answerable question. */
  const setFormStatus = spacetimedb.reducer(
    { formId: t.string(), status: t.string() },
    (ctx, args) => {
      const form = requireForm(ctx, deps, args.formId);
      const member = requireFormEditor(ctx, deps, form);
      if (!includes(FORM_STATUSES, args.status)) throw formError(deps, 'invalid_status', 'Invalid status');
      if (args.status === form.status) return;
      if (args.status === 'open' && answerableQuestions(storedDefinition(deps, form)).length === 0) {
        throw new deps.SenderError('[forms.no_questions] Add a question before opening the form');
      }
      const updated = ctx.db.form.id.update({
        ...form, status: args.status, memberVisible: formMemberVisible(args.status, form.audience),
        updatedByMemberId: member.id.toString(), updatedAt: ctx.timestamp,
      });
      refreshFormPublic(ctx, updated);
    }
  );

  /**
   * The anyone-with-the-link copy (decision C4). Only an organization owner turns
   * it on or rotates the token, and never for a form with photo/file questions;
   * whoever can edit the form may turn it off.
   */
  const setFormPublicLink = spacetimedb.reducer(
    { formId: t.string(), enabled: t.bool(), rotate: t.bool() },
    (ctx, args) => {
      const form = requireForm(ctx, deps, args.formId);
      const member = requireFormEditor(ctx, deps, form);
      const meta = formMetaOf(ctx, form);
      if (!args.enabled) {
        if (!form.publicEnabled && meta.publicToken === '') return;
        ctx.db.formMeta.formId.update({ ...meta, publicToken: '', updatedAt: ctx.timestamp });
        refreshFormPublic(ctx, ctx.db.form.id.update({ ...form, publicEnabled: false, updatedAt: ctx.timestamp }));
        return;
      }
      if (member.role !== 'owner') throw formError(deps, 'forbidden', 'Only the store owner can share a form publicly');
      if (form.hasFileQuestions || !isPublicSafe(storedDefinition(deps, form))) {
        throw formError(deps, 'public_unsafe', 'Forms with photo or file questions cannot be public');
      }
      if (form.publicEnabled && meta.publicToken !== '' && !args.rotate) return;
      const token = meta.publicToken === '' || args.rotate ? newPublicToken(ctx) : meta.publicToken;
      ctx.db.formMeta.formId.update({ ...meta, publicToken: token, updatedAt: ctx.timestamp });
      refreshFormPublic(ctx, ctx.db.form.id.update({
        ...form, publicEnabled: true, updatedByMemberId: member.id.toString(), updatedAt: ctx.timestamp,
      }));
    }
  );

  /** Hand a form (and the reading of its responses) to another owner or manager. */
  const transferForm = spacetimedb.reducer(
    { formId: t.string(), newOwnerMemberId: t.string() },
    (ctx, args) => {
      const form = requireForm(ctx, deps, args.formId);
      const member = requireFormEditor(ctx, deps, form);
      const next = activeDriveMember(ctx, form.organizationId, String(args.newOwnerMemberId ?? '').toLowerCase());
      if (!next || !isFormBuilder(next)) throw formError(deps, 'invalid', 'The new owner must be an owner or manager');
      const ownerMemberId = next.id.toString();
      if (ownerMemberId === form.ownerMemberId) return;
      ctx.db.form.id.update({ ...form, ownerMemberId, updatedByMemberId: member.id.toString(), updatedAt: ctx.timestamp });
      const meta = formMetaOf(ctx, form);
      ctx.db.formMeta.formId.update({ ...meta, ownerMemberId, updatedAt: ctx.timestamp });
      for (const r of [...ctx.db.formResponse.byFormId.filter(form.id)]) {
        ctx.db.formResponse.id.update({ ...r, formOwnerMemberId: ownerMemberId });
      }
    }
  );

  /** Delete the form, its responses, counters, public copy, assignments and completions. */
  const deleteForm = spacetimedb.reducer(
    { formId: t.string() },
    (ctx, args) => {
      const form = requireForm(ctx, deps, args.formId);
      requireFormEditor(ctx, deps, form);
      deleteFormCascade(ctx, form);
    }
  );

  /** Assign a form to one member (an 'assigned' audience form is answerable only by them). `dueDate` '' = none. */
  const assignForm = spacetimedb.reducer(
    { formId: t.string(), memberId: t.string(), dueDate: t.string() },
    (ctx, args) => {
      const form = requireForm(ctx, deps, args.formId);
      const member = requireFormEditor(ctx, deps, form);
      const target = activeDriveMember(ctx, form.organizationId, String(args.memberId ?? '').toLowerCase());
      if (!target) throw formError(deps, 'invalid', 'That person is not an active member of this store');
      const dueDate = String(args.dueDate ?? '');
      if (dueDate !== '' && !isValidDateKey(dueDate)) throw formError(deps, 'invalid', 'Invalid due date');
      const memberId = target.id.toString();
      const id = `${form.id}:${memberId}`;
      const existing = ctx.db.formAssignment.id.find(id);
      if (existing != null) {
        if (existing.dueDate !== dueDate) ctx.db.formAssignment.id.update({ ...existing, dueDate });
        return;
      }
      ctx.db.formAssignment.insert({
        id, organizationId: form.organizationId, formId: form.id, memberId, dueDate,
        createdByMemberId: member.id.toString(), createdAt: ctx.timestamp,
      });
    }
  );

  const unassignForm = spacetimedb.reducer(
    { formId: t.string(), memberId: t.string() },
    (ctx, args) => {
      const form = requireForm(ctx, deps, args.formId);
      requireFormEditor(ctx, deps, form);
      const existing = ctx.db.formAssignment.id.find(`${form.id}:${String(args.memberId ?? '').toLowerCase()}`);
      if (existing != null) ctx.db.formAssignment.delete(existing);
    }
  );

  return {
    createForm, updateFormDefinition, updateFormSettings, setFormStatus, setFormPublicLink, transferForm, deleteForm,
    assignForm, unassignForm, ...defineFormResponseReducers(spacetimedb, deps),
  };
}
