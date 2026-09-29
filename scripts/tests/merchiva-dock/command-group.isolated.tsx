// Isolated fixture for scripts/tests/merchiva-dock/command-group.test.ts — NOT auto-discovered by
// `bun test`. CommandGroup runs the addRole / addRoleTask blocks of one Mr. Merchiva reply, each
// through the autonomy gate (lib/merchiva/role-task-gate.ts). This checks, against the default
// config (auto_low: addRole waits for Confirm, addRoleTask runs on its own):
//   - a job's reply restored from history as a placeholder, then finished, runs as its gate says;
//   - a task naming the reply's new role in roleId (addRoleTask's only role field) waits for it;
//   - a task stays waiting while its role is being added, whatever else is confirmed meanwhile.
//
// CommandGroup renders through Ink's reconciler (this suite has no DOM): the cards are mocked to
// render nothing and hand over their props, while every hook and effect of the group still runs.
// Writes go through the real lib/spacetimedb/actions wrappers to a fake connection whose cache the
// group reads back (lib/merchiva/role-cache.ts). Module mocks leak into other files of the same
// process, so this runs in its own.

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement as h } from "react";
import { render } from "ink-testing-library";
import { DEFAULT_AUTONOMY_CONFIG, type AutonomyConfig } from "@/lib/merchiva/autonomy";
import { finishJobMessage } from "@/lib/merchiva/job-reply";
import type { CardGate } from "@/lib/merchiva/role-task-gate";
import type { ChatMessage, RoleAddCmd, TaskAddCmd } from "@/lib/merchiva/skills/types";
import { clearConnection, setActiveOrgId, setConnection } from "@/lib/spacetimedb/client";

// ── Controllable fakes ──────────────────────────────────────────────────────

type RoleCardProps = { role: RoleAddCmd; status: string; gate: CardGate; onApprove: () => unknown; onReject: () => void };
type TaskCardProps = { task: TaskAddCmd; status: string; failure?: string; gate: CardGate; onApprove: () => unknown };

const roleCards = new Map<string, RoleCardProps>();
const taskCards = new Map<string, TaskCardProps>();
const toasts: string[] = [];

mock.module("@/components/merchiva-dock/task-cards", () => ({
  RoleAddCard: (props: RoleCardProps) => {
    roleCards.set(props.role.title, props);
    return null;
  },
  TaskAddCard: (props: TaskCardProps) => {
    taskCards.set(props.task.title, props);
    return null;
  },
}));
const t = (key: string) => key;
mock.module("@/lib/i18n/context", () => ({ useT: () => t }));
mock.module("sonner", () => ({
  toast: Object.assign((m: string) => void toasts.push(m), {
    success: (m: string) => void toasts.push(m),
    error: (m: string) => void toasts.push(m),
  }),
}));

const { CommandGroup } = await import("@/components/merchiva-dock/command-group");

const ORG = "org-command-group";
const STAFF_ID = "7d8f2c1a-0000-4000-8000-000000000001";

interface RoleRow { id: string; organizationId: string; name: string }
interface TaskRow { id: string; organizationId: string; roleId: string; title: string; requiresEvidence: boolean }

let roles: RoleRow[] = [];
let tasks: TaskRow[] = [];
const calls: Array<{ reducer: string; args: Record<string, unknown> }> = [];
/** When set, addStaffRole holds its write until the test releases it. */
let holdRoleWrites: Promise<void> | null = null;
let nextId = 100;

