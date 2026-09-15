"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
  DynamicUIElementDescription,
} from "@/components/ui/dynamic-ui-element";
import { useT } from "@/lib/i18n/context";
import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";
import {
  ORG_PERMS,
  ORG_PERMS_FLAT,
  builtinRoleName,
  fmt,
  permGroupLabel,
  permLabel,
  type OrgNode,
  type PermLeaf,
} from "./data";
import type { RoleRow, UseOrgGraphResult } from "./use-org-graph";

// ─── Constants ────────────────────────────────────────────────────────────

const ROLE_COLOR_SWATCHES = [
  "#1c1917", "#44403c", "#78716c", "#a8a29e",
  "#7c3aed", "#0891b2", "#0d9488", "#16a34a",
  "#ea580c", "#dc2626", "#db2777", "#2563eb",
  "#ca8a04", "#65a30d", "#9333ea", "#0369a1",
];

const FALLBACK_COLOR = "#78716c";
/** Permission ticks are batched into one write per role after this pause. */
const PERMS_COMMIT_DELAY_MS = 250;
/** How long a commit waits for the subscription to echo it before the next one runs. */
const ECHO_TIMEOUT_MS = 2500;
/** How long the editor waits for a just-created role row to arrive. */
const CREATED_ROLE_TIMEOUT_MS = 6000;

const CATALOG_IDS = ORG_PERMS_FLAT.map((p) => p.id);
const CATALOG_SET = new Set(CATALOG_IDS);

/**
 * The two-step list → editor layout is used below this width — the same
 * breakpoint where DynamicUIElementContent becomes a full-screen page
 * (max-width: 639px). Wider viewports get the split view in the capped modal.
 */
const PHONE_BREAKPOINT = 640;
/** The same rejected-name toast isn't repeated for a draft within this window. */
const REPEAT_TOAST_MS = 1500;

/** Horizontal padding for editor sections; the phone page already pads 16px. */
const PAD = "px-5 max-sm:px-0";

const K = "personnel.team.org.roles";

type TFn = ReturnType<typeof useT>;

// ─── Draft model ──────────────────────────────────────────────────────────
//
// Edits are held locally per role and committed as one upsertRole call on
// blur / Enter / swatch click / Done / close (permissions: debounced). Inputs
// never write to the database from onChange.

type RolePatch = Partial<Pick<RoleRow, "name" | "color" | "icon" | "description" | "perms">>;

interface RoleDraftFields {
  name?: string;
  description?: string;
  color?: string;
  perms?: string[];
}

interface RoleTarget {
  id: string;
  key: string;
}

interface DraftEntry {
  target: RoleTarget;
  fields: RoleDraftFields;
}

type DraftMap = Record<string, DraftEntry>;

type CommitResult = "noop" | "ok" | "failed" | "invalid";

interface FlushResult {
  /** Every draft saved (nothing failed, no name was rejected). */
  clean: boolean;
  /** First draft whose name was rejected, if any. */
  invalidId: string | null;
}

type NameProblem = "required" | "taken";

interface RoleSelection {
  id: string | null;
  key: string | null;
}

/**
 * Stable draft identity. A built-in role keeps its identity when its
 * placeholder row (`__builtin__<key>`) is materialised into a real row
 * (built-in names can't be renamed, so the key is stable); custom roles use
 * their row id, which survives renames.
 */
function draftIdOf(r: RoleRow): string {
  return r.isBuiltin ? `builtin:${r.key}` : r.id;
}

function findRole(list: RoleRow[], target: RoleTarget): RoleRow | undefined {
  return list.find((r) => r.id === target.id) ?? list.find((r) => r.key === target.key);
}

function samePerms(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const id of sa) if (!sb.has(id)) return false;
  return true;
}

/** Catalog order first, then any legacy ids the catalog doesn't know about. */
function orderPerms(ids: Iterable<string>): string[] {
  const set = new Set(ids);
  return [...CATALOG_IDS.filter((id) => set.has(id)), ...[...set].filter((id) => !CATALOG_SET.has(id))];
}

function normalizeHex(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : FALLBACK_COLOR;
}

function reflects(row: RoleRow, patch: RolePatch): boolean {
  if (patch.name !== undefined && row.name !== patch.name) return false;
  if (patch.description !== undefined && row.description !== patch.description) return false;
  if (patch.color !== undefined && row.color.toLowerCase() !== patch.color.toLowerCase()) return false;
  if (patch.perms !== undefined && !samePerms(row.perms, patch.perms)) return false;
  return true;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function waitFor(check: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (check()) return resolve(true);
      if (Date.now() - started >= timeoutMs) return resolve(false);
      setTimeout(tick, 40);
    };
    tick();
  });
}

function displayNameOf(t: TFn, r: RoleRow): string {
  return builtinRoleName(t, r.key) ?? r.name;
}

