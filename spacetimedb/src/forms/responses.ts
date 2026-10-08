// Form submissions (design B.4): a member's (or a store tablet's operator's)
// response, the public anyone-with-the-link response through the service
// identity, and the owner's review / delete. Wired from ./reducers.ts.
//
// Responses are readable by the respondent and Drive admins (decision C5; every
// builder is one by role, so a demoted form owner loses them); review notes by
// Drive admins only; the tablet that submitted one cannot read it back (C7). The
// respondent's identity is always stored (C14). File and photo answers are
// ready Drive items in the respondent's My files, never bytes (C6), and are
// refused on a staff-account store tablet.

import type { DriveSchema } from '../drive/types';
import { isOrgAdminRole } from '../drive/logic';
import { assertOrgStorageRoom } from '../drive/storage';
import {
  FORM_MAX_ORG_ANSWER_BYTES, FORM_MAX_ORG_PUBLIC_ANSWER_BYTES, FORM_MAX_REVIEW_NOTE_LENGTH,
  FORM_RESPONSE_ROW_OVERHEAD_BYTES, REVIEW_STATUSES, answerFileItemIds, formIssueError, formPeriodForDateKey,
  isDateKeyNear, isFormPublicToken, nextPublicWindow, parseAnswersJson, parseDefinitionJson, textLength,
  utf8ByteLength, type Answers, type FormDefinitionV1, type PerMemberRule, type PublicWindow,
} from './logic';
import {
  addFormStorage, callerFormMember, canEditForm, formError, formMetaOf, isFormBuilder, isFormUuid,
  orgFormAnswerBytes, requireForm, resolveFormRespondent, senderIsStoreDevice, type FormCtx, type FormDeps,
  type FormMetaRow, type FormResponseRow, type FormRow,
} from './access';

const MEMBER_SOURCES: readonly string[] = ['manager', 'store', 'personal'];
const NAME_SNAPSHOT_MAX = 120;
const NOTIFY_BODY_MAX = 200;

/** A replay of `responseId` by the same sender for the same form is a no-op (true); any other reuse is an error. */
function isReplay(ctx: FormCtx, deps: FormDeps, responseId: string, formId: string): boolean {
  const existing = ctx.db.formResponse.id.find(responseId);
  if (existing == null) return false;
  if (existing.formId === formId && existing.submittedByIdentity.isEqual(ctx.sender)) return true;
  throw formError(deps, 'exists', 'A response with this id already exists');
}

/** B.4 check 2: open, and not past closesAt by the reducer's clock. */
function assertOpen(deps: FormDeps, form: FormRow, nowMicros: bigint): void {
  if (form.status !== 'open') throw formError(deps, 'not_open', 'This form is not open');
  if (form.closesAt !== 0n && nowMicros >= form.closesAt) throw formError(deps, 'closed', 'This form is closed');
}

function definitionOf(deps: FormDeps, form: FormRow): FormDefinitionV1 {
  const parsed = parseDefinitionJson(form.definitionJson);
  if (!parsed.ok) throw new deps.SenderError(formIssueError(parsed.issues));
  return parsed.value;
}

/**
 * B.4 check 6: the answers, the form's response cap and the store's byte cap. Members and the public link have
 * separate budgets: members count only members' responses against `responseLimit` and FORM_MAX_ORG_ANSWER_BYTES;
 * the public link stops at `responseLimit` responses in all and at FORM_MAX_ORG_PUBLIC_ANSWER_BYTES store-wide, and
 * never pushes the store over its Drive quota. A response is charged its answersJson plus a fixed row overhead.
 */
function checkAnswers(
  ctx: FormCtx, deps: FormDeps, form: FormRow, meta: FormMetaRow, def: FormDefinitionV1, json: string,
  o: { allowFiles: boolean; isPublic: boolean },
): { answers: Answers; answersJson: string; answerBytes: number } {
  const parsed = parseAnswersJson(def, String(json ?? ''), { allowFiles: o.allowFiles });
  if (!parsed.ok) throw new deps.SenderError(formIssueError(parsed.issues));
  const counted = o.isPublic ? meta.responseCount : meta.responseCount - meta.publicResponseCount;
  if (counted >= form.responseLimit) throw formError(deps, 'response_limit', 'This form takes no more responses');
  const answersJson = JSON.stringify(parsed.value);
  const answerBytes = utf8ByteLength(answersJson) + FORM_RESPONSE_ROW_OVERHEAD_BYTES;
  const used = orgFormAnswerBytes(ctx, form.organizationId);
  const [inUse, cap] = o.isPublic
    ? [used.public, FORM_MAX_ORG_PUBLIC_ANSWER_BYTES] : [used.member, FORM_MAX_ORG_ANSWER_BYTES];
  if (inUse + BigInt(answerBytes) > BigInt(cap)) {
    throw formError(deps, 'org_storage_full', 'This store has no room for more form answers');
  }
  if (o.isPublic) assertOrgStorageRoom(ctx, deps, form.organizationId, BigInt(answerBytes));
  return { answers: parsed.value, answersJson, answerBytes };
}

