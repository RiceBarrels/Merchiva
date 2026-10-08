// Forms: definitions, per-form counters, responses, assignments, completions and
// the public-link copy (design B.2).
//
// Definitions only: registered in schema({...}) and given RLS rules in
// ../index.ts. Every column a subscription WHERE, a join or an RLS rule touches
// is a plain, non-option type (see "DIALECT LIMITS" in ../index.ts). File and
// photo answers are Drive items in the respondent's My files — only their ids
// are stored here, never bytes. Ids are client-generated lowercase UUID v4
// (reducers can't return values); µs columns use 0 for "never".
//
// scripts/tests/forms/rls-shape.test.ts reads this file's text and expects
// `name: '<t>',` then `public: …` on the next line, and every column at four
// spaces of indent. These tables are new, so their column order is free until
// the first publish; after it, new columns go at the END.

import { t, table } from 'spacetimedb/server';

/**
 * One form. Members read it while `memberVisible`; Drive admins (every builder,
 * by role) always. The definition is our own FormDefinitionV1 (./logic.ts), never a
 * renderer's JSON.
 */
export const formTable = table(
  {
    name: 'form',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byOwnerMemberId', algorithm: 'btree', columns: ['ownerMemberId'] },
      { accessor: 'byAdminScope', algorithm: 'btree', columns: ['adminScope'] },
    ],
  },
  {
    id: t.string().primaryKey(),        // client-generated lowercase UUID v4
    organizationId: t.string(),
    adminScope: t.string(),             // the org's opaque Drive admin scope (drive_org_state) — join key of the admin rule
    ownerMemberId: t.string(),          // who built it (notified of responses); not a read rule — access is by role
    title: t.string(),                  // ≤ FORM_MAX_TITLE_LENGTH; mirrors the definition's title
    kind: t.string(),                   // 'form' | 'checklist' | 'report' | 'survey'
    status: t.string(),                 // 'draft' | 'open' | 'closed' | 'archived'
    audience: t.string(),               // 'members' | 'assigned' | 'private'
    memberVisible: t.bool(),            // formMemberVisible(status, audience) — filter of the member rule
    definitionJson: t.string(),         // validated FormDefinitionV1, ≤ FORM_MAX_DEFINITION_BYTES
    definitionBytes: t.u32(),
    version: t.u32(),                   // bumped by every definition edit (optimistic concurrency)
    perMember: t.string(),              // 'unlimited' | 'once' | 'daily' | 'weekly'
    responseLimit: t.u32(),             // ≤ FORM_MAX_RESPONSE_LIMIT
    closesAt: t.u64(),                  // µs; 0 = never closes
    publicEnabled: t.bool(),            // anyone-with-the-link (owners only; never with file questions)
    hasFileQuestions: t.bool(),         // any photo/file question, archived included
    trackCompletion: t.bool(),          // write form_completion rows
    notifyOwner: t.bool(),
    createdByMemberId: t.string(),
    updatedByMemberId: t.string(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

/**
 * Per-form counters and the public token, one row per form. A separate table so
 * per-submission churn and the token never reach every member's subscription:
 * readable by Drive admins only.
 */
export const formMetaTable = table(
  {
    name: 'form_meta',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byOwnerMemberId', algorithm: 'btree', columns: ['ownerMemberId'] },
      { accessor: 'byAdminScope', algorithm: 'btree', columns: ['adminScope'] },
    ],
  },
  {
    formId: t.string().primaryKey(),
    organizationId: t.string(),
    adminScope: t.string(),
    ownerMemberId: t.string(),
    publicToken: t.string(),            // 64 hex; '' = no public link
    responseCount: t.u32(),
    answerBytes: t.u64(),               // Σ form_response.answerBytes + Σ form_response_review.noteBytes
    fileBytes: t.u64(),                 // Σ referenced Drive item sizes (counted in Drive, shown here)
    fileCount: t.u32(),
    lastResponseAt: t.u64(),            // µs; 0 = no response yet
    publicWindowStart: t.u64(),         // µs start of the current public hour bucket; 0 = none
    publicWindowCount: t.u32(),         // public submissions in that bucket
    updatedAt: t.timestamp(),
    publicResponseCount: t.u32(),       // the public share of responseCount
    publicAnswerBytes: t.u64(),         // the public share of answerBytes (org cap FORM_MAX_ORG_PUBLIC_ANSWER_BYTES)
    publicPrevWindowCount: t.u32(),     // public submissions in the bucket before (bucket sum ≤ FORM_PUBLIC_MAX_PER_HOUR)
  }
);

/**
 * One submission. Readable by the respondent (by member id, so a response the
 * store tablet submitted for its operator reaches the operator's phone) and
 * Drive admins — never by the tablet that submitted it, and never org-wide.
 * `formOwnerMemberId` is rewritten when the form is transferred.
 */
export const formResponseTable = table(
  {
    name: 'form_response',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byFormId', algorithm: 'btree', columns: ['formId'] },
      { accessor: 'byAdminScope', algorithm: 'btree', columns: ['adminScope'] },
      { accessor: 'byFormOwnerMemberId', algorithm: 'btree', columns: ['formOwnerMemberId'] },
      { accessor: 'byRespondentMemberId', algorithm: 'btree', columns: ['respondentMemberId'] },
    ],
  },
  {
    id: t.string().primaryKey(),        // client-generated lowercase UUID v4; a replay by the same sender is a no-op
    organizationId: t.string(),
    formId: t.string(),
    adminScope: t.string(),
    formOwnerMemberId: t.string(),      // the form's ownerMemberId (display); not a read rule
    respondentMemberId: t.string(),     // join key of the respondent rule; '' for a public response
    respondentName: t.string(),         // snapshot at submit time
    formTitle: t.string(),              // snapshot at submit time
    formVersion: t.u32(),
    source: t.string(),                 // 'manager' | 'store' | 'personal' | 'public'
    submittedByIdentity: t.identity(),  // ctx.sender (the tablet account on /store, the service identity for public)
    answersJson: t.string(),            // validated Answers, ≤ FORM_MAX_ANSWERS_BYTES
    answerBytes: t.u32(),               // stored bytes: answersJson + FORM_RESPONSE_ROW_OVERHEAD_BYTES
    fileItemIds: t.string(),            // JSON array of drive_item ids, ≤ FORM_MAX_FILES_PER_RESPONSE
    fileBytes: t.u64(),                 // Σ sizeBytes of those items at submit time
    period: t.string(),                 // '' | 'once' | 'YYYY-MM-DD' | 'YYYY-Www' (formPeriodForDateKey)
    date: t.string(),                   // store-local 'YYYY-MM-DD' (lib/date-key.ts on the client)
    reviewStatus: t.string(),           // 'new' | 'reviewed'; the note is in form_response_review
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

/**
 * A reviewer's note on one response: management-internal. A separate table because
 * RLS is row level and the respondent reads their whole form_response row; this
 * one is readable by Drive admins only (never the respondent). Its bytes count in
 * form_meta.answerBytes. Deleted with its response.
 */
export const formResponseReviewTable = table(
  {
    name: 'form_response_review',
    public: true,
    indexes: [
      { accessor: 'byFormId', algorithm: 'btree', columns: ['formId'] },
      { accessor: 'byAdminScope', algorithm: 'btree', columns: ['adminScope'] },
    ],
  },
  {
    responseId: t.string().primaryKey(),
    organizationId: t.string(),
    formId: t.string(),
    adminScope: t.string(),             // join key of the admin rule
    reviewNote: t.string(),             // ≤ FORM_MAX_REVIEW_NOTE_LENGTH
    reviewedByName: t.string(),
    noteBytes: t.u32(),                 // utf8 bytes of reviewNote, charged to form_meta.answerBytes
    updatedAt: t.timestamp(),
  }
);

/**
 * Module-only bookkeeping, never read by a client (public: false, so no RLS
 * rule): how many responses one member has in one (form, period) — the period,
 * or the day for an 'unlimited' form. Written for every member response, so the
 * once/daily/weekly duplicate check and the completion clean-up on delete are
 * single primary-key lookups, whether or not the form tracks completion.
 */
export const formPeriodMarkTable = table(
  {
    name: 'form_period_mark',
    public: false,
    indexes: [
      { accessor: 'byFormId', algorithm: 'btree', columns: ['formId'] },
    ],
  },
  {
    id: t.string().primaryKey(),        // `${formId}:${period || date}:${memberId}` (= form_completion.id)
    organizationId: t.string(),
    formId: t.string(),
    memberId: t.string(),
    count: t.u32(),
  }
);

/** A form assigned to one member (audience 'assigned'). Org-readable. */
export const formAssignmentTable = table(
  {
    name: 'form_assignment',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byFormId', algorithm: 'btree', columns: ['formId'] },
      { accessor: 'byMemberId', algorithm: 'btree', columns: ['memberId'] },
    ],
  },
  {
    id: t.string().primaryKey(),        // `${formId}:${memberId}`
    organizationId: t.string(),
    formId: t.string(),
    memberId: t.string(),
    dueDate: t.string(),                // 'YYYY-MM-DD'; '' = none
    createdByMemberId: t.string(),
    createdAt: t.timestamp(),
  }
);

/**
 * "Done · Ana 08:02" without the answers: one row per (form, period, member),
 * written only when the form tracks completion. Its primary key makes the
 * per-member duplicate check a single lookup. Org-readable.
 */
export const formCompletionTable = table(
  {
    name: 'form_completion',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      { accessor: 'byFormId', algorithm: 'btree', columns: ['formId'] },
      { accessor: 'byMemberId', algorithm: 'btree', columns: ['memberId'] },
    ],
  },
  {
    id: t.string().primaryKey(),        // `${formId}:${period}:${memberId}`
    organizationId: t.string(),
    formId: t.string(),
    memberId: t.string(),
    memberName: t.string(),             // snapshot
    period: t.string(),
    date: t.string(),                   // store-local 'YYYY-MM-DD'
    completedAt: t.timestamp(),
  }
);

/**
 * The public-safe copy behind an anyone-with-the-link token: no photo/file
 * question ever (isPublicSafe). Read only by the service identity, through
 * drive_service_reader (extends exception U14); /api/forms/public/[token]
 * serves it. Kept in step with `form` by every definition/settings/status write.
 */
export const formPublicTable = table(
  {
    name: 'form_public',
    public: true,
    indexes: [
      { accessor: 'byScope', algorithm: 'btree', columns: ['scope'] },
      { accessor: 'byFormId', algorithm: 'btree', columns: ['formId'] },
    ],
  },
  {
    token: t.string().primaryKey(),     // 64 lowercase hex (two uuid v4s); equals form_meta.publicToken
    scope: t.string(),                  // always DRIVE_SERVICE_SCOPE ('service') — join key of the service rule
    formId: t.string(),
    organizationId: t.string(),
    storeName: t.string(),              // snapshot of the org name, shown as "your answers go to <store>"
    title: t.string(),
    definitionJson: t.string(),         // public-safe FormDefinitionV1
    version: t.u32(),
    status: t.string(),                 // form.status
    closesAt: t.u64(),                  // µs; 0 = never closes
    updatedAt: t.timestamp(),
  }
);