/** Why a custom role's draft name can't be saved; null when it's fine or unchanged. */
function nameProblemOf(list: RoleRow[], r: RoleRow, draftName: string | undefined): NameProblem | null {
  if (r.isBuiltin || draftName === undefined) return null;
  const name = draftName.trim();
  if (!name) return "required";
  if (name === r.name) return null;
  const key = name.toLowerCase();
  return list.some((o) => o.id !== r.id && o.key === key) ? "taken" : null;
}

function nameProblemMessage(t: TFn, problem: NameProblem, draftName: string): string {
  return problem === "required"
    ? t(`${K}.nameRequired`)
    : fmt(t(`${K}.nameTaken`), { name: draftName.trim() });
}

// ─── Component ────────────────────────────────────────────────────────────

export function RoleManager({
  open,
  onClose,
  roles,
  nodes,
  canManageRoles,
  isOwner,
  upsertRole,
  createRole,
  deleteRole,
}: {
  open: boolean;
  onClose: () => void;
  roles: RoleRow[];
  nodes: OrgNode[];
  canManageRoles: boolean;
  /**
   * Renaming or deleting a role members still hold is owner-only for now:
   * until the module's member cascade is published, only the owner's client
   * can move those members onto another role.
   */
  isOwner: boolean;
  upsertRole: UseOrgGraphResult["upsertRole"];
  createRole: UseOrgGraphResult["createRole"];
  deleteRole: UseOrgGraphResult["deleteRole"];
}) {
  const t = useT();
  const isMobile = useIsMobile(PHONE_BREAKPOINT);
  const readOnly = !canManageRoles;

  const [selected, setSelected] = useState<RoleSelection>({ id: null, key: null });
  const [mobileStep, setMobileStep] = useState<"list" | "edit">("list");
  const [creating, setCreating] = useState(false);
  const [awaitingKey, setAwaitingKey] = useState<string | null>(null);
  const [justCreatedKey, setJustCreatedKey] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [doneBusy, setDoneBusy] = useState(false);
  const [savingCount, setSavingCount] = useState(0);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [prevOpen, setPrevOpen] = useState(open);

  // Re-opening an always-mounted manager starts from the role list on phones.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setMobileStep("list");
  }

  // ── Selection: stable id first, lower-cased name as the fallback ─────────
  const resolved =
    (selected.id ? roles.find((r) => r.id === selected.id) : undefined) ??
    (selected.key ? roles.find((r) => r.key === selected.key) : undefined) ??
    null;
  const waitingForCreated =
    !resolved && (creating || (awaitingKey !== null && awaitingKey === selected.key));
  const fallback = !resolved && !waitingForCreated ? roles[0] ?? null : null;
  const role = resolved ?? fallback;

  if (role && (role.id !== selected.id || role.key !== selected.key)) {
    // Placeholder → materialised row, created role arriving, rename, or the
    // selected role disappearing (fallback to the first role).
    setSelected({ id: role.id, key: role.key });
    if (fallback && selected.id !== null && mobileStep === "edit") setMobileStep("list");
  }
  if (resolved && awaitingKey !== null && awaitingKey === resolved.key) {
    setAwaitingKey(null);
  }

  useEffect(() => {
    if (awaitingKey === null) return;
    const handle = setTimeout(() => setAwaitingKey(null), CREATED_ROLE_TIMEOUT_MS);
    return () => clearTimeout(handle);
  }, [awaitingKey]);

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of nodes) {
      if (n.kind !== "person" || n.id.startsWith("inv-")) continue;
      const k = n.role.trim().toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }, [nodes]);

  // ── Commit machinery (refs so queued work always sees the latest data) ───
  const latestRef = useRef({ roles, upsertRole, t, usage, isOwner });
  useEffect(() => {
    latestRef.current = { roles, upsertRole, t, usage, isOwner };
  });
  const draftsRef = useRef<DraftMap>({});
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const sessionOkRef = useRef(0);
  /** Bumped on every draft edit, so a queued commit knows whether it is still current. */
  const versionsRef = useRef<Map<string, number>>(new Map());
  /** The commit queued or running for each draft, and the draft version it was queued at. */
  const jobsRef = useRef<Map<string, { version: number; job: Promise<CommitResult> }>>(new Map());
  /** Last rejected-name toast per draft, so re-validating the kept name doesn't spam. */
  const toastedRef = useRef<Map<string, { sig: string; at: number }>>(new Map());

  const writeDrafts = useCallback((next: DraftMap) => {
    draftsRef.current = next;
    setDrafts(next);
  }, []);

  const patchDraft = useCallback((r: RoleRow, fields: RoleDraftFields) => {
    const id = draftIdOf(r);
    const cur = draftsRef.current[id];
    versionsRef.current.set(id, (versionsRef.current.get(id) ?? 0) + 1);
    writeDrafts({
      ...draftsRef.current,
      [id]: { target: { id: r.id, key: r.key }, fields: { ...cur?.fields, ...fields } },
    });
  }, [writeDrafts]);

  /** Drop draft fields whose value is still exactly what was examined. */
  const pruneDraft = useCallback((draftId: string, examined: RoleDraftFields) => {
    const cur = draftsRef.current[draftId];
    if (!cur) return;
    const fields: RoleDraftFields = { ...cur.fields };
    if (examined.name !== undefined && fields.name === examined.name) delete fields.name;
    if (examined.description !== undefined && fields.description === examined.description) delete fields.description;
    if (examined.color !== undefined && fields.color === examined.color) delete fields.color;
    if (examined.perms !== undefined && fields.perms === examined.perms) delete fields.perms;
    const next = { ...draftsRef.current };
    if (Object.keys(fields).length === 0) delete next[draftId];
    else next[draftId] = { ...cur, fields };
    writeDrafts(next);
  }, [writeDrafts]);

  /** Toast a rejected name once per value; a forced flush (Done) may repeat it after a pause. */
  const reportRejected = useCallback((draftId: string, sig: string, force: boolean, show: () => void) => {
    const last = toastedRef.current.get(draftId);
    const now = Date.now();
    if (last && last.sig === sig && (!force || now - last.at < REPEAT_TOAST_MS)) return;
    toastedRef.current.set(draftId, { sig, at: now });
    show();
  }, []);

  const runCommit = useCallback(async (draftId: string, force: boolean): Promise<CommitResult> => {
    const entry = draftsRef.current[draftId];
    if (!entry) return "noop";
    const { roles: list, upsertRole: upsert, t: tr, usage: counts, isOwner: owner } = latestRef.current;
    const examined: RoleDraftFields = { ...entry.fields };
    const r = findRole(list, entry.target);
    if (!r) {
      pruneDraft(draftId, examined);
      return "noop";
    }

    const patch: RolePatch = {};
    // `invalid` reports a rejected name. `keepName` leaves that name in the
    // draft (still visible and fixable) instead of pruning it, so Done
    // re-validates it and stays open.
    let invalid = false;
    let keepName = false;
    if (examined.name !== undefined && !r.isBuiltin) {
      const name = examined.name.trim();
      const problem = nameProblemOf(list, r, examined.name);
      if (name !== r.name && !owner && (counts.get(r.key) ?? 0) > 0) {
        // Owner-only while members hold the role (the name input is read-only
        // then, so a stale draft can't be fixed — drop it).
        invalid = true;
        reportRejected(draftId, `owner:${name}`, force, () => toast.warning(tr(`${K}.ownerOnlyInUse`)));
      } else if (problem) {
        invalid = true;
        keepName = true;
        reportRejected(draftId, `${problem}:${name}`, force, () => toast.error(nameProblemMessage(tr, problem, name)));
      } else {
        toastedRef.current.delete(draftId);
        if (name !== r.name) patch.name = name;
      }
    }
    if (examined.description !== undefined) {
      const description = examined.description.trim();
      if (description !== r.description) patch.description = description;
    }
    if (examined.color !== undefined && examined.color.toLowerCase() !== r.color.toLowerCase()) {
      patch.color = examined.color;
    }
    if (examined.perms !== undefined && !samePerms(examined.perms, r.perms)) {
      patch.perms = examined.perms;
    }

    /** Fields the draft may drop once this commit settles (never a kept rejected name). */
    const settledFields = (): RoleDraftFields => {
      const out: RoleDraftFields = { ...examined };
      if (keepName) delete out.name;
      return out;
    };

    if (Object.keys(patch).length === 0) {
      pruneDraft(draftId, settledFields());
      return invalid ? "invalid" : "noop";
    }

    let ok = false;
    try {
      ok = await upsert(r.id, patch);
    } catch (err) {
      toast.error(errorMessage(err, tr(`${K}.saveFailed`)));
    }
    if (!ok) {
      // Keep the unsaved values visible so Done can retry them.
      const settled = settledFields();
      if (patch.name !== undefined) delete settled.name;
      if (patch.description !== undefined) delete settled.description;
      if (patch.color !== undefined) delete settled.color;
      if (patch.perms !== undefined) delete settled.perms;
      pruneDraft(draftId, settled);
      return invalid ? "invalid" : "failed";
    }

    // Wait for the subscription to echo the write so the next queued commit
    // (and the hook's merge of unchanged fields) sees fresh data.
    const wasPlaceholder = r.isPlaceholder;
    const echoTarget: RoleTarget = { id: r.id, key: patch.name ? patch.name.toLowerCase() : r.key };
    await waitFor(() => {
      const row = findRole(latestRef.current.roles, echoTarget);
      return !!row && (!wasPlaceholder || !row.isPlaceholder) && reflects(row, patch);
    }, ECHO_TIMEOUT_MS);
    sessionOkRef.current += 1;
    pruneDraft(draftId, settledFields());
    return invalid ? "invalid" : "ok";
  }, [pruneDraft, reportRejected]);

  const enqueue = useCallback((draftId: string, force = false): Promise<CommitResult> => {
    const timer = timersRef.current.get(draftId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(draftId);
    }
    // A commit already queued or running for this exact draft version covers
    // the request (e.g. Done racing a close, or a close and the unmount both
    // flushing) — don't send the same write, or toast its error, twice.
    const version = versionsRef.current.get(draftId) ?? 0;
    const existing = jobsRef.current.get(draftId);
    if (existing && existing.version === version) return existing.job;

    setSavingCount((n) => n + 1);
    const entry: { version: number; job: Promise<CommitResult> } = { version, job: Promise.resolve("noop") };
    entry.job = queueRef.current
      .then(() => runCommit(draftId, force))
      .catch((): CommitResult => "failed")
      .finally(() => {
        setSavingCount((n) => Math.max(0, n - 1));
        if (jobsRef.current.get(draftId) === entry) jobsRef.current.delete(draftId);
      });
    jobsRef.current.set(draftId, entry);
    queueRef.current = entry.job;
    return entry.job;
  }, [runCommit]);

  const flushDraft = useCallback((draftId: string): Promise<CommitResult> => {
    if (!draftsRef.current[draftId] && !timersRef.current.has(draftId)) return Promise.resolve("noop");
    return enqueue(draftId);
  }, [enqueue]);

  /** Commit every pending draft. `force` re-reports a still-rejected name (Done). */
  const flushAll = useCallback(async (force = false): Promise<FlushResult> => {
    for (const handle of timersRef.current.values()) clearTimeout(handle);
    timersRef.current.clear();
    const ids = Object.keys(draftsRef.current);
    const results = await Promise.all(ids.map((id) => enqueue(id, force)));
    const invalidAt = results.indexOf("invalid");
    return {
      clean: !results.some((r) => r === "failed" || r === "invalid"),
      invalidId: invalidAt >= 0 ? ids[invalidAt] : null,
    };
  }, [enqueue]);

  const schedulePermsCommit = useCallback((draftId: string) => {
    const existing = timersRef.current.get(draftId);
    if (existing) clearTimeout(existing);
    timersRef.current.set(
      draftId,
      setTimeout(() => {
        timersRef.current.delete(draftId);
        void enqueue(draftId);
      }, PERMS_COMMIT_DELAY_MS),
    );
  }, [enqueue]);

  // Unmounting (the panel closes the manager by unmounting it) must not drop
  // a pending debounced permission write or an uncommitted draft. Closing
  // doesn't flush on its own, so each close commits the drafts exactly once.
  useEffect(() => () => { void flushAll(); }, [flushAll]);

  // An always-mounted manager commits its drafts when it's closed instead.
  useEffect(() => {
    if (!open && Object.keys(draftsRef.current).length > 0) void flushAll();
  }, [open, flushAll]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleOpenChange(next: boolean) {
    if (next) return;
    sessionOkRef.current = 0;
    onClose();
  }

  async function handleDone() {
    if (doneBusy) return;
    if (readOnly) {
      onClose();
      return;
    }
    setDoneBusy(true);
    let result: FlushResult = { clean: false, invalidId: null };
    try {
      result = await flushAll(true);
    } finally {
      setDoneBusy(false);
    }
    if (!result.clean) {
      // Errors were toasted; keep the editor open, on the role whose name was rejected.
      const target = result.invalidId ? draftsRef.current[result.invalidId]?.target : undefined;
      const r = target ? findRole(latestRef.current.roles, target) : undefined;
      if (r) {
        setSelected({ id: r.id, key: r.key });
        setJustCreatedKey(null);
        if (isMobile) setMobileStep("edit");
      }
      return;
    }
    if (sessionOkRef.current > 0) toast.success(t(`${K}.saved`));
    sessionOkRef.current = 0;
    onClose();
  }

  function handleSelect(r: RoleRow) {
    if (role && draftIdOf(role) !== draftIdOf(r)) void flushDraft(draftIdOf(role));
    setSelected({ id: r.id, key: r.key });
    setJustCreatedKey(null);
    if (isMobile) setMobileStep("edit");
  }

  function handleBack() {
    if (role) void flushDraft(draftIdOf(role));
    setMobileStep("list");
  }

  async function handleAdd() {
    if (readOnly || creating) return;
    if (role) void flushDraft(draftIdOf(role));
    setCreating(true);
    let key: string | null = null;
    try {
      key = await createRole();
    } catch (err) {
      toast.error(errorMessage(err, t(`${K}.createFailed`)));
    } finally {
      setCreating(false);
    }
    if (!key) return;
    setAwaitingKey(key);
    setJustCreatedKey(key);
    setSelected({ id: null, key });
    if (isMobile) setMobileStep("edit");
  }

  async function handleDelete(r: RoleRow) {
    if (readOnly || r.isBuiltin || deletingId) return;
    const count = usage.get(r.key) ?? 0;
    if (count > 0 && !isOwner) {
      toast.warning(t(`${K}.ownerOnlyInUse`));
      return;
    }
    const name = displayNameOf(t, r);
    const message = count > 0
      ? fmt(t(`${K}.confirmDeleteInUse`), { n: count, name })
      : fmt(t(`${K}.confirmDelete`), { name });
    if (!window.confirm(message)) return;

    const draftId = draftIdOf(r);
    const timer = timersRef.current.get(draftId);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(draftId);
    }
    if (draftsRef.current[draftId]) {
      const next = { ...draftsRef.current };
      delete next[draftId];
      writeDrafts(next);
    }

    setDeletingId(r.id);
    let ok = false;
    try {
      ok = await deleteRole(r.id);
    } catch (err) {
      toast.error(errorMessage(err, t(`${K}.deleteFailed`)));
    } finally {
      setDeletingId(null);
    }
    if (!ok) return;

    const index = roles.findIndex((x) => x.id === r.id);
    const rest = roles.filter((x) => x.id !== r.id);
    const nextRole = rest[Math.min(Math.max(index, 0), rest.length - 1)] ?? null;
    setSelected(nextRole ? { id: nextRole.id, key: nextRole.key } : { id: null, key: null });
    setJustCreatedKey(null);
    if (isMobile) setMobileStep("list");
  }

  // Editor callbacks bound to the selected role.
  function handleDraft(fields: RoleDraftFields) {
    if (!role || readOnly) return;
    patchDraft(role, fields);
  }

  function handleCommit() {
    if (!role || readOnly) return;
    void flushDraft(draftIdOf(role));
  }

  function handlePickColor(color: string) {
    if (!role || readOnly) return;
    patchDraft(role, { color });
    void enqueue(draftIdOf(role));
  }

  function currentPerms(r: RoleRow): string[] {
    return draftsRef.current[draftIdOf(r)]?.fields.perms ?? r.perms;
  }

  function handleTogglePerm(permId: string, on: boolean) {
    if (!role || readOnly) return;
    const set = new Set(currentPerms(role));
    if (on) set.add(permId);
    else set.delete(permId);
    patchDraft(role, { perms: orderPerms(set) });
    schedulePermsCommit(draftIdOf(role));
  }

  function handleSetAllPerms(on: boolean) {
    if (!role || readOnly) return;
    const extras = currentPerms(role).filter((id) => !CATALOG_SET.has(id));
    patchDraft(role, { perms: on ? orderPerms([...CATALOG_IDS, ...extras]) : [] });
    schedulePermsCommit(draftIdOf(role));
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const title = t(`${K}.title`);

  const roleUsage = role ? usage.get(role.key) ?? 0 : 0;
  const lockedInUse = !!role && !readOnly && !isOwner && !role.isBuiltin && roleUsage > 0;
  const roleDraftName = role ? drafts[draftIdOf(role)]?.fields.name : undefined;
  const roleNameProblem = role && !lockedInUse ? nameProblemOf(roles, role, roleDraftName) : null;
  const nameError = roleNameProblem ? nameProblemMessage(t, roleNameProblem, roleDraftName ?? "") : null;

  const listPane = (
    <RoleListPane
      t={t}
      roles={roles}
      drafts={drafts}
      usage={usage}
      selectedId={isMobile ? null : role?.id ?? null}
      isMobile={isMobile}
      readOnly={readOnly}
      creating={creating}
      onSelect={handleSelect}
      onAdd={handleAdd}
    />
  );

  const renderEditor = (onBack?: () => void): ReactNode => {
    if (role) {
      return (
        <RoleEditorPane
          key={draftIdOf(role)}
          t={t}
          role={role}
          draft={drafts[draftIdOf(role)]?.fields}
          usageCount={roleUsage}
          isMobile={isMobile}
          readOnly={readOnly}
          lockedInUse={lockedInUse}
          nameError={nameError}
          deleting={deletingId === role.id}
          autoFocusName={justCreatedKey !== null && justCreatedKey === role.key}
          onBack={onBack}
          onDraft={handleDraft}
          onCommit={handleCommit}
          onPickColor={handlePickColor}
          onTogglePerm={handleTogglePerm}
          onSetAllPerms={handleSetAllPerms}
          onDelete={() => void handleDelete(role)}
        />
      );
    }
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {onBack && (
          <div className={cn("py-2 border-b border-border", PAD)}>
            <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label={t("common.back")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center py-10 text-[12.5px] text-muted-foreground">
          {waitingForCreated ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-label={t("common.loading")} />
          ) : (
            t(`${K}.empty`)
          )}
        </div>
      </div>
    );
  };

  const footer = (
    <RoleFooter
      t={t}
      isMobile={isMobile}
      readOnly={readOnly}
      saving={savingCount > 0}
      busy={doneBusy}
      showNote={!isMobile || mobileStep === "edit"}
      onDone={() => void handleDone()}
    />
  );

  return (
    <DynamicUIElement open={open} onOpenChange={handleOpenChange}>
      {/* Capped to the viewport so the header and Done stay reachable on short
          (landscape) screens; p-0! beats html.mobile-device's dialog padding. */}
      <DynamicUIElementContent className="sm:max-w-[min(840px,calc(100%-2rem))] sm:h-[min(600px,calc(100dvh-2rem))] flex flex-col gap-0 p-0! overflow-hidden">
        <DynamicUIElementHeader className="px-5 py-3.5 border-b border-border">
          <DynamicUIElementTitle mobileTitle={title}>{title}</DynamicUIElementTitle>
          <DynamicUIElementDescription className="[@media(max-height:480px)]:sr-only">
            {t(`${K}.subtitle`)}
          </DynamicUIElementDescription>
        </DynamicUIElementHeader>

        {isMobile ? (
          <div className="flex-1 min-h-0 flex flex-col">
            {mobileStep === "edit" ? renderEditor(handleBack) : listPane}
            {footer}
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex">
            {listPane}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col">
              {renderEditor()}
              {footer}
            </div>
          </div>
        )}
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────

function RoleAvatar({ color, name, large = false }: { color: string; name: string; large?: boolean }) {
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border text-white font-semibold shrink-0",
        large ? "h-10 w-10 text-[14px]" : "h-7 w-7 text-[11px]",
      )}
      style={{ background: color }}
    >
      {initial}
    </span>
  );
}

