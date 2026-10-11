// Notification side tables: the delivery queue the notifications cron drains
// (push + email), each member's email / locale preference, the colleagues a
// member specially follows in channels, and six private state tables.
//
// Side tables rather than new `notification` / `push_subscription` columns:
// both are frozen for older clients (scripts/tests/drive/client-compat-schema.test.ts).
// The three public tables below freeze the same way at their first publish, so
// every column they will ever need is already here.
//
// Definition only: registered in schema({...}) and given RLS rules in
// ../index.ts (RLS_SELF_SCOPED, plus rls_notification_delivery_service);
// written by ./deliver.ts, ./reducers.ts and ./claim.ts.
//
// Every filtered, indexed or RLS column is a plain, non-option type (see
// "DIALECT LIMITS" in ../index.ts).

import { t, table } from 'spacetimedb/server';

/**
 * What is still owed for one notification row: push, email, and the in-app
 * text in the recipient's language (`template` + `params`). One row per
 * notification, keyed by its id. Read by its recipient (self-scoped) and by
 * the service identity through drive_service_reader (`scope`). The push keys
 * sit in `pushTargets` only between a claim and its finish.
 */
export const notificationDeliveryTable = table(
  {
    name: 'notification_delivery',
    public: true,
    indexes: [
      // RLS column (RLS_SELF_SCOPED).
      { accessor: 'byTargetId', algorithm: 'btree', columns: ['targetId'] },
      // Service rule join column (drive_service_reader.scope).
      { accessor: 'byScope', algorithm: 'btree', columns: ['scope'] },
      // The cron reads one claim's rows by run id.
      { accessor: 'byRunId', algorithm: 'btree', columns: ['runId'] },
      // The claim reducer scans due rows in time order.
      { accessor: 'byDueAt', algorithm: 'btree', columns: ['dueAtMicros'] },
    ],
  },
  {
    notificationId: t.string().primaryKey(),
    organizationId: t.string(),
    targetId: t.identity(),             // recipient
    scope: t.string(),                  // always DRIVE_SERVICE_SCOPE ('service')
    runId: t.string(),                  // '' = unclaimed, else the claiming run's uuid
    claimed: t.string(),                // '' | 'p' | 'e' | 'pe' — channels of the current claim
    dueAtMicros: t.u64(),               // next time the claim reducer must look at the row
    template: t.string(),               // NOTIFY_TEMPLATES (./logic.ts)
    params: t.string(),                 // JSON object of plain strings; always has `store`
    sourceKind: t.string(),             // NOTIFY_SOURCE_KINDS (./logic.ts)
    sourceId: t.string(),               // message / comment / doc / form / item / device id
    contextId: t.string(),              // conversation / document / form id
    title: t.string(),                  // English fallback copy (as on the notification row)
    body: t.string(),
    link: t.string(),                   // safe app path ('' when none or unsafe)
    email: t.bool(),                    // email still owed (eligibility; the preference is read at claim)
    push: t.bool(),                     // push still owed
    pushTargets: t.string(),            // '' except between claim and finish: JSON [{endpoint,p256dh,auth}]
    subject: t.string(),                // WorkOS user id, copied from notification_pref at claim
    issuer: t.string(),                 // token issuer, copied from notification_pref at claim
    locale: t.string(),                 // copied from notification_pref at claim ('' = English)
    attempts: t.u32(),                  // email attempts
    createdAt: t.timestamp(),
  }
);

/**
 * One identity's notification preference. No row = email on, locale ''.
 * `subject` / `issuer` come only from the caller's own access token
 * (syncNotificationIdentity), never from an argument.
 */
export const notificationPrefTable = table(
  {
    name: 'notification_pref',
    public: true,
  },
  {
    userId: t.identity().primaryKey(),  // RLS column (RLS_SELF_SCOPED)
    subject: t.string(),                // '' until the first session on a client that syncs it
    issuer: t.string(),
    emailEnabled: t.bool(),
    locale: t.string(),                 // 'ar' | 'en' | 'es' | 'fr' | 'hi' | 'zh-cn' | 'zh-hk' | 'zh-tw' | ''
    updatedAt: t.timestamp(),
  }
);

