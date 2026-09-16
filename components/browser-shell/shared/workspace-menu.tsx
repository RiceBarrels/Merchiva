"use client";

import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { StoreLogo } from "@/components/store-picker";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/loaders/geometric";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth, type AuthUser, type StoredAccount } from "@/lib/auth/context";
import { useTabActions } from "@/lib/browser-shell";
import { discardShellStateForSignOut } from "@/lib/browser-shell/sign-out";
import { clearCache } from "@/lib/cache";
import { usePermissions } from "@/lib/context/permissions";
import { hapticMedium, hapticSuccess } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { createOrg } from "@/lib/spacetimedb/actions";
import type { OrgSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export { SwitchModeLink, BackToDeviceLink } from "@/components/sidebar";

/*
 * Account + workspace pieces shared by the desktop profile menu, the mobile page
 * menu and anything else that needs the store tree, account list or store
 * creation. Behaviour copied from components/sidebar.tsx WorkspaceSwitcher /
 * WorkspaceDropdown (:346-422, :589-704).
 */

// ─── Store tree ──────────────────────────────────────────────────────────────

export type OrgTreeNode = { org: OrgSummary; children: OrgSummary[] };

/**
 * Parent → children tree. Root orgs sorted by name; sub-stores listed under their
 * parent. An org whose parent isn't in the accessible list renders at the root so
 * it stays reachable.
 */
export function buildOrgTree(organizations: readonly OrgSummary[]): OrgTreeNode[] {
  const byId = new Map(organizations.map((org) => [org.id, org] as const));
  const childrenOf = new Map<string, OrgSummary[]>();
  for (const org of organizations) {
    const parent = org.parentOrgId && byId.has(org.parentOrgId) ? org.parentOrgId : null;
    if (!parent) continue;
    const list = childrenOf.get(parent) ?? [];
    list.push(org);
    childrenOf.set(parent, list);
  }
  const roots: OrgTreeNode[] = [];
  for (const org of organizations) {
    const isRoot = !org.parentOrgId || !byId.has(org.parentOrgId);
    if (isRoot) roots.push({ org, children: childrenOf.get(org.id) ?? [] });
  }
  return roots.sort((a, b) => a.org.name.localeCompare(b.org.name));
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export interface WorkspaceActions {
  user: AuthUser | null;
  accounts: StoredAccount[];
  currentOrg: OrgSummary | null;
  tree: OrgTreeNode[];
  eligibleParents: OrgSummary[];
  /** No-op for the current org; otherwise flushes tab state and hard-reloads into `orgId`. */
  switchOrg(orgId: string): Promise<void>;
  switchAccount(userId: string): void;
  addAccount(): void;
  /** Purges persisted browser-shell state (also after the tab store's teardown flush), then signs out. */
  signOut(): void;
  /** Creates a store (optionally as a sub-store). Throws on failure so forms can show the error. */
  createStore(name: string, parentId: string | null): Promise<void>;
}

export function useWorkspaceActions(opts?: { onDone?: () => void }): WorkspaceActions {
  const router = useRouter();
  const { user, accounts, switchAccount: authSwitchAccount, signOut: authSignOut } = useAuth();
  const { organizations, currentOrg, switchOrg: permissionsSwitchOrg } = usePermissions();
  const tabActions = useTabActions();

  const onDone = opts?.onDone;
  const onDoneRef = useRef(onDone);
  useLayoutEffect(() => {
    onDoneRef.current = onDone;
  });

  const tree = useMemo(() => buildOrgTree(organizations), [organizations]);
  // Only root orgs can be parents (one-level hierarchy, enforced by the reducer).
  const eligibleParents = useMemo(() => organizations.filter((org) => !org.parentOrgId), [organizations]);
  const currentOrgId = currentOrg?.id ?? null;
  const currentUserId = user?.id ?? null;

  const switchOrg = useCallback(
    async (orgId: string) => {
      if (!orgId || orgId === currentOrgId) {
        onDoneRef.current?.();
        return;
      }
      void hapticMedium();
      onDoneRef.current?.();
      tabActions.prepareOrgSwitch(orgId);
      await permissionsSwitchOrg(orgId);
    },
    [currentOrgId, tabActions, permissionsSwitchOrg],
  );

  const switchAccount = useCallback(
    (userId: string) => {
      if (userId === currentUserId) {
        onDoneRef.current?.();
        return;
      }
      void hapticMedium();
      onDoneRef.current?.();
      authSwitchAccount(userId);
    },
    [currentUserId, authSwitchAccount],
  );

  const addAccount = useCallback(() => {
    onDoneRef.current?.();
    router.push("/login?addAccount=1");
  }, [router]);

  const signOut = useCallback(() => {
    // The bound tab store flushes tab URLs and titles again after authSignOut wipes storage.
    discardShellStateForSignOut();
    clearCache();
    try {
      localStorage.removeItem("active_org_id");
    } catch {
      // Storage unavailable — signOut clears what it can.
    }
    onDoneRef.current?.();
    authSignOut();
  }, [authSignOut]);

  const createStore = useCallback(
    async (name: string, parentId: string | null) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await createOrg(trimmed, parentId);
      void hapticSuccess();
      onDoneRef.current?.();
      // Refresh so PermissionsProvider picks up the new membership.
      router.refresh();
    },
    [router],
  );

  return useMemo(
    () => ({
      user,
      accounts,
      currentOrg,
      tree,
      eligibleParents,
      switchOrg,
      switchAccount,
      addAccount,
      signOut,
      createStore,
    }),
    [user, accounts, currentOrg, tree, eligibleParents, switchOrg, switchAccount, addAccount, signOut, createStore],
  );
}

// ─── Store tree list ─────────────────────────────────────────────────────────

const ROW_CLASS =
  "flex w-full items-center gap-2 py-1.5 text-start text-[13px] transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

export function StoreTreeList({
  tree,
  currentOrgId,
  onSelect,
}: {
  tree: OrgTreeNode[];
  currentOrgId: string | null;
  onSelect(orgId: string): void;
}): React.JSX.Element {
  const t = useT();
  return (
    <div className="py-1">
      {tree.map((node) => {
        const rootCurrent = node.org.id === currentOrgId;
        return (
          <div key={node.org.id} role="group" aria-label={node.org.name}>
            <button
              type="button"
              onClick={() => onSelect(node.org.id)}
              aria-current={rootCurrent ? "true" : undefined}
              className={cn(ROW_CLASS, "px-3")}
            >
              <StoreLogo name={node.org.name} logoUrl={node.org.logoUrl} className="h-6 w-6 text-[10px]" />
              <span className="min-w-0 flex-1 truncate font-medium">{node.org.name}</span>
              {node.children.length > 0 && (
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{node.children.length}</span>
              )}
              {rootCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-foreground" aria-hidden />}
            </button>
            {node.children.map((child) => {
              const childCurrent = child.id === currentOrgId;
              return (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => onSelect(child.id)}
                  aria-current={childCurrent ? "true" : undefined}
                  className={cn(ROW_CLASS, "ps-7 pe-3")}
                >
                  <span aria-hidden className="inline-block text-muted-foreground/70 rtl:-scale-x-100">↳</span>
                  <StoreLogo name={child.name} logoUrl={child.logoUrl} className="h-6 w-6 text-[10px]" />
                  <span className="min-w-0 flex-1 truncate">{child.name}</span>
                  <span className="shrink-0 rounded border border-border px-1 text-[9px] uppercase leading-tight tracking-wide text-muted-foreground">
                    {t("multiStore.subBadge")}
                  </span>
                  {childCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-foreground" aria-hidden />}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Create store form ───────────────────────────────────────────────────────

const ROOT_PARENT_VALUE = "__root__";

export function CreateStoreForm({
  eligibleParents,
  onCreate,
  onCancel,
  nativeSelect = false,
}: {
  eligibleParents: readonly { id: string; name: string }[];
  onCreate(name: string, parentId: string | null): Promise<void>;
  onCancel(): void;
  /** Native <select> for the parent picker; required inside shell drawers where Base UI Select's z-50 popup would sit underneath. */
  nativeSelect?: boolean;
}): React.JSX.Element {
  const t = useT();
  const nameId = useId();
  const parentFieldId = useId();
  const helpId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const parentItems = useMemo(
    () => [
      { value: ROOT_PARENT_VALUE, label: t("multiStore.parentNone") },
      ...eligibleParents.map((parent) => ({ value: parent.id, label: parent.name })),
    ],
    [eligibleParents, t],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onCreate(trimmed, parentId);
      setName("");
      setParentId(null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("components.sidebar.failedToCreateStore"));
    } finally {
      setLoading(false);
    }
  };

  const describedBy = [eligibleParents.length > 0 ? helpId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <form onSubmit={handleSubmit} className="space-y-2 px-3 py-2">
      <label htmlFor={nameId} className="sr-only">
        {t("nav.storeName")}
      </label>
      <Input
        id={nameId}
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("nav.storeName")}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-7 text-[13px] md:text-[13px]"
      />
      {eligibleParents.length > 0 && (
        <div className="space-y-1">
          <label htmlFor={parentFieldId} className="block text-[11px] text-muted-foreground">
            {t("multiStore.parentLabel")}
          </label>
          {nativeSelect ? (
            <select
              id={parentFieldId}
              value={parentId ?? ""}
              onChange={(event) => setParentId(event.target.value || null)}
              aria-describedby={describedBy}
              className="h-7 w-full rounded-lg border border-input bg-background px-2 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">{t("multiStore.parentNone")}</option>
              {eligibleParents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.name}
                </option>
              ))}
            </select>
          ) : (
            <Select
              items={parentItems}
              value={parentId ?? ROOT_PARENT_VALUE}
              onValueChange={(value) => setParentId(value && value !== ROOT_PARENT_VALUE ? value : null)}
            >
              <SelectTrigger id={parentFieldId} size="sm" aria-describedby={describedBy} className="w-full text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {parentItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <p id={helpId} className="text-[10px] leading-relaxed text-muted-foreground">
            {parentId ? t("multiStore.parentHelpSub") : t("multiStore.parentHelpRoot")}
          </p>
        </div>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-1.5">
        <Button type="submit" size="xs" disabled={loading || !name.trim()} className="flex-1">
          {loading ? <Spinner size={12} /> : t("nav.create")}
        </Button>
        <Button type="button" size="xs" variant="outline" onClick={onCancel} disabled={loading}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export function AccountList({
  accounts,
  currentUserId,
  onSelect,
}: {
  accounts: readonly StoredAccount[];
  currentUserId: string | null;
  onSelect(userId: string): void;
}): React.JSX.Element {
  return (
    <div className="py-1">
      {accounts.map((account) => {
        const current = account.id === currentUserId;
        const displayName = [account.firstName, account.lastName].filter(Boolean).join(" ") || account.email;
        return (
          <button
            key={account.id}
            type="button"
            onClick={() => onSelect(account.id)}
            aria-current={current ? "true" : undefined}
            className={cn(ROW_CLASS, "px-3")}
          >
            <Avatar name={displayName} size="xs" shape="square" />
            <span className="min-w-0 flex-1 truncate text-[12px]">{account.email}</span>
            {current && <Check className="h-3.5 w-3.5 shrink-0 text-foreground" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

// ─── Menu row ────────────────────────────────────────────────────────────────

const MENU_ROW_CLASS =
  "flex w-full items-center gap-2 px-3 py-1.5 text-start text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none";

export function MenuRow({
  icon: Icon,
  children,
  onClick,
  href,
  trailing,
}: {
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  onClick?(): void;
  href?: string;
  trailing?: ReactNode;
}): React.JSX.Element {
  const content = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing != null && <span className="shrink-0 text-[11px] text-muted-foreground/70">{trailing}</span>}
    </>
  );
  if (href) {
    return (
      <Link href={href} onClick={onClick} className={MENU_ROW_CLASS}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={MENU_ROW_CLASS}>
      {content}
    </button>
  );
}
