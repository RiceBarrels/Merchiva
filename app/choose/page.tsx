"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTable, useSpacetimeDB } from "spacetimedb/react";
import { ArrowRight, LogOut } from "lucide-react";
import { AdminModeIcon, PersonalModeIcon, StoreModeIcon, type AppIcon } from "@/components/device/app-icons";
import { MerchivaLogo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubscribePanel } from "@/components/billing/subscribe-panel";
import { Spinner } from "@/components/ui/loaders/geometric";
import { StoreList } from "@/components/store-picker";
import { useT } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { usePermissions } from "@/lib/context/permissions";
import { tables } from "@/lib/spacetimedb/generated";
import { registerStoreDevice } from "@/lib/spacetimedb/actions";
import { setOwnPunchCode } from "@/lib/spacetimedb/actions/pin";
import { ownCodeNotice } from "@/lib/pin-attempt";
import { fmt } from "@/lib/i18n/fmt";
import { getAppMode, setAppMode, APP_MODE_HOME, type AppMode } from "@/lib/app-mode";
import { setStoreMachineMode, setDeviceName, getDeviceName, getOrCreateDeviceId } from "@/lib/store-machine-mode";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { evaluateSubscription } from "@/lib/billing/subscription";
import { canRunStoreDevice } from "@/lib/store-device-access";

interface MemberRow {
  id: { toString(): string };
  userId: { toString(): string };
  organizationId: string;
  status: string;
}

function ModeCard({
  icon: Icon,
  title,
  description,
  selected,
  disabled,
  note,
  onSelect,
}: {
  icon: AppIcon;
  title: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  note?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "w-full text-left rounded-[0.3rem] border p-4 flex items-start gap-3 transition-colors",
        selected
          ? "border-stone-900 dark:border-stone-100 bg-stone-50 dark:bg-stone-800"
          : "border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-500",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <div className="h-11 w-11 shrink-0 rounded-[0.3rem] border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center">
        <Icon className="h-7 w-7" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-semibold text-foreground">{title}</div>
        <div className="text-[12px] text-stone-500 dark:text-stone-400 mt-0.5 leading-relaxed">{description}</div>
        {note && <div className="text-[11px] text-amber-700 dark:text-amber-500 mt-1">{note}</div>}
      </div>
    </button>
  );
}