/**
 * B.4 check 7: every referenced file is a ready, untrashed file in the
 * respondent's My files of this organization (a photo answer an image); the
 * sizes come from those rows, never from the client.
 */
function checkFiles(
  ctx: FormCtx, deps: FormDeps, form: FormRow, def: FormDefinitionV1, answers: Answers, respondentId: string,
): { ids: string[]; bytes: bigint } {
  const ids = answerFileItemIds(answers);
  const photoIds = new Set<string>();
  for (const q of def.questions) {
    const value = answers[q.id];
    if (q.type === 'photo' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const id of value.driveItemIds) photoIds.add(id);
    }
  }
  let bytes = 0n;
  for (const id of ids) {
    const item = isFormUuid(id) ? ctx.db.driveItem.id.find(id) : null;
    if (item == null || item.organizationId !== form.organizationId || item.kind !== 'file' || item.status !== 'ready'
        || item.trashed || item.space !== 'my' || item.ownerMemberId !== respondentId
        || (photoIds.has(id) && !item.mimeType.startsWith('image/'))) {
      throw formError(deps, 'file_not_found', 'An attached file is missing');
    }
    bytes += item.sizeBytes;
  }
  return { ids, bytes };
}

/** Tell the form owner (when they asked to be told, still build forms, and did not answer themselves). */
function notifyFormOwner(ctx: FormCtx, deps: FormDeps, form: FormRow, respondentMemberId: string, who: string): void {
  if (!form.notifyOwner || form.ownerMemberId === respondentMemberId) return;
  for (const m of ctx.db.orgMember.byOrganizationId.filter(form.organizationId)) {
    if (m.id.toString() !== form.ownerMemberId) continue;
    if (m.status !== 'active' || !isFormBuilder(m)) return;
    ctx.db.notification.insert({
      id: ctx.newUuidV4(), organizationId: form.organizationId, targetId: m.userId, type: 'form_response',
      title: 'New form response', body: deps.clampChars(who ? `${form.title}: ${who}` : form.title, NOTIFY_BODY_MAX),
      link: `/manager/forms/edit?id=${form.id}&view=responses`, read: false, createdAt: ctx.timestamp,
    });
    return;
  }
}

interface NewResponse {
  responseId: string; respondentMemberId: string; respondentName: string; source: string; answersJson: string;
  answerBytes: number; fileIds: string[]; fileBytes: bigint; period: string; date: string;
}

/** B.4 step 8: insert, move the counters and the store's text total, notify the owner. `window` = a public response. */
function recordResponse(
  ctx: FormCtx, deps: FormDeps, form: FormRow, meta: FormMetaRow, r: NewResponse, window?: PublicWindow,
): void {
  ctx.db.formResponse.insert({
    id: r.responseId, organizationId: form.organizationId, formId: form.id, adminScope: form.adminScope,
    formOwnerMemberId: form.ownerMemberId, respondentMemberId: r.respondentMemberId, respondentName: r.respondentName,
    formTitle: form.title, formVersion: form.version, source: r.source, submittedByIdentity: ctx.sender,
    answersJson: r.answersJson, answerBytes: r.answerBytes, fileItemIds: JSON.stringify(r.fileIds), fileBytes: r.fileBytes,
    period: r.period, date: r.date, reviewStatus: 'new', createdAt: ctx.timestamp, updatedAt: ctx.timestamp,
  });
  const bytes = BigInt(r.answerBytes);
  ctx.db.formMeta.formId.update({
    ...meta, responseCount: meta.responseCount + 1, answerBytes: meta.answerBytes + bytes,
    fileBytes: meta.fileBytes + r.fileBytes, fileCount: meta.fileCount + r.fileIds.length,
    lastResponseAt: deps.timestampMicros(ctx.timestamp), updatedAt: ctx.timestamp,
    ...(window ? {
      publicResponseCount: meta.publicResponseCount + 1, publicAnswerBytes: meta.publicAnswerBytes + bytes,
      publicWindowStart: window.windowStart, publicWindowCount: window.windowCount,
      publicPrevWindowCount: window.prevWindowCount,
    } : {}),
  });
  addFormStorage(ctx, form.organizationId, bytes);
  notifyFormOwner(ctx, deps, form, r.respondentMemberId, r.respondentName);
}