function RoleListPane({
  t,
  roles,
  drafts,
  usage,
  selectedId,
  isMobile,
  readOnly,
  creating,
  onSelect,
  onAdd,
}: {
  t: TFn;
  roles: RoleRow[];
  drafts: DraftMap;
  usage: Map<string, number>;
  selectedId: string | null;
  isMobile: boolean;
  readOnly: boolean;
  creating: boolean;
  onSelect: (r: RoleRow) => void;
  onAdd: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col min-h-0",
        isMobile ? "flex-1" : "w-[220px] md:w-[260px] shrink-0 border-r border-border",
      )}
    >
      {readOnly && (
        <p className={cn("py-2 border-b border-border text-[11.5px] text-muted-foreground", isMobile ? PAD : "px-3")}>
          {t(`${K}.readOnly`)}
        </p>
      )}
      <nav aria-label={t(`${K}.title`)} className="flex-1 min-h-0 overflow-y-auto py-1">
        {roles.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <ul>
            {roles.map((r) => {
              const fields = drafts[draftIdOf(r)]?.fields;
              // A rejected draft name stays in the editor, not in the list.
              const name = r.isBuiltin
                ? displayNameOf(t, r)
                : (!nameProblemOf(roles, r, fields?.name) && fields?.name?.trim()) || r.name;
              const color = normalizeHex(fields?.color ?? r.color);
              const permCount = (fields?.perms ?? r.perms).length;
              const count = usage.get(r.key) ?? 0;
              const selected = r.id === selectedId;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(r)}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "w-full flex items-center gap-2.5 py-2 text-left transition-colors outline-none focus-visible:bg-muted/60",
                      selected ? "bg-muted/60" : "hover:bg-muted/40",
                      isMobile ? cn("py-2.5 border-b border-border", PAD) : "px-3",
                    )}
                  >
                    <RoleAvatar color={color} name={name} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[12.5px] font-medium text-foreground truncate">{name}</span>
                        {r.isBuiltin && (
                          <Eyebrow as="span" size="xs" className="text-[9px] shrink-0">
                            {t(`${K}.builtin`)}
                          </Eyebrow>
                        )}
                      </span>
                      <span className="block text-[10.5px] text-muted-foreground truncate">
                        {fmt(t(`${K}.permCount`), { n: permCount })}
                      </span>
                    </span>
                    <span className="text-[10.5px] font-mono text-muted-foreground tabular-nums shrink-0">
                      <span aria-hidden>{count}</span>
                      <span className="sr-only">{fmt(t(`${K}.usage`), { n: count })}</span>
                    </span>
                    {isMobile && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
      {!readOnly && (
        <div className={cn("py-2 border-t border-border", isMobile ? PAD : "px-3")}>
          <Button onClick={onAdd} size="sm" disabled={creating} className="w-full">
            {creating ? <Loader2 className="animate-spin" /> : <Plus />}
            {t(`${K}.add`)}
          </Button>
        </div>
      )}
    </div>
  );
}

