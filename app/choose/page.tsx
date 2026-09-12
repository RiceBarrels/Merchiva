"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTable, useSpacetimeDB } from "spacetimedb/react";
import { ArrowRight, Briefcase, MonitorSmartphone, UserRound, type LucideIcon } from "lucide-react";
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
import { registerStoreDevice, setPunchInCode } from "@/lib/spacetimedb/actions";
import { getAppMode, setAppMode, APP_MODE_HOME, type AppMode } from "@/lib/app-mode";
import { setStoreMachineMode, setDeviceName, getDeviceName, getOrCreateDeviceId } from "@/lib/store-machine-mode";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { evaluateSubscription } from "@/lib/billing/subscription";

interface MemberRow {
  id: { toString(): string };
  userId: { toString(): string };
  organizationId: string;
  status: string;
  punchInCode?: string;
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
  icon: LucideIcon;
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
      <div className="h-9 w-9 shrink-0 rounded-[0.3rem] border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center">
        <Icon className="h-4 w-4 text-stone-700 dark:text-stone-200" />
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
  const { user } = useAuth();
  const { role, organizationId, organizations, currentOrg, pickOrg } = usePermissions();
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
  const hasPin = typeof myMember?.punchInCode === "string" && myMember.punchInCode.length > 0;
  const canAdmin = role === "owner" || role === "manager";

  // The paywall lives here, not behind the mode cards: if the selected store's
  // subscription (root org) is out of access the chooser embeds the subscribe
  // panel in place of the mode cards; once Stripe reports the plan active the
  // org row updates and the cards come back. Fails open while the org row
  // hasn't streamed in, same as the layout gate.
  const [checkedAt] = useState(() => Date.now());
  const subscriptionBlocked = useMemo(() => {
    if (!organizationId) return false;
    const rootId = currentOrg?.parentOrgId ?? organizationId;
    const row = orgRows.find((o) => o.id.toString() === rootId);
    if (!row) return false;
    return !evaluateSubscription(row, checkedAt).allowed;
  }, [orgRows, organizationId, currentOrg, checkedAt]);



  // Lazy initialisers are safe here: the manager layout only renders this page
  // client-side once auth has loaded, so there's no SSR hydration to mismatch.
  const [mode, setMode] = useState<AppMode | null>(() => getAppMode() ?? (canAdmin ? "admin" : "personal"));
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
    if (!existing) return;
    let storedOrg: string | null = null;
    try { storedOrg = localStorage.getItem("active_org_id"); } catch {}
    if (organizations.length <= 1 || storedOrg) router.replace(APP_MODE_HOME[existing]);
  }, [forceShow, organizations.length, router]);

  const storeReady =
    mode !== "store" || (deviceNameInput.trim().length > 0 && (hasPin || /^\d{4}$/.test(pinInput)));

  const handleContinue = async () => {
    if (!mode || busy || !storeReady) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "store") {
        if (!hasPin && myMember) {
          await setPunchInCode(myMember.id.toString(), pinInput);
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
              icon={Briefcase}
              title={t("chooseMode.adminTitle")}
              description={t("chooseMode.adminDesc")}
              selected={mode === "admin"}
              disabled={!canAdmin}
              note={!canAdmin ? t("chooseMode.adminLocked") : undefined}
              onSelect={() => { hapticLight(); setMode("admin"); }}
            />
            <ModeCard
              icon={UserRound}
              title={t("chooseMode.personalTitle")}
              description={t("chooseMode.personalDesc")}
              selected={mode === "personal"}
              onSelect={() => { hapticLight(); setMode("personal"); }}
            />
            <ModeCard
              icon={MonitorSmartphone}
              title={t("chooseMode.storeTitle")}
              description={t("chooseMode.storeDesc")}
              selected={mode === "store"}
              onSelect={() => { hapticLight(); setMode("store"); }}
            />
          </div>

          {mode === "store" && (
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

          {user?.email && (
            <p className="mt-4 text-[11px] text-stone-400 dark:text-stone-500 font-mono truncate">
              {t("chooseMode.signedInAs")} {user.email}
            </p>
          )}
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