function ChooseModeInner() {
  const t = useT();
  const router = useRouter();
  const sp = useSearchParams();
  // Also stay put when Stripe sends the user back here after checkout.
  const forceShow = sp.get("switch") === "1" || sp.has("status");
  const { user, signOut } = useAuth();
  const { role, permissions, organizationId, organizations, currentOrg, pickOrg } = usePermissions();
  const showStores = organizations.length > 1;
  const stdb = useSpacetimeDB();
  const identityString = stdb?.identity?.toString() ?? null;
  const [memberRows] = useTable(tables.orgMember);
  const [orgRows] = useTable(tables.organization);

  const myMember = useMemo(
    () =>
      (memberRows as unknown as MemberRow[]).find(
        (m) =>
          identityString &&
          m.userId.toString() === identityString &&
          m.organizationId === organizationId &&
          m.status === "active",
      ) ?? null,
    [memberRows, identityString, organizationId],
  );
  // The PIN itself lives in `member_punch_code`, which RLS scopes to
  // `userId = :sender` — this subscription therefore returns at most the
  // current user's own code, never a colleague's. `org_member.punchInCode` is
  // a drained legacy column and is no longer read.
  const [punchCodeRows] = useTable(tables.memberPunchCode);
  const hasPin = useMemo(
    () =>
      (punchCodeRows ?? []).some(
        (c) =>
          identityString &&
          c.userId.toString() === identityString &&
          c.organizationId === organizationId &&
          typeof c.code === "string" &&
          c.code.length > 0,
      ),
    [punchCodeRows, identityString, organizationId],
  );
  const canAdmin = role === "owner" || role === "manager";
  // A shared store device: owners, managers and members an owner allowed (the module enforces it
  // too). Nobody else is offered the mode at all.
  const canStore = canRunStoreDevice(role, permissions);

  // The paywall lives here, not behind the mode cards: if the selected store's
  // subscription is out of access the chooser embeds the subscribe
  // panel in place of the mode cards; once Stripe reports the plan active the
  // org row updates and the cards come back. Fails open while the org row
  // hasn't streamed in, same as the layout gate.
  const [checkedAt] = useState(() => Date.now());
  const subscriptionBlocked = useMemo(() => {
    if (!organizationId) return false;
    const row = orgRows.find((o) => o.id.toString() === organizationId);
    if (!row) return false;
    return !evaluateSubscription(row, checkedAt).allowed;
  }, [orgRows, organizationId, checkedAt]);



  // Lazy initialisers are safe here: the manager layout only renders this page
  // client-side once auth has loaded, so there's no SSR hydration to mismatch.
  const [mode, setMode] = useState<AppMode | null>(() => {
    const stored = getAppMode();
    if (stored && (stored !== "store" || canStore)) return stored;
    return canAdmin ? "admin" : "personal";
  });
  const [deviceNameInput, setDeviceNameInput] = useState(() => getDeviceName());
  const [pinInput, setPinInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Already chosen on this device and not explicitly switching → skip ahead.
  // With several stores we also need a persisted store pick; otherwise stay so
  // the user can choose one here (nothing downstream asks again).
  useEffect(() => {
    if (forceShow) return;
    const existing = getAppMode();
    // A store device whose account may no longer run one stays here to pick another mode.
    if (!existing || (existing === "store" && !canStore)) return;
    let storedOrg: string | null = null;
    try { storedOrg = localStorage.getItem("active_org_id"); } catch {}
    if (organizations.length <= 1 || storedOrg) router.replace(APP_MODE_HOME[existing]);
  }, [forceShow, organizations.length, router, canStore]);

  const storeReady =
    mode !== "store" || (deviceNameInput.trim().length > 0 && (hasPin || /^\d{4}$/.test(pinInput)));

  const handleContinue = async () => {
    if (!mode || busy || !storeReady || (mode === "store" && !canStore)) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "store") {
        if (!hasPin && myMember) {
          // Rate limited (a taken code names a colleague's PIN): the answer is a row.
          const notice = ownCodeNotice(await setOwnPunchCode(pinInput));
          if (notice) throw new Error(fmt(t(notice.key), notice.vars));
        }
        const name = deviceNameInput.trim();
        setDeviceName(name);
        // The /store surface manages its own operator log-in / idle lock, so
        // the legacy store-machine flag stays OFF — leaving it on would strip
        // the manager UI down to the old kiosk nav when a manager switches over.
        setStoreMachineMode(false);
        registerStoreDevice(getOrCreateDeviceId(), name).catch(console.error);
      } else {
        // Leaving store mode from the chooser is only possible when the
        // device isn't locked to it; settings handles the PIN-gated exit.
        setStoreMachineMode(false);
      }
      // Persist the store pick alongside the mode so neither /manager, /store
      // nor /personal ever re-prompts (the layout reads active_org_id).
      if (organizationId) {
        try { localStorage.setItem("active_org_id", organizationId); } catch {}
      }
      setAppMode(mode);
      hapticSuccess();
      // Full navigation (not router.replace) so SpacetimeDB subscriptions and
      // the layout's auth state re-scope under the store picked above.
      window.location.href = APP_MODE_HOME[mode];
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-white dark:bg-stone-900 flex flex-col">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <MerchivaLogo size={20} fg="#292524" />
          <span className="text-[13px] font-semibold text-stone-800 dark:text-stone-200 tracking-tight">Merchiva</span>
        </div>
        <LanguageSwitcher variant="inline" />
      </div>

      <div className="flex-1 flex items-center justify-center px-6 pb-12">
        <div className="w-full max-w-[440px]">
          <h1 className="text-[22px] font-semibold text-foreground tracking-tight">{t("chooseMode.title")}</h1>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1.5 mb-6">{t("chooseMode.subtitle")}</p>

          {showStores && (
            <div className="mb-6">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300 mb-2">
                {t("storePicker.title")}
              </div>
              <StoreList
                stores={organizations}
                currentOrgId={organizationId}
                onSelect={(id) => {
                  hapticLight();
                  try { localStorage.setItem("active_org_id", id); } catch {}
                  pickOrg(id);
                }}
              />
            </div>
          )}

          {subscriptionBlocked ? (
            <SubscribePanel embedded returnPath="/choose" cleanupPath="/choose?switch=1" className="space-y-5" />
          ) : (
          <>
          <div className="space-y-2.5">
            <ModeCard
              icon={AdminModeIcon}
              title={t("chooseMode.adminTitle")}
              description={t("chooseMode.adminDesc")}
              selected={mode === "admin"}
              disabled={!canAdmin}
              note={!canAdmin ? t("chooseMode.adminLocked") : undefined}
              onSelect={() => { hapticLight(); setMode("admin"); }}
            />
            <ModeCard
              icon={PersonalModeIcon}
              title={t("chooseMode.personalTitle")}
              description={t("chooseMode.personalDesc")}
              selected={mode === "personal"}
              onSelect={() => { hapticLight(); setMode("personal"); }}
            />
            {canStore && (
              <ModeCard
                icon={StoreModeIcon}
                title={t("chooseMode.storeTitle")}
                description={t("chooseMode.storeDesc")}
                selected={mode === "store"}
                onSelect={() => { hapticLight(); setMode("store"); }}
              />
            )}
          </div>

          {mode === "store" && canStore && (
            <div className="mt-4 space-y-3 rounded-[0.3rem] border border-stone-200 dark:border-stone-700 p-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300">
                  {t("chooseMode.deviceName")}
                </Label>
                <Input
                  value={deviceNameInput}
                  onChange={(e) => setDeviceNameInput(e.target.value.slice(0, 40))}
                  placeholder={t("chooseMode.deviceNamePlaceholder")}
                  className="h-10"
                  autoFocus
                />
              </div>
              {!hasPin && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-semibold uppercase tracking-wider text-stone-600 dark:text-stone-300">
                    {t("chooseMode.pinLabel")}
                  </Label>
                  <Input
                    value={pinInput}
                    inputMode="numeric"
                    maxLength={4}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder={t("chooseMode.pinPlaceholder")}
                    className="h-10 font-mono tracking-[0.3em]"
                  />
                  <p className="text-[11px] text-stone-500 dark:text-stone-400">{t("chooseMode.pinRequired")}</p>
                </div>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-[12px] text-red-600">{error}</p>}

          <Button
            type="button"
            onClick={handleContinue}
            disabled={!mode || busy || !storeReady}
            className="mt-5 h-11 w-full rounded bg-stone-900 text-white text-[14px] font-medium gap-2 hover:bg-stone-800"
          >
            {busy ? <Spinner size={16} /> : (<>{t("chooseMode.continueBtn")}<ArrowRight className="h-4 w-4" /></>)}
          </Button>
          </>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-stone-200 dark:border-stone-700 pt-3">
            <p className="min-w-0 text-[11px] text-stone-400 dark:text-stone-500 font-mono truncate">
              {user?.email ? `${t("chooseMode.signedInAs")} ${user.email}` : ""}
            </p>
            <button
              type="button"
              onClick={() => { hapticLight(); signOut(); }}
              className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-stone-500 hover:text-red-600 dark:text-stone-400 dark:hover:text-red-500 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("common.signOut")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChooseModePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Spinner size={24} className="text-stone-400 dark:text-stone-500" />
        </div>
      }
    >
      <ChooseModeInner />
    </Suspense>
  );
}
