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
import { NotificationDot } from "@/components/ui/notification-dot";
import { useAuth, type AuthUser, type StoredAccount } from "@/lib/auth/context";
import { useTabActions } from "@/lib/browser-shell";
import { discardShellStateForSignOut } from "@/lib/browser-shell/sign-out";
import { clearCache } from "@/lib/cache";
import { usePermissions } from "@/lib/context/permissions";
import { hapticMedium, hapticSuccess } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useNotificationDots, useOtherOrgDot } from "@/lib/notifications/dots-context";
import { createOrg } from "@/lib/spacetimedb/actions";
import type { OrgSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

export { SwitchModeLink, BackToDeviceLink } from "@/components/sidebar";

/*
 * Account + workspace pieces shared by the desktop profile menu, the mobile page
 * menu and anything else that needs the store list, account list or store
 * creation. Behaviour copied from components/sidebar.tsx WorkspaceSwitcher /
 * WorkspaceDropdown (:346-422, :589-704).
 */

// ─── Store list ──────────────────────────────────────────────────────────────

/** Accessible stores, sorted by name. */
export function sortOrgs(organizations: readonly OrgSummary[]): OrgSummary[] {
  return [...organizations].sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export interface WorkspaceActions {
  user: AuthUser | null;
  accounts: StoredAccount[];
  currentOrg: OrgSummary | null;
  stores: OrgSummary[];
  /** No-op for the current org; otherwise flushes tab state and hard-reloads into `orgId`. */
  switchOrg(orgId: string): Promise<void>;
  switchAccount(userId: string): void;
  addAccount(): void;
  /** Purges persisted browser-shell state (also after the tab store's teardown flush), then signs out. */
  signOut(): void;
  /** Creates a store. Throws on failure so forms can show the error. */
  createStore(name: string): Promise<void>;
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

  const stores = useMemo(() => sortOrgs(organizations), [organizations]);
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
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await createOrg(trimmed);
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
      stores,
      switchOrg,
      switchAccount,
      addAccount,
      signOut,
      createStore,
    }),
    [user, accounts, currentOrg, stores, switchOrg, switchAccount, addAccount, signOut, createStore],
  );
}

// ─── Store list ──────────────────────────────────────────────────────────────

const ROW_CLASS =
  "flex w-full items-center gap-2 py-1.5 text-start text-[13px] transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

/**
 * Whether another store in `stores` has something unread: the store switchers' triggers carry
 * one notification dot for it, the rows inside show which store (StoreSwitchList).
 */
export function useOtherStoresDot(stores: readonly OrgSummary[], currentOrgId: string | null): boolean {
  const { otherOrgIds } = useNotificationDots().state;
  return otherOrgIds.size > 0 && stores.some((org) => org.id !== currentOrgId && otherOrgIds.has(org.id));
}

export function StoreSwitchList({
  stores,
  currentOrgId,
  onSelect,
}: {
  stores: readonly OrgSummary[];
  currentOrgId: string | null;
  onSelect(orgId: string): void;
}): React.JSX.Element {
  return (
    <div className="py-1">
      {stores.map((org) => (
        <StoreSwitchRow key={org.id} org={org} current={org.id === currentOrgId} onSelect={onSelect} />
      ))}
    </div>
  );
}

/** One store; another store with something unread carries a notification dot on its logo. */
function StoreSwitchRow({ org, current, onSelect }: { org: OrgSummary; current: boolean; onSelect(orgId: string): void }) {
  const t = useT();
  const dot = useOtherOrgDot(org.id) && !current;
  return (
    <button
      type="button"
      onClick={() => onSelect(org.id)}
      aria-current={current ? "true" : undefined}
      aria-label={dot ? fmt(t("notify.dot.withName"), { name: org.name }) : undefined}
      className={cn(ROW_CLASS, "px-3")}
    >
      <span className="relative flex shrink-0">
        <StoreLogo name={org.name} logoUrl={org.logoUrl} className="h-6 w-6 text-[10px]" />
        <NotificationDot show={dot} className="ring-popover" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{org.name}</span>
      {current && <Check className="h-3.5 w-3.5 shrink-0 text-foreground" aria-hidden />}
    </button>
  );
}

// ─── Create store form ───────────────────────────────────────────────────────

export function CreateStoreForm({
  onCreate,
  onCancel,
}: {
  onCreate(name: string): Promise<void>;
  onCancel(): void;
}): React.JSX.Element {
  const t = useT();
  const nameId = useId();
  const errorId = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onCreate(trimmed);
      setName("");
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("components.sidebar.failedToCreateStore"));
    } finally {
      setLoading(false);
    }
  };

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
