// The store SOS, one window per store (store_sos_state): sendStoreSos
// (./reducers.ts), and the SOS of an older cached tablet, which calls
// createNotification({ type: 'emergency' }) once per owner / manager
// (./producers.ts notifyFromClient).
//
// Anyone at the store may press SOS: the tablet is one shared account, and any
// member can register a store device, so neither proves who pressed it. The
// limits are on what an SOS costs instead. A window opens at most once per
// NOTIFY_SOS_COOLDOWN_MICROS and reaches each owner / manager once. Its email
// passes the email switch, the gap and the daily cap, so past
// NOTIFY_SOS_EMAIL_DAILY_CAP windows in a UTC day an SOS still alerts and
// pushes, but is not emailed.
//
// Runtime imports: the pure ./logic and ../drive/logic, and ./deliver.

import { isOrgAdminRole } from '../drive/logic';
import { notifyMicros, type NotifyCtx, type NotifyIdentity } from './deliver';
import { NOTIFY_EMERGENCY_TEMPLATE, NOTIFY_SOS_COOLDOWN_MICROS, notifyUtcDayKey } from './logic';

/** SOS windows a store may email in one UTC day. */
export const NOTIFY_SOS_EMAIL_DAILY_CAP = 10;
/** An older tablet sends its SOS one owner / manager at a time: calls this soon after the window opened are the same SOS. */
export const NOTIFY_SOS_BURST_MICROS = 10_000_000n;

type NotifySosStateRow = NonNullable<ReturnType<NotifyCtx['db']['storeSosState']['organizationId']['find']>>;

function notifyPutSosState(ctx: NotifyCtx, row: NotifySosStateRow): void {
  if (ctx.db.storeSosState.organizationId.find(row.organizationId) != null) ctx.db.storeSosState.organizationId.update(row);
  else ctx.db.storeSosState.insert(row);
}

/** Whether `target` is an active owner or manager of the organization. */
export function notifyIsManagerTarget(ctx: NotifyCtx, organizationId: string, target: NotifyIdentity): boolean {
  for (const m of ctx.db.orgMember.byUserId.filter(target)) {
    if (m.organizationId === organizationId && m.status === 'active' && isOrgAdminRole(m.role)) return true;
  }
  return false;
}

/**
 * sendStoreSos: opens the store's SOS window; null while the last one is
 * younger than NOTIFY_SOS_COOLDOWN_MICROS. `email`: whether this SOS is still
 * within today's NOTIFY_SOS_EMAIL_DAILY_CAP.
 */
export function notifyOpenSosWindow(ctx: NotifyCtx, organizationId: string): { email: boolean } | null {
  const now = notifyMicros(ctx.timestamp);
  const state = ctx.db.storeSosState.organizationId.find(organizationId);
  if (state != null && now - state.lastAtMicros < NOTIFY_SOS_COOLDOWN_MICROS) return null;
  const dayKey = notifyUtcDayKey(now);
  const dayCount = state?.dayKey === dayKey ? state.dayCount + 1 : 1;
  notifyPutSosState(ctx, { organizationId, lastAtMicros: now, dayKey, dayCount });
  return { email: dayCount <= NOTIFY_SOS_EMAIL_DAILY_CAP };
}

/**
 * An older tablet's SOS to `target`: whether it may push. Only to an active
 * owner / manager, and once each per window: the first call opens the window,
 * the rest of the same fan-out arrives within NOTIFY_SOS_BURST_MICROS, and
 * anything later in the window stays in the app. Never emailed.
 */
export function notifyLegacySosMayPush(ctx: NotifyCtx, organizationId: string, target: NotifyIdentity): boolean {
  if (!notifyIsManagerTarget(ctx, organizationId, target)) return false;
  const now = notifyMicros(ctx.timestamp);
  const state = ctx.db.storeSosState.organizationId.find(organizationId);
  if (state == null || now - state.lastAtMicros >= NOTIFY_SOS_COOLDOWN_MICROS) {
    notifyPutSosState(ctx, { organizationId, lastAtMicros: now, dayKey: state?.dayKey ?? '', dayCount: state?.dayCount ?? 0 });
    return true;
  }
  if (now - state.lastAtMicros >= NOTIFY_SOS_BURST_MICROS) return false;
  for (const d of ctx.db.notificationDelivery.byTargetId.filter(target)) {
    const sos = d.sourceKind === 'device' && (d.template === 'custom' || d.template === NOTIFY_EMERGENCY_TEMPLATE);
    if (sos && d.organizationId === organizationId && notifyMicros(d.createdAt) >= state.lastAtMicros) return false;
  }
  return true;
}
