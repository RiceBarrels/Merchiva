// Notification reducers: read state (the shipped ones, now also dropping the
// delivery rows: read ⇒ no email, no push), push subscriptions, the
// recipient's email / locale preference and identity, specially followed
// colleagues, the store SOS, and the cron's claim / finish (./claim.ts).
// index.ts wires them: `export const { … } = defineNotifyReducers(spacetimedb, deps)`.
//
// List arguments are JSON strings (length checked before JSON.parse, ≤ 500
// ids); an id that is missing or not the caller's is skipped, never an error.
//
// Runtime imports: the pure ./logic and ../drive/logic, ./deliver, ./claim, ./sos.
// The SDK values arrive through NotifyDeps.

import { isOrgAdminRole } from '../drive/logic';
import { notifyClaim, notifyFinish } from './claim';
import { notifyOpenSosWindow } from './sos';
import {
  deliver, notifyDropDelivery, notifyMicros, notifyOwnNotification, notifyPutDelivery, type NotifyCtx, type NotifyDeps,
  type NotifyIdentity, type NotifySchema,
} from './deliver';
import {
  NOTIFY_EMERGENCY_TEMPLATE, NOTIFY_IDENTITY_HEX_RE, NOTIFY_PUSH_KEY_MAX, NOTIFY_PUSH_SUBS_KEPT, notifyClamp,
  notifyFollowId, notifyIdentityClaims, notifyNormalizeLocale, notifyParseIdList, notifyPushEndpointOk,
} from './logic';

const NOTIFY_USER_AGENT_MAX = 300;

/** ctx.sender's own active membership (never the service identity's virtual owner). */
function notifyCallerMember(ctx: NotifyCtx, organizationId: string) {
  for (const m of ctx.db.orgMember.byUserId.filter(ctx.sender)) {
    if (m.organizationId === organizationId && m.status === 'active') return m;
  }
  return null;
}

function notifyIsActiveMember(ctx: NotifyCtx, organizationId: string, who: NotifyIdentity): boolean {
  for (const m of ctx.db.orgMember.byUserId.filter(who)) {
    if (m.organizationId === organizationId && m.status === 'active') return true;
  }
  return false;
}

/** ctx.sender's notification_pref row with `patch` applied (created with email on, locale '' when missing). */
function notifyPutPref(ctx: NotifyCtx, patch: { subject?: string; issuer?: string; emailEnabled?: boolean; locale?: string }): void {
  const table = ctx.db.notificationPref;
  const existing = table.userId.find(ctx.sender);
  const row = {
    userId: ctx.sender,
    subject: patch.subject ?? existing?.subject ?? '',
    issuer: patch.issuer ?? existing?.issuer ?? '',
    emailEnabled: patch.emailEnabled ?? existing?.emailEnabled ?? true,
    locale: patch.locale ?? existing?.locale ?? '',
    updatedAt: ctx.timestamp,
  };
  if (existing != null) table.userId.update(row);
  else table.insert(row);
}

/** Records the WorkOS user id + issuer of the caller's own access token; nothing when it has none. */
function notifyCaptureIdentity(ctx: NotifyCtx): void {
  const claims = notifyIdentityClaims(() => ctx.senderAuth);
  if (!claims) return;
  const existing = ctx.db.notificationPref.userId.find(ctx.sender);
  if (existing?.subject === claims.subject && existing.issuer === claims.issuer) return;
  notifyPutPref(ctx, claims);
}