/** form_completion / form_period_mark key: the response's period, or its day when the form repeats without limit. */
const completionId = (formId: string, period: string, date: string, memberId: string): string =>
  `${formId}:${period || date}:${memberId}`;

/** One more (or, with -1, one fewer) response of a member in a (form, period); the mark row goes at 0. Returns the new count. */
function bumpPeriodMark(ctx: FormCtx, form: FormRow, id: string, memberId: string, delta: 1 | -1): number {
  const mark = ctx.db.formPeriodMark.id.find(id);
  const count = Math.max(0, (mark?.count ?? 0) + delta);
  if (mark != null && count === 0) ctx.db.formPeriodMark.delete(mark);
  else if (mark != null) ctx.db.formPeriodMark.id.update({ ...mark, count });
  else if (count > 0) {
    ctx.db.formPeriodMark.insert({ id, organizationId: form.organizationId, formId: form.id, memberId, count });
  }
  return count;
}

export function defineFormResponseReducers(spacetimedb: DriveSchema, deps: FormDeps) {
  const { t } = deps;

  /**
   * A member's response, or a store tablet's for its operator. Checks in the
   * order of design B.4: actor, open, audience, date, period, answers + caps,
   * files; then the write. `date` is the store-local YYYY-MM-DD (lib/date-key.ts).
   * File ids are read from the file answers themselves.
   */
  const submitFormResponse = spacetimedb.reducer(
    {
      organizationId: t.string(), formId: t.string(), responseId: t.string(), answersJson: t.string(), date: t.string(),
      surface: t.string(), actingMemberId: t.string(),
    },
    (ctx, args) => {
      const responseId = String(args.responseId ?? '');
      if (!isFormUuid(responseId)) throw formError(deps, 'invalid', 'Invalid response id');
      // 1. actor
      const { caller, respondent, acting } = resolveFormRespondent(ctx, deps, args.organizationId, args.actingMemberId);
      const form = requireForm(ctx, deps, args.formId);
      if (form.organizationId !== args.organizationId) throw formError(deps, 'not_found', 'Form not found');
      if (isReplay(ctx, deps, responseId, form.id)) return;
      if (!MEMBER_SOURCES.includes(args.surface)) throw formError(deps, 'invalid', 'Invalid surface');
      const respondentId = respondent.id.toString();
      // 2. open
      assertOpen(deps, form, deps.timestampMicros(ctx.timestamp));
      // 3. audience
      if (form.audience === 'assigned' && ctx.db.formAssignment.id.find(`${form.id}:${respondentId}`) == null) {
        throw formError(deps, 'not_assigned', 'This form is not assigned to you');
      }
      if (form.audience === 'private' && !canEditForm(respondent, form)) {
        throw formError(deps, 'forbidden', 'This form is private');
      }
      // 4. date
      const date = String(args.date ?? '');
      if (!isDateKeyNear(date, deps.timestampMicros(ctx.timestamp))) throw formError(deps, 'invalid_date', 'Invalid date');
      // 5. period: one primary-key lookup (form_period_mark), whatever the member answered elsewhere
      const period = formPeriodForDateKey(form.perMember as PerMemberRule, date);
      const markId = completionId(form.id, period, date, respondentId);
      if (form.perMember !== 'unlimited' && (ctx.db.formPeriodMark.id.find(markId)?.count ?? 0) > 0) {
        throw formError(deps, 'already_submitted', 'You already answered this form');
      }
      // 6. answers — no files from a staff-account store tablet (decision C6b). `surface` and actingMemberId are
      // the client's word; a device_operator_session on ctx.sender is the server's own signal.
      const staffTablet = !isOrgAdminRole(caller.role)
        && (acting || args.surface === 'store' || senderIsStoreDevice(ctx, form.organizationId));
      const def = definitionOf(deps, form);
      const meta = formMetaOf(ctx, form);
      const checked = checkAnswers(ctx, deps, form, meta, def, args.answersJson, { allowFiles: !staffTablet, isPublic: false });
      // 7. files
      const files = checkFiles(ctx, deps, form, def, checked.answers, respondentId);
      // 8. write
      const respondentName = deps.clampChars(respondent.displayName, NAME_SNAPSHOT_MAX);
      recordResponse(ctx, deps, form, meta, {
        responseId, respondentMemberId: respondentId, respondentName, source: args.surface,
        answersJson: checked.answersJson, answerBytes: checked.answerBytes, fileIds: files.ids, fileBytes: files.bytes,
        period, date,
      });
      bumpPeriodMark(ctx, form, markId, respondentId, 1);
      if (form.trackCompletion) {
        const row = {
          id: markId, organizationId: form.organizationId, formId: form.id, memberId: respondentId,
          memberName: respondentName, period: period || date, date, completedAt: ctx.timestamp,
        };
        if (ctx.db.formCompletion.id.find(markId) != null) ctx.db.formCompletion.id.update(row);
        else ctx.db.formCompletion.insert(row);
      }
    }
  );

  /**
   * An anyone-with-the-link response, relayed by the server route with the
   * service identity (app/api/forms/public). No member, no files, no period;
   * at most FORM_PUBLIC_MAX_PER_HOUR per form in any rolling hour (form_meta
   * buckets), within the store's separate public budget (checkAnswers).
   */
  const serviceSubmitPublicFormResponse = spacetimedb.reducer(
    { token: t.string(), responseId: t.string(), answersJson: t.string(), date: t.string() },
    (ctx, args) => {
      if (!deps.isServiceCaller(ctx)) throw formError(deps, 'forbidden', 'Service only');
      const responseId = String(args.responseId ?? '');
      if (!isFormUuid(responseId)) throw formError(deps, 'invalid', 'Invalid response id');
      const token = String(args.token ?? '');
      const pub = isFormPublicToken(token) ? ctx.db.formPublic.token.find(token) : null;
      const form = pub != null ? ctx.db.form.id.find(pub.formId) : null;
      const meta = form != null ? ctx.db.formMeta.formId.find(form.id) : null;
      if (form == null || meta == null || !form.publicEnabled || meta.publicToken !== token) {
        throw formError(deps, 'not_found', 'Form not found');
      }
      if (isReplay(ctx, deps, responseId, form.id)) return;
      const now = deps.timestampMicros(ctx.timestamp);
      assertOpen(deps, form, now);
      if (form.hasFileQuestions) throw formError(deps, 'public_unsafe', 'This form cannot take public responses');
      const date = String(args.date ?? '');
      if (!isDateKeyNear(date, now)) throw formError(deps, 'invalid_date', 'Invalid date');
      const checked = checkAnswers(
        ctx, deps, form, meta, definitionOf(deps, form), args.answersJson, { allowFiles: false, isPublic: true },
      );
      const window = nextPublicWindow(meta.publicWindowStart, meta.publicWindowCount, meta.publicPrevWindowCount, now);
      if (window == null) throw formError(deps, 'rate_limited', 'Too many responses right now. Try again later');
      recordResponse(ctx, deps, form, meta, {
        responseId, respondentMemberId: '', respondentName: '', source: 'public', answersJson: checked.answersJson,
        answerBytes: checked.answerBytes, fileIds: [], fileBytes: 0n, period: '', date,
      }, window);
    }
  );

  /**
   * The response and its form, for someone who can edit the form now (canEditForm: a builder by role); else
   * `[forms.not_found]`/forbidden. Owning the form is not enough on its own: a builder demoted to staff keeps
   * form.ownerMemberId but loses review and delete with the role (decision C2).
   */
  function responseForReviewer(ctx: FormCtx, responseId: string): { response: FormResponseRow; form: FormRow; name: string } {
    const response = isFormUuid(responseId) ? ctx.db.formResponse.id.find(responseId) : null;
    if (response == null) throw formError(deps, 'not_found', 'Response not found');
    const member = callerFormMember(ctx, deps, response.organizationId, 'not_found');
    const form = requireForm(ctx, deps, response.formId);
    if (!canEditForm(member, form)) {
      throw formError(deps, 'forbidden', 'Only the form owner or a manager can review responses');
    }
    return { response, form, name: deps.clampChars(member.displayName, NAME_SNAPSHOT_MAX) };
  }

  /**
   * Mark a response new / reviewed with an optional note (≤ FORM_MAX_REVIEW_NOTE_LENGTH). The status is on the
   * response (the respondent sees it); the note and the reviewer's name are in form_response_review, which only
   * Drive admins read. Note bytes count in the members' byte budget and the store's storage.
   */
  const reviewFormResponse = spacetimedb.reducer(
    { responseId: t.string(), reviewStatus: t.string(), reviewNote: t.string() },
    (ctx, args) => {
      const { response, form, name } = responseForReviewer(ctx, args.responseId);
      if (!(REVIEW_STATUSES as readonly string[]).includes(args.reviewStatus)) {
        throw formError(deps, 'invalid', 'Invalid review status');
      }
      const reviewNote = String(args.reviewNote ?? '').trim();
      if (textLength(reviewNote) > FORM_MAX_REVIEW_NOTE_LENGTH) throw formError(deps, 'invalid', 'The note is too long');
      const review = ctx.db.formResponseReview.responseId.find(response.id);
      const noteBytes = utf8ByteLength(reviewNote);
      const delta = BigInt(noteBytes - (review?.noteBytes ?? 0));
      if (delta > 0n && orgFormAnswerBytes(ctx, form.organizationId).member + delta > BigInt(FORM_MAX_ORG_ANSWER_BYTES)) {
        throw formError(deps, 'org_storage_full', 'This store has no room for more form answers');
      }
      ctx.db.formResponse.id.update({ ...response, reviewStatus: args.reviewStatus, updatedAt: ctx.timestamp });
      if (reviewNote === '') {
        if (review != null) ctx.db.formResponseReview.delete(review);
      } else {
        const row = {
          responseId: response.id, organizationId: response.organizationId, formId: response.formId,
          adminScope: response.adminScope, reviewNote, reviewedByName: name, noteBytes, updatedAt: ctx.timestamp,
        };
        if (review != null) ctx.db.formResponseReview.responseId.update(row);
        else ctx.db.formResponseReview.insert(row);
      }
      if (delta !== 0n) {
        const meta = formMetaOf(ctx, form);
        const answerBytes = meta.answerBytes + delta;
        ctx.db.formMeta.formId.update({ ...meta, answerBytes: answerBytes < 0n ? 0n : answerBytes, updatedAt: ctx.timestamp });
        addFormStorage(ctx, form.organizationId, delta);
      }
    }
  );

  /** Delete one response and its review: the counters and the store's text total go down; its Drive files stay (C9). */
  const deleteFormResponse = spacetimedb.reducer(
    { responseId: t.string() },
    (ctx, args) => {
      const { response, form } = responseForReviewer(ctx, args.responseId);
      ctx.db.formResponse.delete(response);
      const review = ctx.db.formResponseReview.responseId.find(response.id);
      if (review != null) ctx.db.formResponseReview.delete(review);
      const bytes = BigInt(response.answerBytes) + BigInt(review?.noteBytes ?? 0);
      const isPublic = response.source === 'public';
      const meta = formMetaOf(ctx, form);
      const fileCount = (() => {
        try { return (JSON.parse(response.fileItemIds) as unknown[]).length; } catch { return 0; }
      })();
      const floor = (v: bigint): bigint => (v < 0n ? 0n : v);
      ctx.db.formMeta.formId.update({
        ...meta, responseCount: Math.max(0, meta.responseCount - 1), answerBytes: floor(meta.answerBytes - bytes),
        fileBytes: floor(meta.fileBytes - response.fileBytes), fileCount: Math.max(0, meta.fileCount - fileCount),
        publicResponseCount: isPublic ? Math.max(0, meta.publicResponseCount - 1) : meta.publicResponseCount,
        publicAnswerBytes: isPublic ? floor(meta.publicAnswerBytes - BigInt(response.answerBytes)) : meta.publicAnswerBytes,
        updatedAt: ctx.timestamp,
      });
      addFormStorage(ctx, form.organizationId, -bytes);
      const memberId = response.respondentMemberId;
      if (memberId === '') return;
      // The completion stays while another response of the member is in the same (form, period).
      const key = completionId(form.id, response.period, response.date, memberId);
      if (bumpPeriodMark(ctx, form, key, memberId, -1) > 0) return;
      const completion = ctx.db.formCompletion.id.find(key);
      if (completion != null) ctx.db.formCompletion.delete(completion);
    }
  );

  return { submitFormResponse, serviceSubmitPublicFormResponse, reviewFormResponse, deleteFormResponse };
}
