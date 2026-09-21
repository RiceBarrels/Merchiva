"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Settings,
  Zap,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Unlink,
  ExternalLink,
  Save,
  Mail,
  Copy,
  MapPin,
  Camera,
  Check,
  ChevronDown,
  Clock,
  Users,
  Star,
  UserPlus,
  CreditCard,
  KeyRound,
  ArrowLeft,
  Building2,
  Calendar,
  AlignHorizontalDistributeCenter,
  LogOut,
  Shield,
  Bell,
  Search,
  FileText,
  Download,
  Activity,
  Info,
  SettingsIcon,
  UserCog,
  Sparkles,
  Plus,
  Coins,
  Loader2,
  Bot,
  ShoppingCart,
} from "lucide-react";
import { StoreModeIcon } from "@/components/device/app-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { OptionRow } from "@/components/ui/option-row";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import {
  upsertSettings,
  disconnectSquare,
  disconnectClover,
  updateOpeningHours,
  createOrg,
  setScheduleIntegration,
  disconnectScheduleIntegration,
  setSupplierInboundPrefix,
  updateDisplayName,
  updateProfile,
} from "@/lib/spacetimedb/actions";
import { StoreLogo } from "@/components/store-picker";
import { CURRENCIES, getCurrencyInfo } from "@/lib/currency";
import { parseOpeningHours, type WeeklyHours, type DayKey } from "@/lib/holidays";
import { useTable, useSpacetimeDB } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { getSettings, type UserSettings } from "@/lib/db/settings";
import { useAssistantConfig, useSettings } from "@/lib/spacetimedb/hooks/useSettings";
import { Textarea } from "@/components/ui/textarea";
import {
  DynamicUIElement, DynamicUIElementContent, DynamicUIElementHeader, DynamicUIElementTitle, DynamicUIElementDescription,
} from "@/components/ui/dynamic-ui-element";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerClose,
} from "@/components/ui/drawer";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { SBadge, SCategoryHeader, SGroupHeader, SRow, SToggleRow } from "@/components/settings/rows";
import { AboutPanel } from "@/components/settings/panels/about";
import { DataPanel } from "@/components/settings/panels/data";
import { NotificationsPanel } from "@/components/settings/panels/notifications";
import { PreferencesPanel } from "@/components/settings/panels/preferences";
import { StoreProfilePanel } from "@/components/settings/panels/store-profile";
import { SecurityPanel } from "@/components/settings/panels/security";
import { UsageSection } from "@/components/settings/usage-section";
import { getCached, setCache, clearCache } from "@/lib/cache";
import { getMyAvailability, getTimeOffRequests } from "@/lib/db/availability";
import { upsertAvailability, createTimeOffRequest } from "@/lib/spacetimedb/actions";
import { usePermissions } from "@/lib/context/permissions";
import { usePunchCode } from "@/lib/spacetimedb/hooks/usePunchCode";
import { hapticSuccess, hapticMedium } from "@/lib/haptics";
import { useAuth } from "@/lib/auth/context";
import { useStoreMachineMode, useDeviceName, getOrCreateDeviceId } from "@/lib/store-machine-mode";
import { useAutolockSeconds, AUTOLOCK_OPTIONS, type AutolockSeconds } from "@/lib/store-device-lock";
import { registerStoreDevice, removeStoreDevice, updateStoreDevice, verifyManagerPin } from "@/lib/spacetimedb/actions";
import { uploadFiles } from "@/lib/uploadthing";
import { toast } from "sonner";
import { useT, useI18n } from "@/lib/i18n/context";
import { LOCALE_LABELS } from "@/lib/i18n/config";
import { useThemeMode } from "@/lib/theme";
import type { AutonomyMode } from "@/lib/merchiva/autonomy";
import { LocationManager } from "@/components/location-manager";
import { useLocations } from "@/lib/spacetimedb/hooks";
import { Spinner } from "@/components/ui/loaders/geometric";
import {
  SCHEDULE_PROVIDERS,
  normalizeScheduleProvider,
  scheduleProviderLabel,
  type ScheduleProviderId,
} from "@/lib/schedule-integrations";
import {
  isValidSupplierInboundPrefix,
  normalizeSupplierInboundPrefix,
  supplierInboundAddressForOrg,
  supplierInboundPrefixForOrg,
} from "@/lib/suppliers/inbound-address";

interface SquareLocation {
  id: string;
  name: string;
  address: string | null;
}

interface StoreDeviceRow {
  id: { toString(): string };
  organizationId: string;
  deviceId: string;
  name: string;
  enabled: boolean;
  lastSeenAt: { toDate?: () => Date };
}