export function defineNotifyReducers(spacetimedb: NotifySchema, deps: NotifyDeps) {
  const { t, SenderError, Identity } = deps;

  /** The caller's own notification rows among `idsJson`; anything else is skipped. */
  const ownNotifications = (ctx: NotifyCtx, idsJson: string) => {
    const ids = notifyParseIdList(idsJson);
    if (ids === null) throw new SenderError('Invalid notification id list');
    return ids.map((id) => notifyOwnNotification(ctx, deps, id)).filter((n) => n != null);
  };

  // ─── Read state (parameters shipped; frozen) ─────────────────────────────

  const markNotificationRead = spacetimedb.reducer(
    { notificationId: t.string() },
    (ctx, { notificationId }) => {
      const notif = notifyOwnNotification(ctx, deps, notificationId);
      if (!notif) throw new SenderError('Notification not found');
      if (!notif.read) ctx.db.notification.id.update({ ...notif, read: true });
      notifyDropDelivery(ctx, notif.id.toString());
    }
  );

  const markAllNotificationsRead = spacetimedb.reducer(
    { organizationId: t.string() },
    (ctx, { organizationId }) => {
      for (const notif of [...ctx.db.notification.byTargetId.filter(ctx.sender)]) {
        if (notif.organizationId !== organizationId || notif.read) continue;
        ctx.db.notification.id.update({ ...notif, read: true });
        notifyDropDelivery(ctx, notif.id.toString());
      }
    }
  );

  const dismissNotification = spacetimedb.reducer(
    { notificationId: t.string() },
    (ctx, { notificationId }) => {
      const notif = notifyOwnNotification(ctx, deps, notificationId);
      if (!notif) throw new SenderError('Notification not found');
      notifyDropDelivery(ctx, notif.id.toString());
      ctx.db.notification.delete(notif);
    }
  );

  /** Marks several of the caller's notifications read; their delivery rows go. */
  const markNotificationsRead = spacetimedb.reducer(
    { idsJson: t.string() },
    (ctx, { idsJson }) => {
      for (const notif of ownNotifications(ctx, idsJson)) {
        if (!notif.read) ctx.db.notification.id.update({ ...notif, read: true });
        notifyDropDelivery(ctx, notif.id.toString());
      }
    }
  );

  /**
   * An open app presented these alerts itself: no push for them (they stay
   * unread, and may still be emailed). Never the emergency, which always pushes.
   */
  const markNotificationsDelivered = spacetimedb.reducer(
    { idsJson: t.string() },
    (ctx, { idsJson }) => {
      const now = notifyMicros(ctx.timestamp);
      for (const notif of ownNotifications(ctx, idsJson)) {
        const row = ctx.db.notificationDelivery.notificationId.find(notif.id.toString());
        if (row == null || !row.push || row.template === NOTIFY_EMERGENCY_TEMPLATE) continue;
        notifyPutDelivery(ctx, { ...row, push: false }, now);
      }
    }
  );

  // ─── Push subscriptions (parameters shipped; frozen) ─────────────────────

  /**
   * Upserts the caller's subscription for one endpoint in one organization.
   * A browser's endpoint belongs to the last account that subscribed in it:
   * another identity's row for the same endpoint would push that person's
   * alerts to whoever uses the browser now, so it goes. A browser that
   * re-subscribes gets a new endpoint and never says the old one is dead, so
   * the caller keeps only their NOTIFY_PUSH_SUBS_KEPT newest rows.
   */
  const savePushSubscription = spacetimedb.reducer(
    {
      organizationId: t.string(),
      endpoint: t.string(),
      p256dh: t.string(),
      auth: t.string(),
      userAgent: t.option(t.string()),
    },
    (ctx, { organizationId, endpoint, p256dh, auth, userAgent }) => {
      deps.findActiveMember(ctx, organizationId);
      if (!notifyPushEndpointOk(endpoint)) throw new SenderError('Push endpoint must be an https URL of at most 1000 characters');
      if (!p256dh || !auth || p256dh.length > NOTIFY_PUSH_KEY_MAX || auth.length > NOTIFY_PUSH_KEY_MAX) {
        throw new SenderError('Invalid push subscription keys');
      }
      for (const row of [...ctx.db.pushSubscription.iter()]) {
        if (row.endpoint !== endpoint) continue;
        if (!row.targetId.isEqual(ctx.sender) || row.organizationId === organizationId) ctx.db.pushSubscription.delete(row);
      }
      ctx.db.pushSubscription.insert({
        id: ctx.newUuidV4(),
        organizationId,
        targetId: ctx.sender,
        endpoint,
        p256dh,
        auth,
        userAgent: userAgent == null ? undefined : notifyClamp(userAgent, NOTIFY_USER_AGENT_MAX),
        createdAt: ctx.timestamp,
      });
      const mine = [...ctx.db.pushSubscription.byTargetId.filter(ctx.sender)];
      if (mine.length > NOTIFY_PUSH_SUBS_KEPT) {
        mine.sort((a, b) => {
          const am = notifyMicros(a.createdAt);
          const bm = notifyMicros(b.createdAt);
          return am === bm ? 0 : am < bm ? 1 : -1;
        });
        for (const stale of mine.slice(NOTIFY_PUSH_SUBS_KEPT)) ctx.db.pushSubscription.delete(stale);
      }
    }
  );

  /**
   * Removes the caller's subscriptions for one endpoint, in every organization:
   * the browser unsubscribed (notifications turned off, sign-out, account
   * switch) or the push service said it expired, so no organization may push
   * to it. Only the caller's own rows, so no membership is required (a member
   * who has left an organization can still clean up). `organizationId` is
   * kept for older clients and ignored.
   */
  const deletePushSubscription = spacetimedb.reducer(
    { organizationId: t.string(), endpoint: t.string() },
    (ctx, { endpoint }) => {
      for (const row of [...ctx.db.pushSubscription.byTargetId.filter(ctx.sender)]) {
        if (row.endpoint === endpoint) ctx.db.pushSubscription.delete(row);
      }
    }
  );

  // ─── Preference and identity ─────────────────────────────────────────────

  /**
   * Records the WorkOS user id (+ issuer) of the caller's access token, which
   * the cron resolves to a verified email address. Reads only ctx.senderAuth;
   * a caller without a matching token changes nothing.
   */
  const syncNotificationIdentity = spacetimedb.reducer({}, (ctx) => {
    notifyCaptureIdentity(ctx);
  });

  /** Turns the caller's notification email on or off. Off also cancels the email owed on queued rows (never the emergency's). */
  const setNotificationEmail = spacetimedb.reducer(
    { enabled: t.bool() },
    (ctx, { enabled }) => {
      notifyCaptureIdentity(ctx);
      notifyPutPref(ctx, { emailEnabled: enabled });
      if (enabled) return;
      const now = notifyMicros(ctx.timestamp);
      for (const row of [...ctx.db.notificationDelivery.byTargetId.filter(ctx.sender)]) {
        if (!row.email || row.template === NOTIFY_EMERGENCY_TEMPLATE) continue;
        notifyPutDelivery(ctx, { ...row, email: false }, now);
      }
    }
  );

  /** The language of the caller's emails and pushes: one of the 8 app locales, else '' (English). */
  const setNotificationLocale = spacetimedb.reducer(
    { locale: t.string() },
    (ctx, { locale }) => {
      notifyPutPref(ctx, { locale: notifyNormalizeLocale(locale) });
    }
  );

  // ─── Follow (特别关注) ─────────────────────────────────────────────────────

  /**
   * The caller specially follows (or stops following) a colleague: that
   * colleague's posts in channels the caller is in email the caller. Following
   * takes both to be active members of the organization; unfollowing always works.
   */
  const setChatFollow = spacetimedb.reducer(
    { organizationId: t.string(), targetHex: t.string(), followed: t.bool() },
    (ctx, { organizationId, targetHex, followed }) => {
      if (!NOTIFY_IDENTITY_HEX_RE.test(targetHex)) throw new SenderError('Invalid member');
      let target: NotifyIdentity;
      try {
        target = new Identity(targetHex.toLowerCase().replace(/^0x/, ''));
      } catch {
        throw new SenderError('Invalid member');
      }
      const hex = target.toHexString().toLowerCase();
      const id = notifyFollowId(organizationId, ctx.sender.toHexString().toLowerCase(), hex);
      const existing = ctx.db.chatFollow.id.find(id);
      if (!followed) {
        if (existing != null) ctx.db.chatFollow.id.delete(id);
        return;
      }
      if (target.isEqual(ctx.sender)) throw new SenderError('You cannot follow yourself');
      if (!notifyCallerMember(ctx, organizationId)) throw new SenderError('Not an active member of this organization');
      if (!notifyIsActiveMember(ctx, organizationId, target)) throw new SenderError('Not a member of this organization');
      if (existing == null) {
        ctx.db.chatFollow.insert({ id, organizationId, userId: ctx.sender, targetHex: hex, createdAt: ctx.timestamp });
      }
    }
  );

  // ─── Store SOS ───────────────────────────────────────────────────────────

  /**
   * The SOS button of a store tablet: every active owner and manager (the
   * tablet's own account included) gets an alert that pushes and emails at
   * once. The device must be a registered, enabled store device of the
   * organization; one SOS per store per 2 minutes, emailed up to
   * NOTIFY_SOS_EMAIL_DAILY_CAP times a UTC day (./sos.ts).
   */
  const sendStoreSos = spacetimedb.reducer(
    { organizationId: t.string(), deviceId: t.string() },
    (ctx, { organizationId, deviceId }) => {
      if (!notifyCallerMember(ctx, organizationId)) throw new SenderError('Not an active member of this organization');
      let device = null;
      for (const d of ctx.db.storeDevice.byDeviceId.filter(deviceId)) {
        if (d.organizationId === organizationId && d.enabled) device = d;
      }
      if (!device) throw new SenderError('This store device is not registered or is turned off');
      const opened = notifyOpenSosWindow(ctx, organizationId);
      if (!opened) throw new SenderError('An SOS was sent from this store less than 2 minutes ago');

      const targets = new Map<string, NotifyIdentity>();
      for (const m of ctx.db.orgMember.byOrganizationId.filter(organizationId)) {
        if (m.status === 'active' && isOrgAdminRole(m.role)) targets.set(m.userId.toHexString(), m.userId);
      }
      for (const target of targets.values()) {
        deliver(ctx, {
          organizationId, target, type: 'emergency',
          title: `Emergency at ${device.name}`,
          body: 'SOS pressed on a store device. Please check in immediately.',
          link: '', template: NOTIFY_EMERGENCY_TEMPLATE, params: { device: device.name }, email: opened.email,
          sourceKind: 'device', sourceId: device.id.toString(), contextId: '',
        });
      }
    }
  );

  // ─── The notifications cron (service identity only) ──────────────────────

  /** Leases due rows to run `runId` for `channels` (⊆ 'pe'); the cron then reads them byRunId. */
  const serviceClaimNotificationDeliveries = spacetimedb.reducer(
    { runId: t.string(), channels: t.string(), limit: t.u32() },
    (ctx, args) => {
      notifyClaim(ctx, deps, args);
    }
  );

  /** Reports what run `runId` did with its rows (JSON NotifyFinishResult, ./logic.ts). */
  const serviceFinishNotificationDeliveries = spacetimedb.reducer(
    { runId: t.string(), resultJson: t.string() },
    (ctx, args) => {
      notifyFinish(ctx, deps, args);
    }
  );

  return {
    markNotificationRead, markAllNotificationsRead, dismissNotification, markNotificationsRead,
    markNotificationsDelivered, savePushSubscription, deletePushSubscription, syncNotificationIdentity,
    setNotificationEmail, setNotificationLocale, setChatFollow, sendStoreSos, serviceClaimNotificationDeliveries,
    serviceFinishNotificationDeliveries,
  };
}