function newId(): string {
  return `7d8f2c1a-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
}

// The module's reducers, as far as the group sees them: each write lands in the cache it reads.
const fakeConn = {
  db: {
    staffRole: { iter: () => roles },
    roleTask: { iter: () => tasks },
  },
  reducers: {
    addStaffRole: async (args: Record<string, unknown>) => {
      calls.push({ reducer: "addStaffRole", args });
      if (holdRoleWrites) await holdRoleWrites;
      roles.push({ id: newId(), organizationId: ORG, name: String(args.name) });
    },
    addRoleTask: async (args: Record<string, unknown>) => {
      calls.push({ reducer: "addRoleTask", args });
      tasks.push({ id: newId(), organizationId: ORG, roleId: String(args.roleId), title: String(args.title), requiresEvidence: false });
    },
    deleteRoleTask: async (args: Record<string, unknown>) => void calls.push({ reducer: "deleteRoleTask", args }),
    deleteStaffRole: async (args: Record<string, unknown>) => void calls.push({ reducer: "deleteStaffRole", args }),
  },
};

// Bun's navigator has no onLine, which the offline-aware wrappers read as "offline".
const nav = globalThis.navigator as { onLine?: boolean };
const hadOnLine = Object.getOwnPropertyDescriptor(nav, "onLine");

beforeAll(() => {
  Object.defineProperty(nav, "onLine", { value: true, configurable: true });
  setConnection(fakeConn as unknown as Parameters<typeof setConnection>[0]);
  setActiveOrgId(ORG);
});

afterAll(() => {
  clearConnection();
  if (hadOnLine) Object.defineProperty(nav, "onLine", hadOnLine);
  else delete nav.onLine;
});

let app: ReturnType<typeof render> | null = null;

beforeEach(() => {
  app?.unmount();
  app = null;
  roles = [{ id: STAFF_ID, organizationId: ORG, name: "Staff" }];
  tasks = [];
  calls.length = 0;
  toasts.length = 0;
  roleCards.clear();
  taskCards.clear();
  holdRoleWrites = null;
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Let React commit, run passive effects, and the group's async steps move on. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 10));
}

function role(title: string): RoleAddCmd {
  return { title, des: "", tasks: "", icon: "user", color: "#44403c" };
}

/** A task as parseAllSkills reads an addRoleTask block: its only role field is roleId. */
function task(title: string, roleId: string): TaskAddCmd {
  return { role: "", roleId, title, des: "", startTime: null, endTime: null, requiresEvidence: false };
}

function mount(opts: { roles?: RoleAddCmd[]; tasks?: TaskAddCmd[]; alreadyExecuted?: boolean; autonomy?: AutonomyConfig }) {
  app = render(
    h(CommandGroup, {
      roles: opts.roles,
      tasks: opts.tasks,
      storeRoles: roles,
      storeTasks: tasks,
      groupChats: [],
      autonomy: opts.autonomy ?? DEFAULT_AUTONOMY_CONFIG,
      can: () => true,
      alreadyExecuted: opts.alreadyExecuted,
    }),
  );
}

const reducers = () => calls.map((c) => c.reducer);

// ── Tests ───────────────────────────────────────────────────────────────────

describe("a job's reply restored from history", () => {
  // The dashboard saves the job's placeholder bubble mid-reply; every restored message comes back
  // executed (parseSessionMessages), and the job's reply is laid over that bubble once it is done.
  const placeholder: ChatMessage = { id: "job-j1", from: "merchiva", text: "", time: "", executed: true };

  test("finished by its job, it runs its cards as the gate says", async () => {
    const finished = finishJobMessage(placeholder, { text: "", tasksAdd: [task("Lock up", "Staff")] });
    expect(finished.executed).toBe(false);
    mount({ tasks: finished.tasksAdd, alreadyExecuted: finished.executed });
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0].reducer).toBe("addRoleTask");
    expect(calls[0].args).toMatchObject({ organizationId: ORG, roleId: STAFF_ID, title: "Lock up" });
    expect(taskCards.get("Lock up")?.status).toBe("added");
  });

  test("a reply restored as it was never runs again", async () => {
    mount({ tasks: [task("Lock up", "Staff")], alreadyExecuted: true });
    await settle();
    expect(calls).toHaveLength(0);
  });
});

describe("a task for a role the same reply creates, named in roleId", () => {
  test("waits for the role's Confirm instead of failing, then is added to it", async () => {
    mount({ roles: [role("Night Clerk")], tasks: [task("Lock up", "Night Clerk")] });
    await settle();
    expect(roleCards.get("Night Clerk")?.gate.decision).toBe("propose");
    expect(taskCards.get("Lock up")?.status).toBe("waiting-role");
    expect(toasts).toEqual([]);
    expect(calls).toHaveLength(0);

    await roleCards.get("Night Clerk")?.onApprove();
    await settle();
    const created = roles.find((r) => r.name === "Night Clerk");
    expect(reducers()).toEqual(["addStaffRole", "addRoleTask"]);
    expect(calls[1].args).toMatchObject({ roleId: created?.id, title: "Lock up" });
    expect(taskCards.get("Lock up")?.status).toBe("added");
  });

  test("fails as roleNotFound once that role is rejected", async () => {
    mount({ roles: [role("Night Clerk")], tasks: [task("Lock up", "Night Clerk")] });
    await settle();
    roleCards.get("Night Clerk")?.onReject();
    await settle();
    expect(taskCards.get("Lock up")?.status).toBe("failed");
    expect(taskCards.get("Lock up")?.failure).toBe("roleNotFound");
    expect(calls).toHaveLength(0);
  });
});

describe("a role being added", () => {
  test("keeps its tasks waiting while another role is rejected, then releases them", async () => {
    let release = () => {};
    holdRoleWrites = new Promise<void>((resolve) => {
      release = resolve;
    });
    mount({ roles: [role("Opener"), role("Closer")], tasks: [task("Unlock", "Opener")] });
    await settle();
    expect(taskCards.get("Unlock")?.status).toBe("waiting-role");

    const approving = roleCards.get("Opener")?.onApprove();
    await settle();
    expect(roleCards.get("Opener")?.status).toBe("adding");
    roleCards.get("Closer")?.onReject();
    await settle();
    expect(taskCards.get("Unlock")?.status).toBe("waiting-role");

    release();
    await approving;
    await settle();
    expect(roleCards.get("Opener")?.status).toBe("added");
    expect(reducers()).toEqual(["addStaffRole", "addRoleTask"]);
    expect(taskCards.get("Unlock")?.status).toBe("added");
    expect(toasts).toEqual([]);
  });
});