export default function SettingsPage() {
  const t = useT();
  const { locale } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { role, organizationId, organizations, currentOrg, switchOrg } = usePermissions();
  const { signOut, user: authUser, accounts, switchAccount } = useAuth();
  const isAdmin = role === "owner" || role === "manager";
  // Settings data via SpacetimeDB migration hook
  const { settings, setSettings, loading } = useSettings();
  const { config: assistantConfig, save: saveAssistantConfig } = useAssistantConfig();
  // Fallback: the organization's own name, for orgs whose settings.businessName was never set
  const [orgRows] = useTable(tables.organization);
  const orgName = (orgRows || []).find((o) => o.id.toString() === organizationId)?.name ?? "";
  const [userId, setUserId]     = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");

  // Profile form
  const [businessName, setBusinessName] = useState("");
  const [timezone, setTimezone]         = useState("America/Los_Angeles");
  const [locationLatitude, setLocationLatitude] = useState("");
  const [locationLongitude, setLocationLongitude] = useState("");
  const [googlePlacesId, setGooglePlacesId] = useState("");
  const [gettingLocation, setGettingLocation] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved]   = useState(false);
  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [personalName, setPersonalName] = useState("");
  const [personalBirthday, setPersonalBirthday] = useState("");
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [assistantSaving, setAssistantSaving] = useState(false);
  const [weeklyRestockTime, setWeeklyRestockTime] = useState("09:00");

  // Mobile drawer for switching store / account
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // Inline "Add store" form inside the switcher drawer.
  const [drawerCreating, setDrawerCreating] = useState(false);
  const [drawerStoreName, setDrawerStoreName] = useState("");
  const [drawerCreateLoading, setDrawerCreateLoading] = useState(false);
  const [drawerCreateError, setDrawerCreateError] = useState<string | null>(null);
  const closeSwitcherCreate = () => {
    setDrawerCreating(false);
    setDrawerStoreName("");
    setDrawerCreateError(null);
  };
  const handleDrawerCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = drawerStoreName.trim();
    if (!name) return;
    setDrawerCreateLoading(true);
    setDrawerCreateError(null);
    try {
      await createOrg(name);
      hapticSuccess();
      // Stay closed until the org list refreshes — reload picks up new
      // membership and re-scopes SpacetimeDB subscriptions cleanly.
      setSwitcherOpen(false);
      closeSwitcherCreate();
      window.location.reload();
    } catch (err) {
      setDrawerCreateError(
        err instanceof Error ? err.message : t("components.sidebar.failedToCreateStore"),
      );
    } finally {
      setDrawerCreateLoading(false);
    }
  };

  // Square OAuth feedback (replaced with toast)

  // Location picker
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locations, setLocations] = useState<SquareLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [selectingLocation, setSelectingLocation] = useState(false);

  // Business hours dialog (org-level opening hours, persisted via updateOpeningHours)
  const [hoursDialog, setHoursDialog] = useState(false);
  const [hoursForm, setHoursForm] = useState<Record<DayKey, { open: string; close: string; closed: boolean }>>({
    mon: { open: "09:00", close: "17:00", closed: false },
    tue: { open: "09:00", close: "17:00", closed: false },
    wed: { open: "09:00", close: "17:00", closed: false },
    thu: { open: "09:00", close: "17:00", closed: false },
    fri: { open: "09:00", close: "17:00", closed: false },
    sat: { open: "09:00", close: "17:00", closed: true },
    sun: { open: "09:00", close: "17:00", closed: true },
  });
  const [savingHours, setSavingHours] = useState(false);

  // Availability dialog
  const [availDialog, setAvailDialog] = useState(false);
  const [availForm, setAvailForm] = useState({
    type: "permanent" as "permanent" | "temporary",
    startDate: "", endDate: "",
    dayTimes: [false, true, true, true, true, true, false].map((on) => ({
      enabled: on, fullDay: true, startTime: "09:00", endTime: "17:00",
    })),
    status: "available", comments: "",
  });
  const [savingAvail, setSavingAvail] = useState(false);

  // Time Off dialog
  const [timeOffDialog, setTimeOffDialog] = useState(false);
  const [timeOffForm, setTimeOffForm] = useState({
    fullDays: true, startDate: "", endDate: "",
    startTime: "09:00", endTime: "17:00", comments: "",
  });
  const [savingTimeOff, setSavingTimeOff] = useState(false);

  // Square sync
  const [squareSyncing, setSquareSyncing] = useState(false);
  const [squareSyncResult, setSquareSyncResult] = useState<string | null>(null);

  // Clover OAuth feedback (replaced with toast)

  // Clover sync
  const [cloverSyncing, setCloverSyncing] = useState(false);
  const [cloverSyncResult, setCloverSyncResult] = useState<string | null>(null);

  // Schedule software sync
  const [selectedScheduleProvider, setSelectedScheduleProvider] = useState<ScheduleProviderId>("built_in");
  const [scheduleSyncing, setScheduleSyncing] = useState(false);
  const [scheduleSyncResult, setScheduleSyncResult] = useState<string | null>(null);
  const [syncingConnectedSystems, setSyncingConnectedSystems] = useState(false);
  const [supplierInboxPrefixInput, setSupplierInboxPrefixInput] = useState("");
  const [savingSupplierInboxPrefix, setSavingSupplierInboxPrefix] = useState(false);

  // Payment settings
  const [paymentTaxRate, setPaymentTaxRate] = useState("0");
  const [paymentCurrency, setPaymentCurrency] = useState("USD");
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);
  const [currencyDialog, setCurrencyDialog] = useState(false);
  const [savingCurrency, setSavingCurrency] = useState<string | null>(null);

  // Navigation mode (sidebar or bottom bar — mobile only)
  // Inside the browser shell the navigation-mode row is replaced by the bookmarks bar toggle (desktop).

  // Store machine mode (per-device: restricts app to POS / Inventory / Punch-in)
  const [storeMachine, setStoreMachine] = useStoreMachineMode();
  const [deviceName, setDeviceNameValue] = useDeviceName();
  const [autolockSeconds, setAutolockSecondsValue] = useAutolockSeconds();
  const [autolockDialog, setAutolockDialog] = useState(false);
  const [deviceNameDialog, setDeviceNameDialog] = useState(false);
  const [deviceNameInput, setDeviceNameInput] = useState("");

  // Exit store mode PIN dialog
  const [exitPinDialog, setExitPinDialog] = useState(false);
  const [exitPinInput, setExitPinInput] = useState("");
  const [exitPinError, setExitPinError] = useState("");
  const [exitPinBusy, setExitPinBusy] = useState(false);

  /**
   * Leave kiosk mode. The PIN is checked by the `verifyManagerPin` reducer,
   * which resolves only for an active owner/manager of this org.
   *
   * This used to compare `exitPinInput` against the `punchInCode` of every
   * subscribed org_member row — which meant any staff member's browser held
   * every manager's unlock PIN. The codes are no longer readable by anyone but
   * their owner, so the comparison has to happen server-side.
   */
  async function confirmExitPin(invalidMessage: string) {
    if (exitPinInput.length !== 4 || exitPinBusy) return;
    setExitPinBusy(true);
    try {
      await verifyManagerPin(exitPinInput);
      setStoreMachine(false);
      updateStoreDevice(getOrCreateDeviceId(), { enabled: false }).catch(console.error);
      setExitPinDialog(false);
      hapticSuccess();
      toast.success(t("settings.toastStoreModeDisabled"));
    } catch {
      setExitPinError(invalidMessage);
    } finally {
      setExitPinBusy(false);
    }
  }

  // Store devices management
  const storeDeviceTable = (tables as typeof tables & { storeDevice?: typeof tables.orgMember }).storeDevice;
  const [storeDeviceRows] = useTable(storeDeviceTable ?? tables.orgMember);
  const hasStoreDeviceTable = !!storeDeviceTable;
  const orgDevices = useMemo(() => {
    if (!hasStoreDeviceTable || !organizationId) return [];
    return (storeDeviceRows as unknown as StoreDeviceRow[]).filter((d) => d.organizationId === organizationId);
  }, [storeDeviceRows, organizationId, hasStoreDeviceTable]);
  const [manageDeviceDialog, setManageDeviceDialog] = useState(false);
  const [manageDeviceTarget, setManageDeviceTarget] = useState<StoreDeviceRow | null>(null);
  const [manageDeviceNameInput, setManageDeviceNameInput] = useState("");

  const [locationsDialog, setLocationsDialog] = useState(false);
  const [locationRows] = useLocations();

  const stdb = useSpacetimeDB();
  const identityString = stdb?.identity?.toString() ?? null;
  const [memberRows] = useTable(tables.orgMember);
  const [userRows] = useTable(tables.user);
  // Whether THIS user has a punch-in code. Setting one moved to the team page,
  // where a manager can also give a colleague theirs; here it only gates
  // store-machine mode, which needs a PIN to unlock the device again.
  const { code: myCode } = usePunchCode();

  useEffect(() => {
    if (!identityString) return;
    const me = (userRows as unknown as Array<{
      identity: { toString(): string };
      email?: string | null;
      displayName?: string | null;
      avatarUrl?: string | null;
    }>).find(
      (u) => u.identity.toString() === identityString,
    );
    const authName = [authUser?.firstName, authUser?.lastName].filter(Boolean).join(" ").trim();
    const nextDisplayName = me?.displayName ?? authName;
    setProfileDisplayName(nextDisplayName);
    setPersonalName(nextDisplayName);
    setAvatarUrl(me?.avatarUrl ?? null);
    setUserEmail(me?.email ?? authUser?.email ?? "");
  }, [identityString, userRows, authUser?.email, authUser?.firstName, authUser?.lastName]);

  useEffect(() => {
    const profileKey = authUser?.id ?? identityString;
    if (!profileKey) return;
    setPersonalBirthday(localStorage.getItem(`merchiva:personal:birthday:${profileKey}`) ?? "");
  }, [authUser?.id, identityString]);
  const scheduleSettings = settings as (UserSettings & {
    scheduleProvider?: string | null;
    scheduleConnected?: boolean | null;
    scheduleCompanyGuid?: string | null;
    scheduleCompanyId?: string | null;
    scheduleLocationId?: string | null;
    scheduleLastSyncedAt?: string | null;
    scheduleLastSyncStatus?: string | null;
    scheduleLastSyncSummary?: string | null;
    supplierInboundPrefix?: string | null;
  }) | null;
  const configuredScheduleProvider = normalizeScheduleProvider(scheduleSettings?.scheduleProvider) ?? "built_in";
  const connectedScheduleProvider = configuredScheduleProvider === "built_in" ? null : configuredScheduleProvider;
  const scheduleConnected = Boolean(scheduleSettings?.scheduleConnected && connectedScheduleProvider);
  const connectedScheduleLabel = scheduleProviderLabel(connectedScheduleProvider ?? configuredScheduleProvider);
  const supplierInboxPrefix = organizationId
    ? supplierInboundPrefixForOrg(settings?.supplierInboundPrefix ?? null, organizationId)
    : "";
  const supplierInboxAddress = organizationId
    ? supplierInboundAddressForOrg(settings?.supplierInboundPrefix ?? null, organizationId) ?? ""
    : "";

  useEffect(() => {
    const token = localStorage.getItem("stdb_token");
    if (token) {
      setUserId(token.slice(0, 36));
    }

    // settings state is now managed by useSettings hook (SpacetimeDB migration)

  }, []);

  // Sync form fields when settings loads via hook.
  // Fall back to the organization's own name if businessName was never set.
  useEffect(() => {
    if (settings) {
      setBusinessName(settings.businessName ?? orgName ?? "");
      setTimezone(settings.timezone);
      setLocationLatitude(settings.locationLatitude ?? "");
      setLocationLongitude(settings.locationLongitude ?? "");
      setGooglePlacesId(settings.googlePlacesId ?? "");
      setSupplierInboxPrefixInput(supplierInboxPrefix);
      if (settings.paymentTaxRate != null) setPaymentTaxRate(String(settings.paymentTaxRate));
      if (settings.paymentCurrency) setPaymentCurrency(settings.paymentCurrency);
      const parsed = parseOpeningHours(settings.openingHours ?? null);
      if (parsed) {
        setHoursForm((prev) => {
          const next = { ...prev };
          (Object.keys(next) as DayKey[]).forEach((k) => {
            const day = parsed[k];
            if (day) {
              next[k] = {
                open: day.open ?? prev[k].open,
                close: day.close ?? prev[k].close,
                closed: !!day.closed,
              };
            }
          });
          return next;
        });
      }
    }
  }, [settings, orgName, supplierInboxPrefix]);

  useEffect(() => {
    setSelectedScheduleProvider(configuredScheduleProvider);
  }, [configuredScheduleProvider]);

  // Restore dialogs from URL (?dialogs=Team,Invite)
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    const dialogsParam = searchParams.get("dialogs");
    if (!dialogsParam) return;
    restoredRef.current = true;

    const names = dialogsParam.split(",").map((n) => decodeURIComponent(n));
    const dialogMap: Record<string, () => void> = {
      "Availability": () => setAvailDialog(true),
      "Time Off": () => setTimeOffDialog(true),
      // Team, invitations and punch-in codes are all on the team page now.
      "Team": () => router.push("/manager/personnel/team"),
      "Invite": () => router.push("/manager/personnel/team"),
      "Punch-in code": () => router.push("/manager/personnel/team"),
    };

    // Clear URL first
    const url = new URL(window.location.href);
    url.searchParams.delete("dialogs");
    window.history.replaceState(null, "", url.toString());

    names.forEach((name, i) => {
      const opener = dialogMap[name];
      if (opener) setTimeout(opener, i * 400);
    });
  }, []);

  // Handle OAuth redirect query params
  useEffect(() => {
    // Square
    if (searchParams.get("connected") === "true") {
      toast.success(t("settings.toastSquareConnected"));
    }
    if (searchParams.get("error")) {
      const err = searchParams.get("error");
      const messages: Record<string, string> = {
        oauth_denied: t("settings.sqErrOauthDenied"),
        invalid_state: t("settings.sqErrInvalidState"),
        no_code: t("settings.sqErrNoCode"),
        token_exchange_failed: t("settings.sqErrTokenExchange"),
        exchange_failed: t("settings.sqErrExchange"),
      };
      toast.error(messages[err!] ?? t("settings.sqErrDefault"));
    }
    if (searchParams.get("pickLocation") === "true") {
      setShowLocationPicker(true);
      fetchLocations();
    }

    // Clover
    if (searchParams.get("clover_connected") === "true") {
      toast.success(t("settings.toastCloverConnected"));
      // Cookie was set by the callback — update local state immediately
      setSettings((prev) =>
        prev ? { ...prev, cloverConnected: true } : prev
      );
    }
    if (searchParams.get("clover_error")) {
      const err = searchParams.get("clover_error");
      const messages: Record<string, string> = {
        missing_params: t("settings.clErrNoCode"),
        state_mismatch: t("settings.clErrDefault"),
        missing_credentials: t("settings.clErrDefault"),
        token_exchange_failed: t("settings.clErrTokenExchange"),
        no_access_token: t("settings.clErrMissingToken"),
        unexpected_error: t("settings.clErrDefault"),
        integration_unavailable: t("settings.clErrDefault"),
        no_code: t("settings.clErrNoCode"),
        missing_token: t("settings.clErrMissingToken"),
        exchange_failed: t("settings.clErrTokenExchange"),
      };
      toast.error(messages[err!] ?? t("settings.clErrDefault"));
    }

    if (searchParams.get("schedule_connected")) {
      toast.success(t("settings.toastScheduleConnected"));
    }
    if (searchParams.get("schedule_error")) {
      const err = searchParams.get("schedule_error");
      const messages: Record<string, string> = {
        missing_org: t("settings.scheduleErrMissingOrg"),
        provider_unavailable: t("settings.scheduleErrProviderUnavailable"),
        missing_7shifts_client: t("settings.scheduleErrMissingClient"),
        state_mismatch: t("settings.scheduleErrState"),
        missing_7shifts_grant: t("settings.scheduleErrMissingGrant"),
        save_failed: t("settings.scheduleErrSaveFailed"),
      };
      toast.error(messages[err!] ?? t("settings.scheduleErrDefault"));
    }

    // Strip the OAuth-return params. They used to stay in the URL, so the
    // toast fired and /api/square/oauth/locations was re-fetched on every
    // re-render of this effect, and again on any Back navigation to the same
    // entry — the ?dialogs= effect above already does this correctly.
    const RETURN_PARAMS = [
      "connected", "error", "pickLocation",
      "clover_connected", "clover_error",
      "schedule_connected", "schedule_error",
    ];
    if (typeof window !== "undefined" && RETURN_PARAMS.some((k) => searchParams.get(k) != null)) {
      const url = new URL(window.location.href);
      for (const key of RETURN_PARAMS) url.searchParams.delete(key);
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const fetchLocations = async () => {
    setLoadingLocations(true);
    try {
      const res = await fetch("/api/square/oauth/locations");
      const json = await res.json();
      setLocations(json.locations ?? []);
    } catch {
      toast.error(t("settings.toastFailedLoadLocations"));
    } finally {
      setLoadingLocations(false);
    }
  };

  const handleSelectLocation = async (locationId: string) => {
    setSelectingLocation(true);
    try {
      const res = await fetch("/api/square/oauth/select-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId }),
      });
      if (res.ok) {
        setShowLocationPicker(false);
        toast.success(t("settings.toastSquareConnected"));
        const updated = await getSettings();
        setSettings(updated);
      } else {
        const err = await res.json();
        toast.error(err.error ?? t("settings.toastFailedSelectLocation"));
      }
    } catch {
      toast.error(t("settings.toastFailedSelectLocation"));
    } finally {
      setSelectingLocation(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!userId) return;
    setSavingProfile(true);
    try {
      await upsertSettings(userId, {
        businessName,
        businessType: settings?.businessType || undefined,
        timezone,
        paymentTaxRate: parseFloat(paymentTaxRate) || 0,
        paymentCurrency: paymentCurrency || "USD",
        locationLatitude: locationLatitude || undefined,
        locationLongitude: locationLongitude || undefined,
        googlePlacesId: googlePlacesId || undefined,
      });
      setSettings((prev) => {
        const next = prev ? { ...prev, businessName, timezone, locationLatitude, locationLongitude, googlePlacesId } : null;
        if (next) setCache("settings", next);
        return next;
      });
      hapticSuccess();
      toast.success(t("settings.toastProfileSaved"));
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast.error(t("settings.toastGeolocationUnsupported"));
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationLatitude(String(position.coords.latitude));
        setLocationLongitude(String(position.coords.longitude));
        setGettingLocation(false);
        toast.success(t("settings.toastLocationDetected"));
      },
      (err) => {
        console.error("[settings] Geolocation error:", err);
        toast.error(t("settings.toastGeolocationFailed"));
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  /**
   * Persist payment-related settings (tax rate + currency).
   *
   * `updateSettings` is a delete+insert, so whatever is sent BECOMES the row.
   * This used to build the payload out of the form's local state — which is
   * only filled in by the sync effect once the settings row has streamed in.
   * Change the currency before that (a deep link to /manager/settings on a
   * slow connection is enough) and the org's business name was cleared, its
   * timezone reset to America/Los_Angeles and its tax rate to 0%, under a
   * "saved" toast.
   *
   * Now: refuse to write until the row is known, and build the payload from
   * that row, overriding only the field being changed.
   */
  const persistPaymentSettings = async (next: { taxRate?: number; currency?: string }) => {
    if (!userId) return;
    if (loading || !settings) {
      toast.error(t("settings.toastSettingsNotLoaded"));
      return;
    }
    await upsertSettings(userId, {
      businessName: settings.businessName || undefined,
      businessType: settings.businessType || undefined,
      timezone: settings.timezone,
      paymentTaxRate: next.taxRate ?? settings.paymentTaxRate ?? 0,
      paymentCurrency: next.currency ?? settings.paymentCurrency ?? "USD",
      locationLatitude: settings.locationLatitude || undefined,
      locationLongitude: settings.locationLongitude || undefined,
      googlePlacesId: settings.googlePlacesId || undefined,
    });
  };

  const handleSavePaymentSettings = async () => {
    if (!userId) return;
    // Same reasoning as the currency row: the reducer only checks
    // `settings.view`, which every staff member has.
    if (!isAdmin) return;
    setSavingPayment(true);
    try {
      await persistPaymentSettings({ taxRate: parseFloat(paymentTaxRate) || 0 });
      toast.success(t("settings.toastPaymentSaved"));
      setPaymentSaved(true);
      setTimeout(() => setPaymentSaved(false), 2500);
    } finally {
      setSavingPayment(false);
    }
  };

  const handleSelectCurrency = async (code: string) => {
    if (!isAdmin) return;
    setSavingCurrency(code);
    setPaymentCurrency(code);
    try {
      await persistPaymentSettings({ currency: code });
      hapticSuccess();
      toast.success(t("settings.toastCurrencySaved"));
      setCurrencyDialog(false);
    } catch {
      toast.error(t("settings.toastSaveFailed"));
    } finally {
      setSavingCurrency(null);
    }
  };

  const handleSavePersonalSettings = async () => {
    const displayName = personalName.trim();
    if (!displayName) {
      toast.error(t("settings.personalNameRequired"));
      return;
    }

    setSavingPersonal(true);
    try {
      await updateDisplayName(displayName);
      const profileKey = authUser?.id ?? identityString;
      if (profileKey) {
        localStorage.setItem(`merchiva:personal:birthday:${profileKey}`, personalBirthday);
      }
      setProfileDisplayName(displayName);
      hapticSuccess();
      toast.success(t("settings.personalSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.toastSaveFailed"));
    } finally {
      setSavingPersonal(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    if (!file.type.startsWith("image/")) {
      toast.error(t("components.imageUpload.unsupportedType"));
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error(t("components.imageUpload.fileTooLarge"));
      return;
    }

    setUploadingAvatar(true);
    try {
      const [res] = await uploadFiles("avatar", { files: [file] });
      const url = res.ufsUrl;

      await updateProfile({
        displayName: profileDisplayName || personalName.trim() || userEmail || undefined,
        avatarUrl: url,
      });
      setAvatarUrl(url);
      hapticSuccess();
      toast.success(t("settings.avatarSaved"));
    } catch (err) {
      console.error("Avatar upload failed:", err);
      toast.error(t("settings.avatarUploadFailed"));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleDisconnectSquare = async () => {
    if (!userId) return;
    await disconnectSquare(userId);
    setSettings((prev) =>
      prev
        ? { ...prev, squareConnected: false, squareMerchantId: null, squareLocationId: null, squareLastSyncedAt: null }
        : null
    );
    setShowLocationPicker(false);
    setSquareSyncResult(null);
  };

  const handleSquareSync = async () => {
    setSquareSyncing(true);
    setSquareSyncResult(null);
    try {
      const res = await fetch("/api/square/sync", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setSquareSyncResult(json.message);
        const updated = await getSettings();
        setSettings(updated);
      } else {
        setSquareSyncResult(`${t("settings.errorPrefix")}: ${json.error}`);
      }
    } catch {
      setSquareSyncResult(t("settings.syncFailedGeneric"));
    } finally {
      setSquareSyncing(false);
    }
  };

  const handleDisconnectClover = async () => {
    if (!userId) return;
    // Clear server-side cookies via API route
    await fetch("/api/clover/disconnect", { method: "POST" }).catch(() => {});
    // Also call SpacetimeDB reducer (no-op currently but future-proofs)
    await disconnectClover(userId);
    setSettings((prev) =>
      prev
        ? { ...prev, cloverConnected: false, cloverMerchantId: null, cloverLastSyncedAt: null }
        : null
    );
    setCloverSyncResult(null);
  };

  const handleCloverSync = async () => {
    setCloverSyncing(true);
    setCloverSyncResult(null);
    try {
      const res = await fetch("/api/clover/sync", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setCloverSyncResult(json.message);
        const updated = await getSettings();
        setSettings(updated);
      } else {
        setCloverSyncResult(`${t("settings.errorPrefix")}: ${json.error}`);
      }
    } catch {
      setCloverSyncResult(t("settings.syncFailedGeneric"));
    } finally {
      setCloverSyncing(false);
    }
  };

  const handleConnectSchedule = async () => {
    if (!organizationId) return;
    const provider = SCHEDULE_PROVIDERS.find((p) => p.id === selectedScheduleProvider);
    if (!provider) return;
    if (provider.id === "built_in") {
      await setScheduleIntegration({ provider: provider.id });
      setScheduleSyncResult(null);
      toast.success(t("settings.builtInScheduleSelected"));
      return;
    }
    if (provider.status !== "available") {
      await setScheduleIntegration({ provider: provider.id });
      toast.message(t("settings.scheduleProviderSaved"));
      return;
    }
    window.location.href = `/api/schedule/connect?provider=${encodeURIComponent(provider.id)}&orgId=${encodeURIComponent(organizationId)}`;
  };

  const handleScheduleSync = async () => {
    if (!organizationId) return;
    setScheduleSyncing(true);
    setScheduleSyncResult(null);
    try {
      const res = await fetch("/api/schedule/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const json = await res.json();
      if (json.success) {
        setScheduleSyncResult(json.message ?? t("settings.scheduleSyncComplete"));
        toast.success(t("settings.scheduleSyncComplete"));
      } else {
        setScheduleSyncResult(`${t("settings.errorPrefix")}: ${json.error}`);
      }
    } catch {
      setScheduleSyncResult(t("settings.syncFailedGeneric"));
    } finally {
      setScheduleSyncing(false);
    }
  };

  const handleDisconnectSchedule = async () => {
    await disconnectScheduleIntegration();
    setScheduleSyncResult(null);
    setSelectedScheduleProvider("built_in");
    toast.success(t("settings.scheduleDisconnected"));
  };

  const handleSaveSupplierInboxPrefix = async () => {
    const normalized = normalizeSupplierInboundPrefix(supplierInboxPrefixInput);
    if (!isValidSupplierInboundPrefix(normalized)) {
      toast.error(t("settings.supplierInboxInvalid"));
      return;
    }
    setSavingSupplierInboxPrefix(true);
    try {
      await setSupplierInboundPrefix(normalized);
      setSupplierInboxPrefixInput(normalized);
      toast.success(t("settings.supplierInboxSaved"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg.includes("taken") ? t("settings.supplierInboxTaken") : msg);
    } finally {
      setSavingSupplierInboxPrefix(false);
    }
  };

  const handleSyncConnectedSystems = async () => {
    const jobs: Promise<void>[] = [];
    if (settings?.squareConnected) jobs.push(handleSquareSync());
    if (settings?.cloverConnected) jobs.push(handleCloverSync());
    if (scheduleConnected) jobs.push(handleScheduleSync());
    if (jobs.length === 0) {
      toast.error(t("settings.noConnectedSystems"));
      return;
    }
    setSyncingConnectedSystems(true);
    try {
      await Promise.all(jobs);
      toast.success(t("settings.connectedSystemsSynced"));
    } finally {
      setSyncingConnectedSystems(false);
    }
  };

  const autolockLabel = (s: AutolockSeconds): string => {
    if (s === 0) return t("lock.never");
    if (s < 60) return `${s}s`;
    const m = Math.round(s / 60);
    return `${m}m`;
  };

  const DAY_NAMES = [
    t("availability.daySun"),
    t("availability.dayMon"),
    t("availability.dayTue"),
    t("availability.dayWed"),
    t("availability.dayThu"),
    t("availability.dayFri"),
    t("availability.daySat"),
  ];

  const handleSaveHours = async () => {
    if (!organizationId) return;
    setSavingHours(true);
    try {
      const payload: WeeklyHours = {} as WeeklyHours;
      (Object.keys(hoursForm) as DayKey[]).forEach((k) => {
        const d = hoursForm[k];
        payload[k] = d.closed
          ? { closed: true }
          : { open: d.open, close: d.close, closed: false };
      });
      await updateOpeningHours({ openingHours: JSON.stringify(payload) });
      hapticSuccess();
      toast.success(t("hours.toastSaved"));
      setHoursDialog(false);
    } catch (err) {
      console.error("Save business hours failed:", err);
      toast.error(t("hours.toastFailed"));
    } finally {
      setSavingHours(false);
    }
  };

  // Short label for the Workspace SRow meta (e.g. "Mon–Fri 9:00–17:00" or "Not set")
  const hoursMetaLabel = useMemo(() => {
    if (!settings?.openingHours) return null;
    const parsed = parseOpeningHours(settings.openingHours);
    if (!parsed) return null;
    const order: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const openDays = order.filter((k) => !parsed[k]?.closed && parsed[k]?.open && parsed[k]?.close);
    if (openDays.length === 0) return t("hours.allClosed");
    return `${openDays.length}${t("hours.daysSuffix")}`;
  }, [settings?.openingHours, t]);

  const handleSaveAvailability = async () => {
    if (!userId || !organizationId) return;
    setSavingAvail(true);
    try {
      const days = availForm.dayTimes.map((dt) => dt.enabled);
      const allFullDay = availForm.dayTimes.every((dt) => dt.fullDay || !dt.enabled);
      // NOTE: this editor never loads the member's existing availability row
      // (getMyAvailability is imported here and never called), so it always
      // inserts a new one. The staffing page's editor does pass the id.
      await upsertAvailability({
        userId, organizationId: organizationId!,
        type: availForm.type,
        startDate: availForm.type === "temporary" ? availForm.startDate : null,
        endDate: availForm.type === "temporary" ? availForm.endDate : null,
        days,
        dayTimes: availForm.dayTimes,
        status: availForm.status,
        fullDay: allFullDay,
        startTime: null,
        endTime: null,
        comments: availForm.comments,
      });
      setAvailDialog(false);
    } catch (err) {
      console.error("Save availability failed:", err);
    } finally {
      setSavingAvail(false);
    }
  };

  const handleTimeOffRequest = async () => {
    if (!userId || !organizationId) return;
    setSavingTimeOff(true);
    try {
      await createTimeOffRequest({
        userId, organizationId: organizationId!,
        startDate: timeOffForm.startDate,
        endDate: timeOffForm.endDate,
        fullDays: timeOffForm.fullDays,
        startTime: timeOffForm.fullDays ? null : timeOffForm.startTime,
        endTime: timeOffForm.fullDays ? null : timeOffForm.endTime,
        comments: timeOffForm.comments,
      });
      setTimeOffDialog(false);
    } catch (err) {
      console.error("Time off request failed:", err);
    } finally {
      setSavingTimeOff(false);
    }
  };

  const [themeMode] = useThemeMode();
  type SubPanel = "workspace" | "personal" | "integrations" | "ai" | "notifications" | "preferences" | "device" | "data" | "about" | "security" | "usage" | "storeprofile" | null;
  const [subPanel, setSubPanel] = useState<SubPanel>(null);
  const assistantPermissionMode = !assistantConfig.enabled
    ? "off"
    : assistantConfig.mode === "full"
      ? "full"
      : assistantConfig.mode === "auto_low" || assistantConfig.mode === "auto_low_medium"
        ? "partial"
        : "off";

  useEffect(() => {
    if (!organizationId) return;
    setWeeklyRestockTime(localStorage.getItem(`merchiva:weekly-restock:${organizationId}`) ?? "09:00");
  }, [organizationId]);

  const saveAssistantMode = async (mode: "off" | "partial" | "full") => {
    const nextMode: AutonomyMode = mode === "full" ? "full" : mode === "partial" ? "auto_low" : "propose_only";
    setAssistantSaving(true);
    try {
      await saveAssistantConfig({ ...assistantConfig, enabled: true, mode: nextMode });
      hapticSuccess();
      toast.success(t("settings.aiSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.toastSaveFailed"));
    } finally {
      setAssistantSaving(false);
    }
  };

  const saveWeeklyRestockTime = (value: string) => {
    setWeeklyRestockTime(value);
    if (organizationId) localStorage.setItem(`merchiva:weekly-restock:${organizationId}`, value);
    toast.success(t("settings.restockTimeSaved"));
  };

  // ─── Multi-store state ──────────────────────────────────────────────────

  // Shared dialog rendering used by the main mobile-first layout
  function renderDialogs() {
    return (
      <>
        {/* ─── Currency picker ──────────────────────────────────────── */}
        <DynamicUIElement open={currencyDialog} onOpenChange={setCurrencyDialog}>
          <DynamicUIElementContent>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("settings.currency")}>{t("settings.currency")}</DynamicUIElementTitle>
              <DynamicUIElementDescription>{t("settings.currencyDesc")}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {CURRENCIES.map((c) => {
                const active = paymentCurrency === c.code;
                return (
                  <OptionRow
                    key={c.code}
                    selected={active}
                    disabled={savingCurrency !== null}
                    onSelect={() => handleSelectCurrency(c.code)}
                    className="py-2.5"
                    leading={<span className="w-8 shrink-0 text-left font-mono text-sm text-muted-foreground">{c.symbol}</span>}
                    title={t(c.labelKey)}
                    meta={
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{c.code}</span>
                        {savingCurrency === c.code && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      </span>
                    }
                  />
                );
              })}
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>

        {/* ─── Auto-lock picker ─────────────────────────────────────── */}
        <DynamicUIElement open={autolockDialog} onOpenChange={setAutolockDialog}>
          <DynamicUIElementContent>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("lock.autolockTitle")}>{t("lock.autolockTitle")}</DynamicUIElementTitle>
              <DynamicUIElementDescription>{t("lock.autolockSubtitle")}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="space-y-1">
              {AUTOLOCK_OPTIONS.map((s) => (
                <OptionRow
                  key={s}
                  selected={autolockSeconds === s}
                  onSelect={() => {
                    setAutolockSecondsValue(s);
                    setAutolockDialog(false);
                  }}
                  className="py-2.5"
                  title={s === 0 ? t("lock.never") : autolockLabel(s)}
                />
              ))}
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>

        {/* ─── Business Hours DynamicUIElement ──────────────────────── */}
        <DynamicUIElement open={hoursDialog} onOpenChange={setHoursDialog}>
          <DynamicUIElementContent>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("hours.mobileTitle")}>{t("hours.title")}</DynamicUIElementTitle>
              <DynamicUIElementDescription>{t("hours.subtitle")}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="space-y-2">
              {(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as DayKey[]).map((k) => {
                const day = hoursForm[k];
                return (
                  <div key={k} className="space-y-1.5 rounded border border-border p-2.5">
                    <div className="flex items-center justify-between">
                      <Eyebrow as="span" className="text-xs text-foreground">{t(`hours.day_${k}`)}</Eyebrow>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{day.closed ? t("hours.closed") : t("hours.open")}</span>
                        <Switch
                          size="sm"
                          aria-label={`Toggle ${k}`}
                          checked={!day.closed}
                          onCheckedChange={() => setHoursForm((f) => ({ ...f, [k]: { ...f[k], closed: !f[k].closed } }))}
                        />
                      </div>
                    </div>
                    {!day.closed && (
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="time"
                          value={day.open}
                          className="h-8 text-xs"
                          onChange={(e) => setHoursForm((f) => ({ ...f, [k]: { ...f[k], open: e.target.value } }))}
                        />
                        <Input
                          type="time"
                          value={day.close}
                          className="h-8 text-xs"
                          onChange={(e) => setHoursForm((f) => ({ ...f, [k]: { ...f[k], close: e.target.value } }))}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              <Button onClick={handleSaveHours} disabled={savingHours || !organizationId} className="w-full">
                {savingHours ? <Spinner size={16} /> : t("hours.save")}
              </Button>
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>

        {/* ─── Availability DynamicUIElement ─────────────────────────── */}
        <DynamicUIElement open={availDialog} onOpenChange={setAvailDialog}>
          <DynamicUIElementContent>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("availability.mobileTitle")}>{t("availability.title")}</DynamicUIElementTitle>
              <DynamicUIElementDescription>{t("availability.subtitle")}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("availability.type")}</Label>
                <SegmentedControl
                  aria-label={t("availability.type")}
                  value={availForm.type}
                  onChange={(type) => setAvailForm((f) => ({ ...f, type }))}
                  options={(["permanent", "temporary"] as const).map((type) => ({ value: type, label: <span className="capitalize">{t(`availability.${type}`)}</span> }))}
                />
              </div>
              {availForm.type === "temporary" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>{t("availability.startDate")}</Label><Input type="date" value={availForm.startDate} onChange={(e) => setAvailForm((f) => ({ ...f, startDate: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>{t("availability.endDate")}</Label><Input type="date" value={availForm.endDate} onChange={(e) => setAvailForm((f) => ({ ...f, endDate: e.target.value }))} /></div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t("availability.availableDays")}</Label>
                <div className="flex gap-1.5">
                  {DAY_NAMES.map((d, i) => (
                    <button key={d} onClick={() => setAvailForm((f) => {
                      const dayTimes = f.dayTimes.map((dt, j) => j === i ? { ...dt, enabled: !dt.enabled } : dt);
                      return { ...f, dayTimes };
                    })}
                      type="button" aria-pressed={availForm.dayTimes[i].enabled}
                      className={`flex-1 py-1.5 text-xs font-semibold border rounded transition-colors ${availForm.dayTimes[i].enabled ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"}`}
                    >{d}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("availability.status")}</Label>
                <Select value={availForm.status} onValueChange={(v) => setAvailForm((f) => ({ ...f, status: v ?? f.status }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">{t("availability.available")}</SelectItem>
                    <SelectItem value="unavailable">{t("availability.unavailable")}</SelectItem>
                    <SelectItem value="preferred">{t("availability.preferred")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* Per-day time settings */}
              <div className="space-y-2">
                {availForm.dayTimes.map((dt, i) => {
                  if (!dt.enabled) return null;
                  return (
                    <div key={DAY_NAMES[i]} className="space-y-1.5 rounded border border-border p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground">{DAY_NAMES[i]}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{t("availability.fullDay")}</span>
                          <Switch
                            size="sm"
                            aria-label={t("availability.fullDay")}
                            checked={dt.fullDay}
                            onCheckedChange={() => setAvailForm((f) => {
                              const dayTimes = f.dayTimes.map((d, j) => j === i ? { ...d, fullDay: !d.fullDay } : d);
                              return { ...f, dayTimes };
                            })}
                          />
                        </div>
                      </div>
                      {!dt.fullDay && (
                        <div className="grid grid-cols-2 gap-2">
                          <Input type="time" value={dt.startTime} className="h-8 text-xs" onChange={(e) => setAvailForm((f) => {
                            const dayTimes = f.dayTimes.map((d, j) => j === i ? { ...d, startTime: e.target.value } : d);
                            return { ...f, dayTimes };
                          })} />
                          <Input type="time" value={dt.endTime} className="h-8 text-xs" onChange={(e) => setAvailForm((f) => {
                            const dayTimes = f.dayTimes.map((d, j) => j === i ? { ...d, endTime: e.target.value } : d);
                            return { ...f, dayTimes };
                          })} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="space-y-1.5">
                <Label>{t("availability.comments")}</Label>
                <Textarea value={availForm.comments} onChange={(e) => setAvailForm((f) => ({ ...f, comments: e.target.value }))} placeholder={t("availability.anyNotes")} rows={2} className="resize-none text-sm" />
              </div>
              <Button onClick={handleSaveAvailability} disabled={savingAvail} className="w-full">
                {savingAvail ? <Spinner size={16} /> : t("availability.saveAvailability")}
              </Button>
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>

        {/* ─── Time Off DynamicUIElement ─────────────────────────────── */}
        <DynamicUIElement open={timeOffDialog} onOpenChange={setTimeOffDialog}>
          <DynamicUIElementContent>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("settings.timeOffMobileTitle")}>{t("settings.timeOffTitle")}</DynamicUIElementTitle>
              <DynamicUIElementDescription>{t("settings.timeOffSubtitle")}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>{t("settings.fullDays")}</Label>
                <Switch
                  aria-label={t("settings.fullDays")}
                  checked={timeOffForm.fullDays}
                  onCheckedChange={() => setTimeOffForm((f) => ({ ...f, fullDays: !f.fullDays }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>{t("settings.startDate")}</Label><Input type="date" value={timeOffForm.startDate} onChange={(e) => setTimeOffForm((f) => ({ ...f, startDate: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>{t("settings.endDate")}</Label><Input type="date" value={timeOffForm.endDate} onChange={(e) => setTimeOffForm((f) => ({ ...f, endDate: e.target.value }))} /></div>
              </div>
              {!timeOffForm.fullDays && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>{t("settings.startTime")}</Label><Input type="time" value={timeOffForm.startTime} onChange={(e) => setTimeOffForm((f) => ({ ...f, startTime: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>{t("settings.endTime")}</Label><Input type="time" value={timeOffForm.endTime} onChange={(e) => setTimeOffForm((f) => ({ ...f, endTime: e.target.value }))} /></div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{t("settings.comments")}</Label>
                <Textarea value={timeOffForm.comments} onChange={(e) => setTimeOffForm((f) => ({ ...f, comments: e.target.value }))} placeholder={t("settings.timeOffReasonPlaceholder")} rows={3} className="resize-none text-sm" />
              </div>
              <Button onClick={handleTimeOffRequest} disabled={savingTimeOff || !timeOffForm.startDate || !timeOffForm.endDate} className="w-full">
                {savingTimeOff ? <Spinner size={16} /> : t("settings.createTimeOffRequest")}
              </Button>
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>

        {/* ─── Device Name DynamicUIElement ──────────────────────────────── */}
        <DynamicUIElement open={deviceNameDialog} onOpenChange={setDeviceNameDialog}>
          <DynamicUIElementContent>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("settings.deviceNameMobileTitle")}>
                {deviceName ? t("settings.renameDevice") : t("settings.nameDevice")}
              </DynamicUIElementTitle>
              <DynamicUIElementDescription>
                {deviceName
                  ? t("settings.deviceNameUpdateDesc")
                  : t("settings.deviceNameNewDesc")}
              </DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("settings.deviceName")}</Label>
                <Input
                  value={deviceNameInput}
                  onChange={(e) => setDeviceNameInput(e.target.value.slice(0, 40))}
                  placeholder={t("settings.deviceNamePlaceholder")}
                  className="h-11"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && deviceNameInput.trim()) {
                      setDeviceNameValue(deviceNameInput);
                      setDeviceNameDialog(false);
                      if (!storeMachine) setStoreMachine(true);
                      registerStoreDevice(getOrCreateDeviceId(), deviceNameInput.trim()).catch(console.error);
                    }
                  }}
                />
              </div>
              <Button
                onClick={() => {
                  if (!deviceNameInput.trim()) return;
                  setDeviceNameValue(deviceNameInput);
                  setDeviceNameDialog(false);
                  if (!storeMachine) setStoreMachine(true);
                  registerStoreDevice(getOrCreateDeviceId(), deviceNameInput.trim()).catch(console.error);
                  hapticSuccess();
                  toast.success(t("settings.toastDeviceNameSaved"));
                }}
                disabled={!deviceNameInput.trim()}
                className="w-full"
              >
                {t("settings.save")}
              </Button>
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>

        {/* ─── Exit Store Mode PIN DynamicUIElement ─────────────────────── */}
        <DynamicUIElement open={exitPinDialog} onOpenChange={(o) => { if (!o) setExitPinDialog(false); }}>
          <DynamicUIElementContent>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("settings.exitStoreModeMobileTitle")}>{t("settings.exitStoreModeTitle")}</DynamicUIElementTitle>
              <DynamicUIElementDescription>{t("settings.exitStoreModeDesc")}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("settings.punchInCode")}</Label>
                <Input
                  value={exitPinInput}
                  onChange={(e) => { setExitPinInput(e.target.value.replace(/\D/g, "").slice(0, 4)); setExitPinError(""); }}
                  inputMode="numeric"
                  placeholder={t("settings.fourDigitsPlaceholder")}
                  className="h-11 font-mono text-base tracking-[0.3em]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && exitPinInput.length === 4) {
                      void confirmExitPin(t("settings.exitPinInvalid"));
                    }
                  }}
                />
                {exitPinError && <p className="text-xs text-destructive mt-1">{exitPinError}</p>}
              </div>
              <Button
                onClick={() => { void confirmExitPin(t("settings.exitPinInvalidRole")); }}
                disabled={exitPinInput.length !== 4 || exitPinBusy}
                className="w-full"
              >
                {t("settings.disableStoreMode")}
              </Button>
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>

        {/* ─── Manage Device DynamicUIElement ───────────────────────────── */}
        <DynamicUIElement open={manageDeviceDialog} onOpenChange={setManageDeviceDialog}>
          <DynamicUIElementContent>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("settings.manageDeviceMobileTitle")}>{t("settings.manageDeviceTitle")}</DynamicUIElementTitle>
              <DynamicUIElementDescription>{t("settings.manageDeviceDesc")}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("settings.deviceName")}</Label>
                <Input
                  value={manageDeviceNameInput}
                  onChange={(e) => setManageDeviceNameInput(e.target.value.slice(0, 40))}
                  placeholder={t("settings.deviceNamePlaceholder")}
                  className="h-11"
                  autoFocus
                />
              </div>
              <Button
                onClick={async () => {
                  if (!manageDeviceTarget || !manageDeviceNameInput.trim()) return;
                  await updateStoreDevice(manageDeviceTarget.deviceId, { name: manageDeviceNameInput.trim() });
                  setManageDeviceDialog(false);
                  hapticSuccess();
                  toast.success(t("settings.toastDeviceRenamed"));
                }}
                disabled={!manageDeviceNameInput.trim()}
                className="w-full"
              >
                {t("settings.save")}
              </Button>
              <Button
                variant="destructive"
                onClick={async () => {
                  if (!manageDeviceTarget) return;
                  await removeStoreDevice(manageDeviceTarget.deviceId);
                  setManageDeviceDialog(false);
                  toast.success(t("settings.toastDeviceRemoved"));
                }}
                className="w-full"
              >
                {t("settings.removeDevice")}
              </Button>
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>

        {/* ─── Locations DynamicUIElement ───────────────────────── */}
        <DynamicUIElement open={locationsDialog} onOpenChange={setLocationsDialog}>
          <DynamicUIElementContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("locations.title")}>{t("locations.title")}</DynamicUIElementTitle>
              <DynamicUIElementDescription>{t("settings.manageLocations")}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            {organizationId && (
              <LocationManager organizationId={organizationId} />
            )}
          </DynamicUIElementContent>
        </DynamicUIElement>
      </>
    );
  }

  const handleLogout = () => {
    clearCache();
    localStorage.removeItem("active_org_id");
    signOut();
  };

  // Computed stats for hero card (use SpacetimeDB memberRows for live counts)
  const orgMembers = (memberRows as unknown as Array<{
    organizationId: string;
    status: string;
    role: string;
  }>).filter((m) => m.organizationId === organizationId && m.status === "active");
  const activeStaffCount = orgMembers.length;
  const rolesCount = new Set(orgMembers.map((m) => m.role)).size;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgLocationCount = (locationRows as unknown as any[] | undefined)?.filter((l: any) => l.organizationId === organizationId).length ?? 0;
  const integrationsCount =
    (settings?.squareConnected ? 1 : 0) +
    (settings?.cloverConnected ? 1 : 0) +
    (scheduleConnected ? 1 : 0);

  return (
    <>
    <div className="min-h-screen bg-background pb-28 w-full lg:mx-auto lg:max-w-12xl lg:px-8 lg:py-6">
      <PageHeader
        title={t("settings.title")}
        subtitle={`${businessName || t("settings.yourBusiness")}${activeStaffCount > 0 ? ` · ${activeStaffCount} ${t("settings.membersSuffix")}` : ""}`}
        actions={[{ icon: <Search className="h-4 w-4" /> }]}
      />

      {/* ─── Store Header — taps open switch drawer ────────── */}
      <button
        type="button"
        onClick={() => { hapticMedium(); setSwitcherOpen(true); }}
        className="flex items-center gap-3.5 w-full px-[18px] py-4 border-b border-border text-left active:bg-muted/40 transition-colors"
      >
        <div className="relative shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="h-11 w-11 rounded-lg object-cover bg-muted border border-border" />
          ) : (
            <div className="h-11 w-11 rounded-lg bg-muted border border-border flex items-center justify-center text-base font-semibold text-muted-foreground">
              {(currentOrg?.name || businessName || userEmail)?.[0]?.toUpperCase() ?? "?"}

            </div>
          )}
          <label
            className="absolute -bottom-1 -right-1 p-0.5 rounded bg-muted border border-border cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            {uploadingAvatar ? <Spinner size={10} className="text-muted-foreground" /> : <Camera className="h-2.5 w-2.5 text-muted-foreground" />}
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
          </label>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-base font-semibold text-foreground truncate">{currentOrg?.name || businessName || t("settings.yourBusiness")}</p>
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
          <p className="text-xs font-mono text-muted-foreground truncate tabular-nums">{userEmail || t("settings.emailFallback")}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <SBadge tone="outline">{role ?? t("settings.memberFallback")}</SBadge>
        </div>
      </button>

      {/* ─── Store / Account switcher drawer (mobile) ──────── */}
      <Drawer open={switcherOpen} onOpenChange={setSwitcherOpen}>
        <DrawerContent className="px-0 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <DrawerHeader className="px-[18px] pt-2 pb-3">
            <DrawerTitle className="text-base">{t("settings.groupStoreAccount")}</DrawerTitle>
            <DrawerDescription className="sr-only">
              {t("settings.switchStoreAccount")}
            </DrawerDescription>
          </DrawerHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {/* Stores */}
            <div className="px-[18px] pt-2 pb-1.5">
              <Eyebrow>{t("nav.selectStore")}</Eyebrow>
            </div>
            <div className="bg-background border-y border-border">
              {organizations.map((org, i) => {
                const isCurrent = org.id === currentOrg?.id;
                return (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => {
                      if (isCurrent) { setSwitcherOpen(false); return; }
                      hapticMedium();
                      setSwitcherOpen(false);
                      switchOrg(org.id);
                    }}
                    className={`flex items-center gap-3 px-[18px] py-3.5 w-full text-left ${i === 0 ? "" : "border-t border-border"}`}
                  >
                    <StoreLogo name={org.name} logoUrl={org.logoUrl} className="h-9 w-9" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{org.name}</p>
                      {isCurrent && (
                        <p className="text-xs text-muted-foreground mt-0.5">{t("settings.currentStore")}</p>
                      )}
                    </div>
                    {isCurrent
                      ? <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                      : <span className="text-[11px] text-muted-foreground shrink-0">{t("common.switch")}</span>}
                  </button>
                );
              })}
              {/* Add-store: collapsed → button row; expanded → inline form
                  inside the same surface so the drawer doesn't reflow. */}
              {!drawerCreating ? (
                <button
                  type="button"
                  onClick={() => { hapticMedium(); setDrawerCreating(true); }}
                  className="flex items-center gap-3 px-[18px] py-3.5 w-full text-left border-t border-border"
                >
                  <IconTile>
                    <Plus className="h-4 w-4 text-foreground" />
                  </IconTile>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{t("nav.createNewStore")}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {t("settings.createStoreHint")}
                    </p>
                  </div>
                </button>
              ) : (
                <form
                  onSubmit={handleDrawerCreateStore}
                  className="px-[18px] py-3.5 border-t border-border space-y-2.5"
                >
                  <Input
                    autoFocus
                    value={drawerStoreName}
                    onChange={(e) => setDrawerStoreName(e.target.value)}
                    placeholder={t("nav.storeName")}
                    className="h-9 text-sm"
                  />
                  {drawerCreateError && (
                    <p className="text-xs text-destructive">{drawerCreateError}</p>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={drawerCreateLoading || !drawerStoreName.trim()}
                      className="flex-1"
                    >
                      {drawerCreateLoading ? <Spinner size={14} /> : t("nav.create")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={closeSwitcherCreate}
                      disabled={drawerCreateLoading}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {/* Accounts */}
            {accounts && accounts.length > 0 && (
              <>
                <div className="px-[18px] pt-4 pb-1.5">
                  <Eyebrow>{t("accounts.title")}</Eyebrow>
                </div>
                <div className="bg-background border-y border-border">
                  {accounts.map((acct, i) => {
                    const isCurrent = acct.id === authUser?.id;
                    return (
                      <button
                        key={acct.id}
                        type="button"
                        onClick={() => {
                          if (isCurrent) { setSwitcherOpen(false); return; }
                          hapticMedium();
                          setSwitcherOpen(false);
                          switchAccount(acct.id);
                        }}
                        className={`flex items-center gap-3 px-[18px] py-3.5 w-full text-left ${i === 0 ? "" : "border-t border-border"}`}
                      >
                        <IconTile>
                          <UserCog className="h-4 w-4 text-foreground" />
                        </IconTile>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{acct.email}</p>
                          {isCurrent && (
                            <p className="text-xs text-muted-foreground mt-0.5">{t("settings.currentAccount")}</p>
                          )}
                        </div>
                        {isCurrent
                          ? <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                          : <span className="text-[11px] text-muted-foreground shrink-0">{t("common.switch")}</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Actions */}
            <div className="mt-4 bg-background border-y border-border">
              <button
                type="button"
                onClick={() => {
                  hapticMedium();
                  setSwitcherOpen(false);
                  window.location.href = "/login?addAccount=1";
                }}
                className="flex items-center gap-3 px-[18px] py-3.5 w-full text-left"
              >
                <IconTile>
                  <UserPlus className="h-4 w-4 text-foreground" />
                </IconTile>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{t("accounts.addAccount")}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  clearCache();
                  localStorage.removeItem("active_org_id");
                  setSwitcherOpen(false);
                  signOut();
                }}
                className="flex items-center gap-3 px-[18px] py-3.5 w-full text-left border-t border-border"
              >
                <IconTile>
                  <LogOut className="h-4 w-4 text-destructive" />
                </IconTile>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-destructive">{t("common.signOut")}</p>
                </div>
              </button>
            </div>
          </div>
          <DrawerClose className="sr-only">{t("common.cancel")}</DrawerClose>
        </DrawerContent>
      </Drawer>

      {/* ─── Category entries ────────────────────────────────── */}
      <div className="bg-background lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3 lg:bg-transparent lg:mt-4 lg:p-0">
        <SCategoryHeader>{t("settings.settingsCategoryBusiness")}</SCategoryHeader>
        <SRow
          icon={<Building2 className="h-4 w-4 text-foreground" />}
          title={t("settings.groupWorkspace")}
          meta={businessName || t("settings.notSet")}
          onClick={() => setSubPanel("workspace")}
          isFirst
          card
        />
        <SCategoryHeader>{t("settings.settingsCategoryPeople")}</SCategoryHeader>
        <SRow
          icon={<UserCog className="h-4 w-4 text-foreground" />}
          title={t("settings.personalSettings")}
          meta={personalName || userEmail || t("settings.notSet")}
          onClick={() => setSubPanel("personal")}
          right={personalBirthday ? <SBadge tone="outline">{personalBirthday}</SBadge> : undefined}
          card
        />
        {isAdmin && (
          <SRow
            icon={<Users className="h-4 w-4 text-foreground" />}
            title={t("settings.groupTeamAccess")}
            meta={t("settings.teamOnTeamPage")}
            onClick={() => router.push("/manager/personnel/team")}
            right={<SBadge>{String(activeStaffCount)}</SBadge>}
            card
          />
        )}
        <SCategoryHeader>{t("settings.settingsCategoryAutomation")}</SCategoryHeader>
        {isAdmin && (
          <SRow
            icon={<Zap className="h-4 w-4 text-foreground" />}
            title={t("settings.apiIntegrations")}
            meta={
              integrationsCount > 0
                ? t("settings.connectedIntegrationsCount").replace("{count}", String(integrationsCount))
                : t("settings.connectPOSAndSchedule")
            }
            onClick={() => setSubPanel("integrations")}
            right={integrationsCount > 0 ? <SBadge tone="ok">{String(integrationsCount)}</SBadge> : undefined}
            card
          />
        )}
        {isAdmin && (
          <SRow
            icon={<Building2 className="h-4 w-4 text-foreground" />}
            title={t("settings.storeImage")}
            meta={t("settings.storeImageHint")}
            onClick={() => setSubPanel("storeprofile")}
            card
          />
        )}
        {isAdmin && (
          <SRow
            icon={<Bot className="h-4 w-4 text-foreground" />}
            title={t("settings.merchivaAi")}
            meta={assistantPermissionMode === "full" ? (t("settings.aiFullAuto")) : assistantPermissionMode === "partial" ? (t("settings.aiPartialAuto")) : (t("settings.aiApprovalRequired"))}
            onClick={() => setSubPanel("ai")}
            card
          />
        )}
        <SCategoryHeader>{t("settings.settingsCategoryDevice")}</SCategoryHeader>
        <SRow
          icon={<Bell className="h-4 w-4 text-foreground" />}
          title={t("settings.groupNotifications")}
          meta={t("settings.shiftReminders")}
          onClick={() => setSubPanel("notifications")}
          card
        />
        <SRow
          icon={<Sparkles className="h-4 w-4 text-foreground" />}
          title={t("usage.title")}
          meta={t("usage.subtitle")}
          onClick={() => setSubPanel("usage")}
          card
        />
        <SRow
          icon={<Shield className="h-4 w-4 text-foreground" />}
          title={t("settings.groupSecurity")}
          meta={t("settings.securityMeta")}
          onClick={() => setSubPanel("security")}
          card
        />
        <SRow
          icon={<SettingsIcon className="h-4 w-4 text-foreground" />}
          title={t("settings.groupPreferences")}
          meta={`${themeMode === "system" ? (t("settings.themeSystem")) : themeMode === "light" ? (t("settings.themeLight")) : (t("settings.themeDark"))} · ${LOCALE_LABELS[locale]}`}
          onClick={() => setSubPanel("preferences")}
          card
        />
        <SRow
          icon={<StoreModeIcon className="h-5 w-5" />}
          title={t("settings.groupDevice")}
          meta={storeMachine ? t("settings.storeMachineMode") : (deviceName || t("settings.notSet"))}
          onClick={() => setSubPanel("device")}
          card
        />
        <SCategoryHeader>{t("settings.settingsCategoryAccount")}</SCategoryHeader>
        <SRow
          icon={<Download className="h-4 w-4 text-foreground" />}
          title={t("settings.groupData")}
          meta={t("settings.exportData")}
          onClick={() => setSubPanel("data")}
          card
        />
        <SRow
          icon={<Info className="h-4 w-4 text-foreground" />}
          title={t("settings.groupAbout")}
          meta={t("settings.appVersion")}
          onClick={() => setSubPanel("about")}
          card
        />
      </div>

      {/* ─── Personal Sub-Panel ─────────────────────────────── */}
      <DynamicUIElement open={subPanel === "personal"} onOpenChange={(open) => !open && setSubPanel(null)}>
        <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("settings.personalSettings")}>{t("settings.personalSettings")}</DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">{t("settings.personalSettingsMeta")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="border-b border-border px-[18px] py-4">
            <div className="flex items-center gap-3.5">
              <div className="relative shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={t("settings.avatar")} className="h-14 w-14 rounded-lg border border-border bg-muted object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-border bg-muted text-lg font-semibold text-muted-foreground">
                    {(personalName || userEmail)?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <label
                  className="absolute -bottom-1 -right-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg border border-border bg-background"
                  title={t("settings.changeAvatar")}
                >
                  {uploadingAvatar ? <Spinner size={12} className="text-muted-foreground" /> : <Camera className="h-3 w-3 text-muted-foreground" />}
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                </label>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{personalName || t("settings.yourName")}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{userEmail || t("settings.emailFallback")}</p>
              </div>
            </div>
          </div>
          <div className="space-y-4 px-[18px] py-4">
            <div className="space-y-1.5">
              <Label htmlFor="personal-name" className="text-xs font-medium text-muted-foreground">
                {t("settings.personalName")}
              </Label>
              <Input
                id="personal-name"
                value={personalName}
                onChange={(e) => setPersonalName(e.target.value)}
                placeholder={t("settings.personalNamePlaceholder")}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="personal-birthday" className="text-xs font-medium text-muted-foreground">
                {t("settings.birthday")}
              </Label>
              <Input
                id="personal-birthday"
                type="date"
                value={personalBirthday}
                onChange={(e) => setPersonalBirthday(e.target.value)}
                className="h-10"
              />
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                {t("settings.personalBirthdayNote")}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="personal-email" className="text-xs font-medium text-muted-foreground">
                {t("settings.personalEmail")}
              </Label>
              <Input
                id="personal-email"
                value={userEmail || t("settings.emailFallback")}
                disabled
                className="h-10 font-mono text-xs"
              />
            </div>
            <Button
              type="button"
              onClick={handleSavePersonalSettings}
              disabled={savingPersonal || !personalName.trim()}
              className="h-10 w-full"
            >
              {savingPersonal ? <Spinner size={14} /> : t("settings.savePersonal")}
            </Button>
          </div>
          <div>
            <SRow
              icon={<Clock className="h-4 w-4 text-foreground" />}
              title={t("settings.scheduleRules")}
              meta={t("settings.availabilityAndTimeOff")}
              onClick={() => setAvailDialog(true)}
              isFirst
            />
            <SRow
              icon={<KeyRound className="h-4 w-4 text-foreground" />}
              title={t("settings.punchInCode")}
              meta={myCode ? t("settings.codeSet") : t("settings.punchCodeOnTeamPage")}
              onClick={() => router.push("/manager/personnel/team")}
              right={myCode ? <SBadge tone="ok">{t("settings.setBadge")}</SBadge> : undefined}
            />
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Workspace Sub-Panel ─────────────────────────────── */}
      <DynamicUIElement open={subPanel === "workspace"} onOpenChange={(open) => !open && setSubPanel(null)}>
        <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("settings.groupWorkspace")}>{t("settings.groupWorkspace")}</DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">{t("settings.groupWorkspace")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div>
            <SRow
              icon={<Building2 className="h-4 w-4 text-foreground" />}
              title={t("settings.businessProfile")}
              meta={businessName || t("settings.notSet")}
              right={<span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">{timezone}</span>}
              isFirst
            />
            <SRow
              icon={<Clock className="h-4 w-4 text-foreground" />}
              title={t("hours.title")}
              meta={hoursMetaLabel ?? t("settings.notSet")}
              onClick={() => setHoursDialog(true)}
            />
            <SRow
              icon={<MapPin className="h-4 w-4 text-foreground" />}
              title={t("settings.locations")}
              meta={t("settings.manageLocations")}
              onClick={() => setLocationsDialog(true)}
              right={<SBadge>{String(orgLocationCount)}</SBadge>}
            />
            <SRow
              icon={<Activity className="h-4 w-4 text-foreground" />}
              title={t("settings.forecastLocation")}
              meta={locationLatitude && locationLongitude ? `${locationLatitude}, ${locationLongitude}` : t("settings.notSet")}
              right={<span className="text-xs text-muted-foreground font-mono truncate max-w-[100px]">{googlePlacesId ? googlePlacesId.slice(0, 12) + "..." : t("settings.noPlaceId")}</span>}
            />
            <SRow
              icon={<CreditCard className="h-4 w-4 text-foreground" />}
              title={t("settings.billing")}
              meta={t("settings.currentSubscription")}
              right={<SBadge tone="ok">{t("settings.active")}</SBadge>}
              onClick={() => router.push("/manager/settings/billing")}
            />
            <SRow
              icon={<FileText className="h-4 w-4 text-foreground" />}
              title={t("settings.taxCompliance")}
              meta={`${t("settings.taxPrefix")} ${paymentTaxRate}% · ${paymentCurrency}`}
              right={<span className="text-xs text-muted-foreground font-mono tabular-nums">{paymentTaxRate}%</span>}
            />
            {/* Owners and managers only. The org's currency re-denominates
                every price, total and report for everyone, and the
                updateSettings reducer only checks `settings.view`, which
                defaultPermissions() grants to every staff member — so an
                unguarded tap here was a one-click org-wide change by a
                cashier. Read-only for everyone else. */}
            <SRow
              icon={<Coins className="h-4 w-4 text-foreground" />}
              title={t("settings.currency")}
              meta={t(getCurrencyInfo(paymentCurrency).labelKey)}
              onClick={isAdmin ? () => setCurrencyDialog(true) : undefined}
              right={<span className="text-xs text-muted-foreground font-mono tabular-nums">{getCurrencyInfo(paymentCurrency).symbol} {paymentCurrency}</span>}
            />
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Team & Access Sub-Panel ─────────────────────────── */}
      {/* ─── Integrations Sub-Panel ─────────────────────────── */}
      <DynamicUIElement open={subPanel === "integrations"} onOpenChange={(open) => !open && setSubPanel(null)}>
        <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("settings.apiIntegrations")}>{t("settings.apiIntegrations")}</DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">{t("settings.apiIntegrations")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div>
            <SGroupHeader label={t("settings.supplierInbox")} />
            <div className="px-[18px] py-3.5 space-y-3">
              <div className="flex items-start gap-3">
                <IconTile><Mail className="h-4 w-4 text-foreground" /></IconTile>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{t("settings.fixedSupplierEmail")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("settings.fixedSupplierEmailMeta")}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded border border-border bg-muted/30 px-2.5 py-2">
                <span className="font-mono text-[12px] text-foreground truncate flex-1">{supplierInboxAddress}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2"
                  onClick={async () => {
                    if (!supplierInboxAddress) return;
                    await navigator.clipboard?.writeText(supplierInboxAddress);
                    toast.success(t("settings.copied"));
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={supplierInboxPrefixInput}
                    onChange={(e) => setSupplierInboxPrefixInput(normalizeSupplierInboundPrefix(e.target.value))}
                    placeholder={t("settings.supplierInboxPrefixPlaceholder")}
                    className="h-9 pr-[92px] font-mono text-[13px]"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-mono text-muted-foreground">
                    -inbound
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-9"
                  onClick={handleSaveSupplierInboxPrefix}
                  disabled={savingSupplierInboxPrefix}
                >
                  {savingSupplierInboxPrefix ? <Spinner size={14} /> : t("settings.save")}
                </Button>
              </div>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                {t("settings.supplierInboxHelp")}
              </p>
            </div>

            <SGroupHeader label={t("settings.posSystems")} />
            <SRow
              icon={<Zap className="h-4 w-4 text-foreground" />}
              title={t("settings.square")}
              meta={settings?.squareConnected ? t("settings.squareConnectedShort") : t("settings.connectPOS")}
              onClick={() => {
                if (settings?.squareConnected) { handleSquareSync(); }
                else { window.location.href = "/api/square/oauth/authorize"; }
              }}
              right={
                squareSyncing
                  ? <Spinner size={14} />
                  : settings?.squareConnected
                    ? <SBadge tone="ok">{t("settings.connected")}</SBadge>
                    : undefined
              }
              isFirst
            />
            {squareSyncResult && (
              <div className="px-[18px] pb-3 -mt-1 text-[11.5px] text-muted-foreground">{squareSyncResult}</div>
            )}
            <SRow
              icon={<Zap className="h-4 w-4 text-foreground" />}
              title={t("settings.clover")}
              meta={settings?.cloverConnected ? t("settings.cloverConnectedShort") : t("settings.connectPOS")}
              onClick={() => {
                if (settings?.cloverConnected) { handleCloverSync(); }
                else { window.location.href = "/api/clover/connect"; }
              }}
              right={
                cloverSyncing
                  ? <Spinner size={14} />
                  : settings?.cloverConnected
                    ? <SBadge tone="ok">{t("settings.connected")}</SBadge>
                    : undefined
              }
            />
            {cloverSyncResult && (
              <div className="px-[18px] pb-3 -mt-1 text-[11.5px] text-muted-foreground">{cloverSyncResult}</div>
            )}

            <SGroupHeader label={t("settings.scheduleSoftware")} />
            <div className="px-[18px] py-3.5 space-y-2">
              {SCHEDULE_PROVIDERS.map((provider) => {
                const selected = selectedScheduleProvider === provider.id;
                const connected = scheduleConnected && connectedScheduleProvider === provider.id;
                const builtInActive = provider.id === "built_in" && configuredScheduleProvider === "built_in";
                return (
                  <OptionRow
                    key={provider.id}
                    selected={selected}
                    onSelect={() => setSelectedScheduleProvider(provider.id)}
                    className="py-2.5"
                    leading={<Calendar className="h-4 w-4 text-foreground shrink-0" />}
                    title={
                      <span className="inline-flex items-center gap-2">
                        {provider.label}
                        {builtInActive && <SBadge tone="ok">{t("settings.active")}</SBadge>}
                        {connected && <SBadge tone="ok">{t("settings.connected")}</SBadge>}
                        {provider.status !== "available" && <SBadge tone="warn">{t("settings.comingSoon")}</SBadge>}
                      </span>
                    }
                    description={<span className="leading-relaxed">{provider.description}</span>}
                  />
                );
              })}
              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  onClick={scheduleConnected ? handleScheduleSync : handleConnectSchedule}
                  disabled={scheduleSyncing}
                >
                  {scheduleSyncing ? (
                    <Spinner size={14} />
                  ) : selectedScheduleProvider === "built_in" ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                      {t("settings.useBuiltInSchedule")}
                    </>
                  ) : scheduleConnected ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      {t("settings.syncSchedule")}
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      {t("settings.connectSchedule")}
                    </>
                  )}
                </Button>
                {scheduleConnected && selectedScheduleProvider !== "built_in" && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleDisconnectSchedule}
                  >
                    <Unlink className="h-3.5 w-3.5 mr-1.5" />
                    {t("settings.disconnect")}
                  </Button>
                )}
              </div>
              {(scheduleSyncResult || scheduleSettings?.scheduleLastSyncSummary) && (
                <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                  {scheduleSyncResult || scheduleSettings?.scheduleLastSyncSummary}
                </p>
              )}
              {scheduleConnected && (
                <p className="text-[10.5px] font-mono text-muted-foreground">
                  {connectedScheduleLabel}
                  {scheduleSettings?.scheduleCompanyId ? ` · ${t("settings.companyIdPrefix").replace("{id}", scheduleSettings.scheduleCompanyId)}` : ""}
                </p>
              )}
            </div>

            <div className="px-[18px] py-3.5 border-t border-border">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center"
                onClick={handleSyncConnectedSystems}
                disabled={syncingConnectedSystems || squareSyncing || cloverSyncing || scheduleSyncing}
              >
                {syncingConnectedSystems ? <Spinner size={14} /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                {t("settings.syncConnectedSystems")}
              </Button>
            </div>
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Notifications Sub-Panel ─────────────────────────── */}
      <DynamicUIElement open={subPanel === "ai"} onOpenChange={(open) => !open && setSubPanel(null)}>
        <DynamicUIElementContent>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("settings.merchivaAi")}>{t("settings.merchivaAi")}</DynamicUIElementTitle>
            <DynamicUIElementDescription>{t("settings.merchivaAiMeta")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <SGroupHeader label={t("settings.aiPermissionLevel")} />
              {[
                { key: "off", title: t("settings.aiApprovalRequired"), meta: t("settings.aiApprovalRequiredMeta") },
                { key: "partial", title: t("settings.aiPartialAuto"), meta: t("settings.aiPartialAutoMeta") },
                { key: "full", title: t("settings.aiFullAuto"), meta: t("settings.aiFullAutoMeta") },
              ].map((option) => (
                <OptionRow
                  key={option.key}
                  selected={assistantPermissionMode === option.key}
                  disabled={assistantSaving}
                  onSelect={() => saveAssistantMode(option.key as "off" | "partial" | "full")}
                  icon={Bot}
                  title={option.title}
                  description={option.meta}
                />
              ))}
            </div>
            <div className="space-y-2">
              <SGroupHeader label={t("settings.weeklyRestock")} />
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-3">
                  <IconTile><ShoppingCart className="h-4 w-4 text-foreground" /></IconTile>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{t("settings.weeklyRestockTime")}</p>
                    <p className="text-xs text-muted-foreground">{t("settings.weeklyRestockTimeMeta")}</p>
                  </div>
                  <Input
                    type="time"
                    value={weeklyRestockTime}
                    onChange={(e) => saveWeeklyRestockTime(e.target.value)}
                    className="w-[116px]"
                  />
                </div>
              </div>
            </div>
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      <NotificationsPanel open={subPanel === "notifications"} onOpenChange={(open) => !open && setSubPanel(null)} />

      {/* ─── AI Usage Sub-Panel ──────────────────────────────── */}
      <DynamicUIElement open={subPanel === "usage"} onOpenChange={(open) => !open && setSubPanel(null)}>
        <DynamicUIElementContent className="max-w-md lg:max-w-2xl" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("usage.title")}>{t("usage.title")}</DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">{t("usage.subtitle")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <UsageSection />
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Preferences Sub-Panel ───────────────────────────── */}
      <PreferencesPanel open={subPanel === "preferences"} onOpenChange={(open) => !open && setSubPanel(null)} />

      {/* ─── Device Sub-Panel ────────────────────────────────── */}
      <DynamicUIElement open={subPanel === "device"} onOpenChange={(open) => !open && setSubPanel(null)}>
        <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("settings.groupDevice")}>{t("settings.groupDevice")}</DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">{t("settings.groupDevice")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div>
            <SToggleRow
              icon={<StoreModeIcon className="h-5 w-5" />}
              title={t("settings.storeMachineMode")}
              meta={t("settings.restrictToStoreApps")}
              checked={storeMachine}
              onChange={() => {
                if (storeMachine) {
                  setExitPinInput(""); setExitPinError("");
                  setExitPinDialog(true);
                  return;
                }
                // Enabling store-machine mode without a personal punch-in code
                // would lock the current user out of their own device — the
                // unlock screen only accepts a member's PIN. Ask for it first.
                if (!myCode) {
                  toast.info(t("settings.storeMachineNeedsPin"));
                  router.push("/manager/personnel/team");
                  return;
                }
                if (!deviceName) {
                  setDeviceNameInput("");
                  setDeviceNameDialog(true);
                  return;
                }
                setStoreMachine(true);
                registerStoreDevice(getOrCreateDeviceId(), deviceName).catch(console.error);
              }}
              isFirst
            />
            <SRow
              icon={<StoreModeIcon className="h-5 w-5" />}
              title={t("settings.deviceName")}
              meta={deviceName || t("settings.notSet")}
              onClick={() => { setDeviceNameInput(deviceName); setDeviceNameDialog(true); }}
              right={deviceName ? <span className="text-xs text-muted-foreground font-mono truncate max-w-[100px]">{deviceName}</span> : undefined}
            />
            {storeMachine && (
              <SRow
                icon={<Clock className="h-4 w-4 text-foreground" />}
                title={t("lock.autolockTitle")}
                meta={autolockSeconds === 0 ? t("lock.never") : t("lock.autolockMetaPrefix").replace("{label}", autolockLabel(autolockSeconds))}
                onClick={() => setAutolockDialog(true)}
                right={<span className="text-xs text-muted-foreground font-mono tabular-nums">{autolockSeconds === 0 ? "—" : autolockLabel(autolockSeconds)}</span>}
              />
            )}
            {isAdmin && orgDevices.length > 0 && (
              <>
                <SGroupHeader label={t("settings.storeDevices")} />
                {orgDevices.map((device, i) => (
                  <SRow
                    key={device.id.toString()}
                    icon={<StoreModeIcon className="h-5 w-5" />}
                    title={device.name || t("settings.unnamedDevice")}
                    meta={device.deviceId.slice(0, 8)}
                    isFirst={i === 0}
                    right={device.enabled ? <SBadge tone="ok">{t("settings.active")}</SBadge> : <SBadge>{t("settings.deviceOff")}</SBadge>}
                    onClick={() => {
                      setManageDeviceTarget(device);
                      setManageDeviceNameInput(device.name);
                      setManageDeviceDialog(true);
                    }}
                  />
                ))}
              </>
            )}
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Data Sub-Panel ──────────────────────────────────── */}
      <DataPanel open={subPanel === "data"} onOpenChange={(open) => !open && setSubPanel(null)} />

      {/* ─── About Sub-Panel ─────────────────────────────────── */}
      <AboutPanel open={subPanel === "about"} onOpenChange={(open) => !open && setSubPanel(null)} />

      {/* ─── Multi-Store Sub-Panel ───────────────────────────── */}
      <StoreProfilePanel open={subPanel === "storeprofile"} onOpenChange={(open) => !open && setSubPanel(null)} />

      {/* ─── Security Sub-Panel ──────────────────────────────── */}
      <SecurityPanel open={subPanel === "security"} onOpenChange={(open) => !open && setSubPanel(null)} />

      {/* ─── Sign Out Button ────────────────────────────────── */}
      <div className="px-[18px] py-5">
        <Button variant="destructive" size="lg" className="h-11 w-full gap-2" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          {t("settings.signOut")}
        </Button>
      </div>
    </div>

    {renderDialogs()}
    </>
  );
}
