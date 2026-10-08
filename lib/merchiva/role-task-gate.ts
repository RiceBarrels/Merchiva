/**
 * The autonomy gate for Mr. Merchiva's role and task cards. Pure.
 *
 * parseAllSkills turns addRole / addRoleTask / deleteRoleTask blocks (and the
 * legacy /roles and /tasks commands) into role and task cards — CommandGroup and
 * TaskDeleteGroup — instead of action cards, so decorateActions never stamps
 * them. They go through the same gateAction here, with the org config and the
 * permission predicate the dashboard gives decorateActions: no permission ⇒
 * "deny" (the card says why and never runs); otherwise the config decides
 * "auto" or "propose", exactly as for any other action.
 *
 * A command the user typed (`fromCommand`) still needs the permission, and
 * then runs as typed, whatever the config: typing it was the confirm. So is a
 * click on a card (Delete, Add, a retry), so there too only the permission
 * decides whether it may run ({@link mayRun}).
 */

import { isUuidRef } from "./action-ids";
import { gateAction, type AutonomyConfig, type GateDecision, type GateResult } from "./autonomy";
import { gateReasonText, type GateReason } from "./autonomy-reason";
import { resolveRoleRefs, type RoleLike } from "./role-ref";

export type RoleTaskAction = "addRole" | "addRoleTask" | "deleteRoleTask" | "deleteRole";

const ROLE_TASK_ACTIONS: readonly RoleTaskAction[] = ["addRole", "addRoleTask", "deleteRoleTask", "deleteRole"];

/** The permission predicate decorateActions gates with: the viewer's `can`. */
export type GateCan = Parameters<typeof gateAction>[3];

export interface RoleTaskGateOptions {
  /** The reply to a command the user typed: with the permission, it runs as typed. */
  fromCommand?: boolean;
}

/** What a card shows of the gate: its decision, and why when it holds the item back. */
export interface CardGate {
  decision: GateDecision;
  why?: GateReason;
}

/** The gate's decision on one role or task card. */
export function gateRoleTaskAction(
  action: RoleTaskAction,
  config: AutonomyConfig,
  can: GateCan,
  opts: RoleTaskGateOptions = {},
): GateResult {
  // No params or context: no cap reads a role or task action's params, and
  // decorateActions passes no daily count either.
  const gate = gateAction(action, {}, config, can);
  if (gate.decision === "deny" || !opts.fromCommand) return gate;
  const why: GateReason = { code: "userCommand" };
  return { ...gate, decision: "auto", why, reason: gateReasonText(why) };
}

export type RoleTaskGates = Readonly<Record<RoleTaskAction, GateResult>>;

/** The gate's decision on every kind of role and task card, for one reply. */
export function gateRoleTaskCards(
  config: AutonomyConfig,
  can: GateCan,
  opts: RoleTaskGateOptions = {},
): RoleTaskGates {
  const out = {} as Record<RoleTaskAction, GateResult>;
  for (const action of ROLE_TASK_ACTIONS) out[action] = gateRoleTaskAction(action, config, can, opts);
  return out;
}

/** Whether a click on a card may run the action: the user's click is the confirm, so only the permission counts. */
export function mayRun(gate: GateResult): boolean {
  return gate.decision !== "deny";
}

/**
 * What a card waiting its turn shows. `queued` is whether the card was cleared
 * to run on its own when the reply arrived: a config that loads later must not
 * strand it between "waiting for a click" and "running on its own", so only a
 * lost permission overrides it. Why is shown only when it explains a hold.
 */
export function pendingCardGate(live: GateResult, queued: boolean): CardGate {
  if (live.decision === "deny") return { decision: "deny", why: live.why };
  if (queued) return { decision: "auto" };
  return { decision: "propose", why: live.decision === "propose" ? live.why : undefined };
}

function lower(v: unknown): string {
  return v == null ? "" : String(v).trim().toLowerCase();
}

/**
 * The role of this reply that the task names, among those `only` keeps; -1 for
 * none. A name can sit in either field: `roleId` is addRoleTask's only role
 * field, so a task for a role the same reply creates carries its name there.
 */
export function replyRoleIndex(
  task: { role: string; roleId?: string },
  replyRoles: readonly { title: string }[],
  only: (index: number) => boolean = () => true,
): number {
  const names = [task.role, task.roleId].filter((v) => !!v && !isUuidRef(v)).map(lower).filter(Boolean);
  if (names.length === 0) return -1;
  return replyRoles.findIndex((r, i) => only(i) && names.includes(lower(r.title)));
}

/**
 * The role of this reply that a task waits on: one the reply creates under the
 * name the task gives, not yet created (`awaiting`: waiting for approval, or
 * being added), while the store has no role the task names. -1 when the task
 * can run now.
 */
export function awaitedRole(
  task: { role: string; roleId?: string },
  replyRoles: readonly { title: string }[],
  awaiting: ReadonlySet<number>,
  storeRoles: readonly RoleLike[],
): number {
  if (resolveRoleRefs(storeRoles, [task.roleId, task.role])) return -1;
  return replyRoleIndex(task, replyRoles, (i) => awaiting.has(i));
}