function RoleEditorPane({
  t,
  role,
  draft,
  usageCount,
  isMobile,
  readOnly,
  lockedInUse,
  nameError,
  deleting,
  autoFocusName,
  onBack,
  onDraft,
  onCommit,
  onPickColor,
  onTogglePerm,
  onSetAllPerms,
  onDelete,
}: {
  t: TFn;
  role: RoleRow;
  draft: RoleDraftFields | undefined;
  usageCount: number;
  isMobile: boolean;
  readOnly: boolean;
  /** Non-owner viewing a role members hold: rename and delete are owner-only. */
  lockedInUse: boolean;
  /** Why the draft name can't be saved (it stays visible until fixed). */
  nameError: string | null;
  deleting: boolean;
  autoFocusName: boolean;
  onBack?: () => void;
  onDraft: (fields: RoleDraftFields) => void;
  onCommit: () => void;
  onPickColor: (color: string) => void;
  onTogglePerm: (permId: string, on: boolean) => void;
  onSetAllPerms: (on: boolean) => void;
  onDelete: () => void;
}) {
  const nameId = useId();
  const descriptionId = useId();
  const nameHintId = useId();
  const nameErrorId = useId();
  const lockNoteId = useId();
  const colorLabelId = useId();
  const permsHeadingId = useId();
  const autoSelectedRef = useRef(false);

  const nameReadOnly = readOnly || role.isBuiltin || lockedInUse;
  const name = role.isBuiltin ? displayNameOf(t, role) : draft?.name ?? role.name;
  const headerName = role.isBuiltin ? name : (!nameError && draft?.name?.trim()) || role.name;
  const nameDescribedBy = [
    role.isBuiltin ? nameHintId : null,
    lockedInUse ? lockNoteId : null,
    nameError ? nameErrorId : null,
  ].filter(Boolean).join(" ") || undefined;
  const description = draft?.description ?? role.description;
  const color = normalizeHex(draft?.color ?? role.color);
  const permSet = new Set(draft?.perms ?? role.perms);
  const checkedCount = ORG_PERMS_FLAT.filter((p) => permSet.has(p.id)).length;

  function commitOnEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Header */}
      <div className={cn("py-3 border-b border-border flex items-center gap-3", PAD)}>
        {onBack && (
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label={t("common.back")} className="-ml-1 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <RoleAvatar color={color} name={headerName} large />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-foreground truncate">{headerName}</h3>
            <StatusBadge tone="neutral" size="xs">
              {role.isBuiltin ? t(`${K}.builtin`) : t(`${K}.custom`)}
            </StatusBadge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {fmt(t(`${K}.usage`), { n: usageCount })}
          </p>
        </div>
        {!readOnly && !role.isBuiltin && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={deleting || lockedInUse}
            aria-describedby={lockedInUse ? lockNoteId : undefined}
            className="shrink-0"
          >
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 strokeWidth={1.75} />}
            <span className={cn(isMobile && "sr-only")}>{t("common.delete")}</span>
          </Button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {readOnly && (
          <p className={cn("py-2 border-b border-border bg-muted/30 text-[11.5px] text-muted-foreground max-sm:bg-transparent", PAD)}>
            {t(`${K}.readOnly`)}
          </p>
        )}

        {/* Name, description, colour */}
        <div className={cn("py-4 border-b border-border flex flex-col gap-3", PAD)}>
          <div>
            <label htmlFor={nameId} className="mb-1 block">
              <Eyebrow as="span" className="font-mono">{t("common.name")}</Eyebrow>
            </label>
            <Input
              id={nameId}
              value={name}
              readOnly={nameReadOnly}
              maxLength={60}
              placeholder={t("staffing.roleDialog.roleNamePlaceholder")}
              aria-describedby={nameDescribedBy}
              aria-invalid={nameError ? true : undefined}
              autoFocus={autoFocusName && !nameReadOnly}
              onFocus={(e) => {
                if (autoFocusName && !nameReadOnly && !autoSelectedRef.current) {
                  autoSelectedRef.current = true;
                  e.currentTarget.select();
                }
              }}
              onChange={(e) => {
                if (!nameReadOnly) onDraft({ name: e.target.value });
              }}
              onBlur={onCommit}
              onKeyDown={commitOnEnter}
              className="h-8 text-[12.5px]"
            />
            {role.isBuiltin && (
              <p id={nameHintId} className="mt-1 text-[10.5px] text-muted-foreground">
                {t(`${K}.builtinNameHint`)}
              </p>
            )}
            {nameError && (
              <p id={nameErrorId} className="mt-1 text-[10.5px] text-destructive">
                {nameError}
              </p>
            )}
            {lockedInUse && (
              <p id={lockNoteId} className="mt-1 text-[10.5px] text-muted-foreground">
                {t(`${K}.ownerOnlyInUse`)}
              </p>
            )}
          </div>

          <div>
            <label htmlFor={descriptionId} className="mb-1 block">
              <Eyebrow as="span" className="font-mono">{t("staffing.roleDialog.description")}</Eyebrow>
            </label>
            <Input
              id={descriptionId}
              value={description}
              readOnly={readOnly}
              maxLength={200}
              placeholder={t("staffing.roleDialog.descriptionPlaceholder")}
              onChange={(e) => {
                if (!readOnly) onDraft({ description: e.target.value });
              }}
              onBlur={onCommit}
              onKeyDown={commitOnEnter}
              className="h-8 text-[12.5px]"
            />
          </div>

          <div role="group" aria-labelledby={colorLabelId}>
            <Eyebrow id={colorLabelId} className="font-mono mb-1.5">{t("staffing.roleDialog.color")}</Eyebrow>
            <div className="flex flex-wrap gap-1.5 items-center">
              {ROLE_COLOR_SWATCHES.map((c) => {
                const on = c === color;
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={readOnly}
                    onClick={() => onPickColor(c)}
                    aria-label={`${t("staffing.roleDialog.color")} ${c}`}
                    aria-pressed={on}
                    title={c}
                    className={cn(
                      "h-7 w-7 rounded-md border border-border transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                      on && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                      readOnly && !on && "opacity-50",
                    )}
                    style={{ background: c }}
                  />
                );
              })}
              <label className="ml-1 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="sr-only">{t("staffing.roleDialog.customColor")}</span>
                <input
                  type="color"
                  value={color}
                  disabled={readOnly}
                  onChange={(e) => onDraft({ color: e.target.value.toLowerCase() })}
                  onBlur={onCommit}
                  className="h-7 w-9 rounded-md border border-border bg-transparent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                />
                <span className="font-mono" aria-hidden>{color}</span>
              </label>
            </div>
          </div>
        </div>

        {/* Default permissions */}
        <div className={cn("py-3 @container", PAD)}>
          <div className={cn("flex gap-2 mb-2", isMobile ? "flex-col" : "flex-wrap items-center justify-between")}>
            <div className="min-w-0">
              <h4 id={permsHeadingId} className="text-[12.5px] font-semibold text-foreground">
                {t(`${K}.defaultPerms`)}
              </h4>
              <p className="text-[10.5px] text-muted-foreground">{t(`${K}.defaultPermsHint`)}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10.5px] font-mono text-muted-foreground tabular-nums">
                {checkedCount} / {ORG_PERMS_FLAT.length}
              </span>
              {!readOnly && (
                <>
                  <Button variant="outline" size="xs" onClick={() => onSetAllPerms(true)}>
                    {t(`${K}.selectAll`)}
                  </Button>
                  <Button variant="outline" size="xs" onClick={() => onSetAllPerms(false)}>
                    {t(`${K}.clearAll`)}
                  </Button>
                </>
              )}
            </div>
          </div>
          <div role="group" aria-labelledby={permsHeadingId} className="grid grid-cols-1 @lg:grid-cols-2 gap-x-4 gap-y-0.5">
            {ORG_PERMS.map((g) => (
              <div key={g.group} className="mb-1.5">
                <Eyebrow size="xs" className="font-mono mb-0.5">{permGroupLabel(t, g.group)}</Eyebrow>
                {g.items.map((p: PermLeaf) => (
                  <label
                    key={p.id}
                    className={cn(
                      "flex items-start gap-2 px-1 rounded-md",
                      isMobile ? "py-2" : "py-1",
                      readOnly ? "cursor-default" : "cursor-pointer hover:bg-muted/40",
                    )}
                  >
                    <Checkbox
                      checked={permSet.has(p.id)}
                      disabled={readOnly}
                      onCheckedChange={(v) => onTogglePerm(p.id, v === true)}
                      className="mt-[3px]"
                    />
                    <span className="min-w-0 flex-1 flex flex-wrap items-center gap-1">
                      <span className="text-[12px] text-foreground">{permLabel(t, p)}</span>
                      {p.sensitive && (
                        <StatusBadge tone="warning" size="xs">{t("personnel.team.org.sensitive")}</StatusBadge>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleFooter({
  t,
  isMobile,
  readOnly,
  saving,
  busy,
  showNote,
  onDone,
}: {
  t: TFn;
  isMobile: boolean;
  readOnly: boolean;
  saving: boolean;
  busy: boolean;
  showNote: boolean;
  onDone: () => void;
}) {
  return (
    <div
      className={cn(
        "py-3 border-t border-border bg-muted/30 flex gap-2",
        "max-sm:sticky max-sm:bottom-0 max-sm:bg-background max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        PAD,
        isMobile ? "flex-col" : "items-center justify-between",
      )}
    >
      <p className="min-w-0 text-[11px] text-muted-foreground" aria-live="polite">
        {saving ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            {t("common.saving")}
          </span>
        ) : showNote && !readOnly ? (
          t(`${K}.footerNote`)
        ) : null}
      </p>
      <Button size="sm" onClick={onDone} disabled={busy} className={cn("shrink-0", isMobile && "w-full")}>
        {busy && <Loader2 className="animate-spin" />}
        {readOnly ? t("common.close") : t(`${K}.done`)}
      </Button>
    </div>
  );
}
