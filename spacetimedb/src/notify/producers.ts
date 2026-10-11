// The module's notifications outside channels (../chat/notify.ts) and forms
// (../forms/responses.ts), on their way to deliver(): the owner / manager and
// whole-store fan-outs, and the classification of the two free-form
// reducers, createNotification (any member) and serviceCreateNotification
// (the cron jobs, the Mr. Merchiva background reply and the /merchivaAdmin
// console). index.ts and ../device/pin-guard.ts call these.
//
// Runtime imports: the pure ./logic and ../drive/logic, ./deliver and ./sos.

import { isOrgAdminRole } from '../drive/logic';
import { deliver, notifyStoreName, type NotifyCtx, type NotifyIdentity, type NotifyInput } from './deliver';
import { notifyEmailNeedsManager, notifyPreview, type NotifyTemplate } from './logic';
import { notifyIsManagerTarget, notifyLegacySosMayPush } from './sos';

/** One notification for many recipients: everything deliver() takes but the organization and the target. */
export type NotifyNotice = Omit<NotifyInput, 'organizationId' | 'target'>;

/** The arguments of createNotification / serviceCreateNotification (parameters frozen). */
export interface NotifyFreeForm {
  organizationId: string;
  targetIdentity: NotifyIdentity;
  type: string;
  title: string;
  body: string;
  link?: string | null;
}

/**
 * Sends `notice` to each active member `pick` accepts (once per identity,
 * never `exclude`). An empty `actor` param becomes the store's name (the
 * copy never shows a blank or an English stand-in). Low stock and waste are
 * emailed to owners and managers only; everyone else sees them in the app.
 */
function notifyFanOut(
  ctx: NotifyCtx, organizationId: string, notice: NotifyNotice, pick: (role: string) => boolean, exclude?: NotifyIdentity,
): void {
  let params = notice.params;
  if (params?.actor === '') params = { ...params, actor: notifyStoreName(ctx, organizationId) };
  const managersOnlyEmail = notifyEmailNeedsManager(notice.template, notice.sourceKind ?? '');
  const done = new Set<string>(exclude ? [exclude.toHexString()] : []);
  for (const m of ctx.db.orgMember.byOrganizationId.filter(organizationId)) {
    const hex = m.userId.toHexString();
    if (m.status !== 'active' || !pick(m.role) || done.has(hex)) continue;
    done.add(hex);
    const email = notice.email && (!managersOnlyEmail || isOrgAdminRole(m.role));
    deliver(ctx, { ...notice, params, email, organizationId, target: m.userId });
  }
}

/** Every active owner and manager of the organization (but `exclude`). */
export function notifyManagersOf(ctx: NotifyCtx, organizationId: string, notice: NotifyNotice, exclude?: NotifyIdentity): void {
  notifyFanOut(ctx, organizationId, notice, isOrgAdminRole, exclude);
}

/** Every active member of the organization (but `exclude`). */
export function notifyMembersOf(ctx: NotifyCtx, organizationId: string, notice: NotifyNotice, exclude?: NotifyIdentity): void {
  notifyFanOut(ctx, organizationId, notice, () => true, exclude);
}

/** The template of a reviewed time-off request: the status a manager set ('rejected' is the Merchiva action's word for denied). */
export function notifyTimeOffTemplate(status: string): NotifyTemplate {
  if (status === 'approved') return 'timeOff.approved';
  if (status === 'denied' || status === 'rejected') return 'timeOff.denied';
  return 'timeOff.updated';
}

/** A supplier raised something a person has to decide (logSupplierMessage / serviceLogSupplierMessage with `escalate`). */
export function notifySupplierIssue(ctx: NotifyCtx, organizationId: string, supplierName: string, body: string): void {
  notifyManagersOf(ctx, organizationId, {
    type: 'order', title: `Supplier issue: ${supplierName}`, body: body.length > 160 ? body.slice(0, 159) + '…' : body,
    link: '/manager/suppliers', template: 'supplier.issue', params: { supplier: supplierName, preview: notifyPreview(body, false) },
    email: true,
  });
}

/**
 * createNotification: a member's free-form row is never emailed. The store
 * SOS of an older cached tablet (type 'emergency') is shown under the
 * sender's name, and pushes to each owner / manager once per SOS window
 * (./sos.ts); every other type, and every other emergency, stays in the app.
 */
export function notifyFromClient(ctx: NotifyCtx, args: NotifyFreeForm, senderName: string): void {
  const emergency = args.type === 'emergency';
  const sender = senderName || notifyStoreName(ctx, args.organizationId);
  const push = emergency && notifyLegacySosMayPush(ctx, args.organizationId, args.targetIdentity);
  deliver(ctx, {
    organizationId: args.organizationId, target: args.targetIdentity, type: args.type,
    title: emergency ? `${sender}: ${args.title}` : args.title, body: args.body, link: args.link ?? '',
    template: 'custom', email: false, inAppOnly: !push, sourceKind: emergency ? 'device' : '',
  });
}

/**
 * serviceCreateNotification: a Mr. Merchiva background reply (its link carries
 * `mvsession=`) pushes and is never emailed; the low-stock scan ('order' /
 * 'inventory_low') emails owners and managers only; anything else (the
 * /merchivaAdmin console) pushes and is never emailed. The service cannot pass
 * template params (the reducer's parameters are frozen), so the copy is the
 * row's own (`custom`), except the Merchiva reply's preview.
 */
export function notifyFromService(ctx: NotifyCtx, args: NotifyFreeForm): void {
  const link = args.link ?? '';
  const row = {
    organizationId: args.organizationId, target: args.targetIdentity, type: args.type, title: args.title, body: args.body, link,
  };
  if (link.includes('mvsession=')) {
    deliver(ctx, { ...row, template: 'chat.merchiva', params: { preview: notifyPreview(args.body, false), conversation: '' }, email: false });
  } else if (args.type === 'order' || args.type === 'inventory_low') {
    const email = notifyIsManagerTarget(ctx, args.organizationId, args.targetIdentity);
    deliver(ctx, { ...row, template: 'custom', email, sourceKind: 'inventory' });
  } else {
    deliver(ctx, { ...row, template: 'custom', email: false });
  }
}