/** A member specially follows a colleague: that colleague's channel posts email them. Self-scoped. */
export const chatFollowTable = table(
  {
    name: 'chat_follow',
    public: true,
    indexes: [
      { accessor: 'byOrganizationId', algorithm: 'btree', columns: ['organizationId'] },
      // RLS column (RLS_SELF_SCOPED).
      { accessor: 'byUserId', algorithm: 'btree', columns: ['userId'] },
      { accessor: 'byTargetHex', algorithm: 'btree', columns: ['targetHex'] },
    ],
  },
  {
    id: t.string().primaryKey(),        // `${organizationId}:${followerHex}:${targetHex}`
    organizationId: t.string(),
    userId: t.identity(),               // the follower
    targetHex: t.string(),              // the followed identity, lowercase hex
    createdAt: t.timestamp(),
  }
);

// ─── Private (public: false → no client reads them, so no RLS rule) ──────────

/** A message's pin notifies only the first time it is ever pinned. */
export const chatPinNoticeTable = table(
  { name: 'chat_pin_notice', public: false },
  {
    messageId: t.string().primaryKey(),
    createdAt: t.timestamp(),
  }
);

/**
 * A member's unread notifications per conversation (every row whose link is
 * `/manager/channel?c=<id>`), so markChatRead visits those alone instead of
 * every notification the member ever got. deliver() adds one; reading or
 * dismissing the notification removes it. `readerKey` = `${conversationId}:${identityHex}`.
 * One marker row per identity (`backfill:<hex>`) records that its older
 * notifications were indexed (./deliver.ts notifyBackfillUnread).
 */
export const chatNoticeUnreadTable = table(
  {
    name: 'chat_notice_unread',
    public: false,
    indexes: [{ accessor: 'byReaderKey', algorithm: 'btree', columns: ['readerKey'] }],
  },
  {
    notificationId: t.string().primaryKey(),
    readerKey: t.string(),
    createdAt: t.timestamp(),
  }
);

/** Email pacing per recipient: the last email and today's (UTC) count. Written by the finish reducer. */
export const notificationEmailStateTable = table(
  { name: 'notification_email_state', public: false },
  {
    targetId: t.identity().primaryKey(),
    lastEmailAtMicros: t.u64(),
    dayKey: t.string(),                 // UTC 'YYYY-MM-DD' of dayCount
    dayCount: t.u32(),
  }
);

/**
 * The store SOS per organization (./sos.ts): when the last SOS window opened
 * (the 2-minute cooldown), and how many SOS emails went out on that UTC day
 * (past NOTIFY_SOS_EMAIL_DAILY_CAP an SOS still alerts and pushes, unemailed).
 */
export const storeSosStateTable = table(
  { name: 'store_sos_state', public: false },
  {
    organizationId: t.string().primaryKey(),
    lastAtMicros: t.u64(),
    dayKey: t.string(),                 // UTC 'YYYY-MM-DD' of dayCount
    dayCount: t.u32(),                  // emailed SOS that day
  }
);

/**
 * How much of the shared delivery queue one organization or one recipient
 * used in the current window (NOTIFY_QUOTAS, ./deliver.ts notifyTakeQuota).
 * `id` = `org:<organizationId>` | `push:<identityHex>` | `email:<identityHex>`.
 */
export const notificationQuotaTable = table(
  { name: 'notification_quota', public: false },
  {
    id: t.string().primaryKey(),
    windowKey: t.u64(),                 // now / the quota's window length
    count: t.u32(),                     // uses in that window
  }
);

/**
 * The store SOS lane: delivery rows of an SOS that still owe a push or an
 * email. The claim serves them before the time-ordered queue (./claim.ts
 * notifyClaimUrgent) and drops an entry once its row is gone or owes nothing.
 */
export const notificationUrgentTable = table(
  { name: 'notification_urgent', public: false },
  {
    notificationId: t.string().primaryKey(),
    createdAt: t.timestamp(),
  }
);
