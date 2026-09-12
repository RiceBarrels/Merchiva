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
  ChevronRight,
  ChevronDown,
  Clock,
  Users,
  Star,
  UserPlus,
  CreditCard,
  MonitorSmartphone,
  KeyRound,
  Phone,
  ArrowLeft,
  Building2,
  Calendar,
  Globe,
  PanelLeft,
  AlignHorizontalDistributeCenter,
  LogOut,
  Shield,
  Bell,
  Package,
  Search,
  FileText,
  HelpCircle,
  Moon,
  Languages,
  Download,
  Activity,
  Info,
  SettingsIcon,
  UserCog,
  Fingerprint,
  Sparkles,
  Plus,
  Coins,
  Loader2,
  Palette,
  Bot,
  ShoppingCart,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconTile } from "@/components/ui/icon-tile";
import { OptionRow } from "@/components/ui/option-row";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  upsertSettings,
  disconnectSquare,
  disconnectClover,
  setPunchInCode,
  updateOpeningHours,
  createOrg,
  setScheduleIntegration,
  disconnectScheduleIntegration,
  setSupplierInboundPrefix,
  updateDisplayName,
  updateProfile,
  updateOrgLogo,
} from "@/lib/spacetimedb/actions";
import { StoreLogo } from "@/components/store-picker";
import { CURRENCIES, getCurrencyInfo } from "@/lib/currency";
import { parseOpeningHours, type WeeklyHours, type DayKey } from "@/lib/holidays";
import { useTable, useSpacetimeDB } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { getSettings, type UserSettings } from "@/lib/db/settings";
import { useAssistantConfig, useSettings } from "@/lib/spacetimedb/hooks/useSettings";
import { useBetaFeatures } from "@/lib/spacetimedb/hooks/useBetaFeatures";
import { usePushNotifications } from "@/lib/spacetimedb/hooks/usePushNotifications";
import { tauriNotificationsPref, requestTauriNotificationPermission } from "@/lib/spacetimedb/hooks/useTauriNotifications";
import { useIsNativeShell } from "@/lib/native-shell";
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
import { MorningBriefingSettings } from "@/components/settings/morning-briefing-settings";
import { UsageSection } from "@/components/settings/usage-section";
import { getCached, setCache, clearCache } from "@/lib/cache";
import { getMyAvailability, getTimeOffRequests } from "@/lib/db/availability";
import { upsertAvailability, createTimeOffRequest, updateMember, removeMember, cancelInvitation, inviteToOrg } from "@/lib/spacetimedb/actions";
import { getTeamMembers, getInvitations } from "@/lib/db/team";
import type { OrgMember, OrgInvitation, OrgRole, Permissions } from "@/lib/types";
import { defaultPermissions } from "@/lib/db/team";
import {
  EditMemberDialog,
  type EditMemberInput,
} from "@/components/personnel/team-dialogs";
import { usePermissions } from "@/lib/context/permissions";
import { hapticSuccess, hapticMedium } from "@/lib/haptics";
import { useAuth } from "@/lib/auth/context";
import { useStoreMachineMode, useDeviceName, getOrCreateDeviceId } from "@/lib/store-machine-mode";
import { useAutolockSeconds, AUTOLOCK_OPTIONS, type AutolockSeconds } from "@/lib/store-device-lock";
import { registerStoreDevice, removeStoreDevice, updateStoreDevice } from "@/lib/spacetimedb/actions";
import { useNavMode, type NavMode } from "@/lib/nav-mode";
import { uploadFiles } from "@/lib/uploadthing";
import { toast } from "sonner";
import { useT, useI18n } from "@/lib/i18n/context";
import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n/config";
import { useThemeMode, type ThemeMode } from "@/lib/theme";
import { BETA_FEATURES } from "@/lib/beta-features";
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
  const { locale, setLocale } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { role, organizationId, can, organizations, currentOrg, switchOrg, shareGroupOrgs: msShareGroupOrgs, isSubStore: msIsSubStore } = usePermissions();
  const { signOut, user: authUser, accounts, switchAccount } = useAuth();
  const isAdmin = role === "owner" || role === "manager";
  const canEditTeam = can("team", "edit");
  // Settings data via SpacetimeDB migration hook
  const { settings, setSettings, loading } = useSettings();
  const { config: assistantConfig, save: saveAssistantConfig } = useAssistantConfig();
  const { betaFeatures, savingKey: savingBetaFeature, setFeature: setBetaFeature } = useBetaFeatures();
  // Fallback: the organization's own name, for orgs whose settings.businessName was never set
  const [orgRows] = useTable(tables.organization);
  const orgName = (orgRows || []).find((o) => o.id.toString() === organizationId)?.name ?? "";
  const storeLogoUrl = (orgRows || []).find((o) => o.id.toString() === organizationId)?.logoUrl ?? null;
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
  const [betaFeaturesDialog, setBetaFeaturesDialog] = useState(false);
  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingStoreLogo, setUploadingStoreLogo] = useState(false);
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
  const [drawerParentId, setDrawerParentId] = useState<string | null>(null);
  const [drawerCreateLoading, setDrawerCreateLoading] = useState(false);
  const [drawerCreateError, setDrawerCreateError] = useState<string | null>(null);
  const closeSwitcherCreate = () => {
    setDrawerCreating(false);
    setDrawerStoreName("");
    setDrawerParentId(null);
    setDrawerCreateError(null);
  };
  const handleDrawerCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = drawerStoreName.trim();
    if (!name) return;
    setDrawerCreateLoading(true);
    setDrawerCreateError(null);
    try {
      await createOrg(name, drawerParentId);
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

  // Team dialog
  const [teamDialog, setTeamDialog] = useState(false);
  const [teamMembers, setTeamMembers] = useState<OrgMember[]>([]);
  const [teamInvitations, setTeamInvitations] = useState<OrgInvitation[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [inviteDialog, setInviteDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState<"staff" | "manager">("staff");
  const [invitePerms, setInvitePerms] = useState<Permissions>(defaultPermissions());
  const [inviting, setInviting] = useState(false);

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
  const [navMode, setNavMode] = useNavMode();

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

  // Punch-in code reset dialog (managers/team.edit resetting another member's code)
  const [resetCodeMember, setResetCodeMember] = useState<OrgMember | null>(null);
  const [resetCodeInput, setResetCodeInput] = useState("");
  const [resettingCode, setResettingCode] = useState(false);
  const [editingMember, setEditingMember] = useState<EditMemberInput | null>(null);

  const [langDialogOpen, setLangDialogOpen] = useState(false);
  const [locationsDialog, setLocationsDialog] = useState(false);
  const [locationRows] = useLocations();

  // My own punch-in code dialog
  const [myCodeDialog, setMyCodeDialog] = useState(false);
  const [myCodeInput, setMyCodeInput] = useState("");
  const [savingMyCode, setSavingMyCode] = useState(false);
  const stdb = useSpacetimeDB();
  const identityString = stdb?.identity?.toString() ?? null;
  const [memberRows] = useTable(tables.orgMember);
  const [userRows] = useTable(tables.user);
  const myMember = (memberRows as unknown as Array<{
    id: { toString(): string };
    userId: { toString(): string };
    organizationId: string;
    status: string;
    punchInCode?: string;
  }>).find(
    (m) =>
      identityString &&
      m.userId.toString() === identityString &&
      m.organizationId === organizationId &&
      m.status === "active",
  );
  const myCode = typeof myMember?.punchInCode === "string" && myMember.punchInCode.length > 0
    ? myMember.punchInCode
    : null;

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

    import("@/lib/db/payments").then(({ getPaymentConfig }) => {
      getPaymentConfig()
        .then(({ taxRate, currency }) => {
          setPaymentTaxRate(String(taxRate));
          setPaymentCurrency(currency);
        })
        .catch(() => {});
    });
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
      "Team": () => setTeamDialog(true),
      "Invite": () => setInviteDialog(true),
      "Punch-in code": () => { setMyCodeInput(""); setMyCodeDialog(true); },
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

  // Persist payment-related settings (tax rate + currency) through the
  // updateSettings reducer. All reducer-required fields are passed so the
  // delete+insert in the reducer never clobbers existing values.
  const persistPaymentSettings = async (next: { taxRate?: number; currency?: string }) => {
    if (!userId) return;
    await upsertSettings(userId, {
      businessName: businessName || undefined,
      businessType: settings?.businessType || undefined,
      timezone,
      paymentTaxRate: next.taxRate ?? (parseFloat(paymentTaxRate) || 0),
      paymentCurrency: next.currency ?? paymentCurrency ?? "USD",
      locationLatitude: locationLatitude || undefined,
      locationLongitude: locationLongitude || undefined,
      googlePlacesId: googlePlacesId || undefined,
    });
  };

  const handleSavePaymentSettings = async () => {
    if (!userId) return;
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

  const handleStoreLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !organizationId) return;

    if (!file.type.startsWith("image/")) {
      toast.error(t("components.imageUpload.unsupportedType"));
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error(t("components.imageUpload.fileTooLarge"));
      return;
    }

    setUploadingStoreLogo(true);
    try {
      const [res] = await uploadFiles("avatar", { files: [file] });
      await updateOrgLogo(organizationId, res.ufsUrl);
      hapticSuccess();
      toast.success(t("settings.storeImageSaved"));
    } catch (err) {
      console.error("Store image upload failed:", err);
      toast.error(t("settings.storeImageFailed"));
    } finally {
      setUploadingStoreLogo(false);
    }
  };

  const handleStoreLogoRemove = async () => {
    if (!organizationId) return;
    setUploadingStoreLogo(true);
    try {
      await updateOrgLogo(organizationId, null);
      hapticSuccess();
      toast.success(t("settings.storeImageSaved"));
    } catch (err) {
      console.error("Store image remove failed:", err);
      toast.error(t("settings.storeImageFailed"));
    } finally {
      setUploadingStoreLogo(false);
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

  const loadTeam = async () => {
    if (!organizationId) return;
    setTeamLoading(true);
    try {
      const [mems, invs] = await Promise.all([
        getTeamMembers(organizationId),
        getInvitations(organizationId),
      ]);
      setTeamMembers(mems);
      setTeamInvitations(invs);
    } catch (err) {
      console.error("Load team failed:", err);
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    if (teamDialog) loadTeam();
  }, [teamDialog]);

  const handleInvite = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    if (!organizationId) return;
    setInviting(true);
    try {
      await inviteToOrg({
        email,
        role: inviteRole,
        permissions: JSON.stringify(invitePerms),
      });

      // Find the freshly-created invitation token and send the email.
      // Retry briefly in case the SpacetimeDB subscription hasn't caught up yet.
      let token: string | null = null;
      for (let attempt = 0; attempt < 10 && !token; attempt++) {
        await new Promise((r) => setTimeout(r, 150));
        const fresh = await getInvitations(organizationId);
        const matches = fresh.filter(
          (inv) => inv.email.toLowerCase() === email.toLowerCase() && !inv.acceptedAt,
        );
        // Prefer the latest-expiring match (later expiresAt = more recently created)
        const match = matches.sort(
          (a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime(),
        )[0];
        if (match) token = match.token;
      }

      if (token) {
        try {
          const res = await fetch("/api/team/send-invite-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: email,
              token,
              orgName: businessName || "your team",
              inviterEmail: userEmail || "a teammate",
              role: inviteRole,
              phone: invitePhone.trim() || undefined,
            }),
          });
          if (!res.ok) {
            const { error } = await res.json().catch(() => ({ error: "email error" }));
            toast.warning(`${t("settings.toastInviteEmailFailedPrefix")} ${error}`);
          } else {
            toast.success(t("settings.toastInvitationSent"));
          }
        } catch (emailErr) {
          console.error("Invite email failed:", emailErr);
          toast.warning(t("settings.toastInviteEmailFailed"));
        }
      } else {
        toast.warning(t("settings.toastInviteNoToken"));
      }

      setInviteDialog(false);
      setInviteEmail("");
      setInvitePhone("");
      setInviteRole("staff");
      setInvitePerms(defaultPermissions());
      loadTeam();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.toastFailedSendInvitation"));
    } finally {
      setInviting(false);
    }
  };

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

  // ─── Notification toggle states (local-only, mobile only) ──────────
  const [shiftReminders, setShiftReminders] = useState(true);
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(false);
  const push = usePushNotifications();
  const isTauri = useIsNativeShell();
  const [tauriPushEnabled, setTauriPushEnabled] = useState(false);
  useEffect(() => {
    if (isTauri) setTauriPushEnabled(tauriNotificationsPref.isEnabled());
  }, [isTauri]);
  const [themeMode, applyThemeMode] = useThemeMode();
  type SubPanel = "workspace" | "personal" | "team" | "integrations" | "ai" | "notifications" | "preferences" | "device" | "data" | "about" | "security" | "usage" | "multistore" | null;
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
  const rootOrg = msShareGroupOrgs.find((o) => !o.parentOrgId) ?? null;
  const subStores = msShareGroupOrgs.filter((o) => !!o.parentOrgId);
  const eligibleParentsForAttach = (orgRows ?? []).filter((o) => !o.parentOrgId && o.id.toString() !== organizationId);
  const [msAttachingTo, setMsAttachingTo] = useState<string>("");
  const [msSaving, setMsSaving] = useState(false);

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

        {/* ─── Team DynamicUIElement ──────────────────────────────────── */}
        <DynamicUIElement open={teamDialog} onOpenChange={setTeamDialog}>
          <DynamicUIElementContent noPadding>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("settings.teamDialogMobileTitle")}>{t("settings.teamDialogTitle")}</DynamicUIElementTitle>
              <DynamicUIElementDescription className="hidden">{t("settings.teamDialogDesc")}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="flex flex-col h-full">
              {teamLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner size={24} className="text-muted-foreground" />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {/* Active members */}
                  <div className="bg-muted/40 px-4 py-2">
                    <Eyebrow>
                      {t("settings.activeLabel")} · {teamMembers.filter((m) => m.status === "active").length}
                    </Eyebrow>
                  </div>
                  <div className="divide-y divide-border">
                    {teamMembers.filter((m) => m.status === "active").map((m) => (
                      <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground shrink-0">
                          {(m.displayName || "?")[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {m.displayName || m.email}
                            {m.userId === userId && <span className="text-xs text-muted-foreground ml-1">{t("settings.youParenthetical")}</span>}
                          </p>
                          {m.email && <p className="text-xs text-muted-foreground truncate">{m.email}</p>}
                        </div>
                        <Badge variant={m.role === "owner" ? "default" : "secondary"} className="text-[10px] capitalize shrink-0">
                          {m.role}
                        </Badge>
                        {canEditTeam && m.userId !== userId && (
                          <Button
                            variant="link"
                            size="xs"
                            className="shrink-0 px-0 text-muted-foreground"
                            onClick={() => { setResetCodeMember(m); setResetCodeInput(""); }}
                          >
                            {t("settings.resetCode")}
                          </Button>
                        )}
                        {canEditTeam && m.role !== "owner" && m.userId !== userId && (
                          <Button
                            variant="link"
                            size="xs"
                            className="shrink-0 px-0 text-muted-foreground"
                            onClick={() => {
                              const role = (m.role === "manager" ? "manager" : "staff") as "staff" | "manager";
                              const perms: Permissions = { ...defaultPermissions(), ...(m.permissions ?? {}) } as Permissions;
                              setEditingMember({
                                id: m.id,
                                displayName: m.displayName || m.email || "",
                                email: m.email || "",
                                role,
                                perms,
                              });
                            }}
                          >
                            {t("settings.edit")}
                          </Button>
                        )}
                        {m.role !== "owner" && m.userId !== userId && (
                          <Button
                            variant="link"
                            size="xs"
                            className="shrink-0 px-0 text-destructive"
                            onClick={async () => {
                              await removeMember(m.id);
                              setTeamMembers((prev) => prev.filter((x) => x.id !== m.id));
                            }}
                          >
                            {t("settings.remove")}
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Pending invitations */}
                  {teamInvitations.length > 0 && (
                    <>
                      <div className="bg-muted/40 px-4 py-2">
                        <Eyebrow>
                          {t("settings.pending")} · {teamInvitations.length}
                        </Eyebrow>
                      </div>
                      <div className="divide-y divide-border">
                        {teamInvitations.map((inv) => (
                          <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="relative h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm text-muted-foreground shrink-0">
                              @
                              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-amber-500 border-2 border-background flex items-center justify-center">
                                <Clock className="h-2 w-2 text-white" strokeWidth={3} />
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{inv.email}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <StatusBadge tone="warning" size="xs" className="gap-1">
                                  <Clock className="h-2.5 w-2.5" />
                                  {t("settings.pendingAcceptance")}
                                </StatusBadge>
                                <span className="text-[11px] text-muted-foreground">
                                  {t("settings.expiresOn")} {new Date(inv.expiresAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{inv.role}</Badge>
                            <Button
                              variant="link"
                              size="xs"
                              className="shrink-0 px-0 text-foreground"
                              onClick={async () => {
                                try {
                                  const res = await fetch("/api/team/send-invite-email", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      to: inv.email,
                                      token: inv.token,
                                      orgName: businessName || "your team",
                                      inviterEmail: userEmail || "a teammate",
                                      role: inv.role,
                                    }),
                                  });
                                  if (res.ok) {
                                    hapticSuccess();
                                    toast.success(t("settings.toastInvitationSent"));
                                  } else {
                                    toast.error(t("settings.toastInviteEmailFailedPrefix"));
                                  }
                                } catch {
                                  toast.error(t("settings.toastInviteEmailFailedPrefix"));
                                }
                              }}
                            >
                              {t("settings.resend")}
                            </Button>
                            <Button
                              variant="link"
                              size="xs"
                              className="shrink-0 px-0 text-destructive"
                              onClick={async () => {
                                await cancelInvitation(inv.id);
                                setTeamInvitations((prev) => prev.filter((x) => x.id !== inv.id));
                              }}
                            >
                              {t("settings.cancel")}
                            </Button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Invite button */}
                  <div className="p-4">
                    <Button
                      onClick={() => setInviteDialog(true)}
                      variant="outline"
                      className="w-full gap-2"
                    >
                      <UserPlus className="h-4 w-4" /> {t("settings.inviteMember")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>

        {/* ─── Invite Member DynamicUIElement ─────────────────────────── */}
        <DynamicUIElement open={inviteDialog} onOpenChange={setInviteDialog}>
          <DynamicUIElementContent>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("settings.inviteDialogMobileTitle")}>{t("settings.inviteDialogTitle")}</DynamicUIElementTitle>
              <DynamicUIElementDescription>{t("settings.inviteDialogDesc")}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("settings.email")}</Label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t("settings.colleagueEmailPlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("settings.phoneOptional")}</Label>
                <div className="relative">
                  <Phone className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    placeholder={t("settings.phonePlaceholder")}
                    className="pl-9"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {t("settings.phoneInviteHint")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>{t("settings.role")}</Label>
                <SegmentedControl
                  fullWidth
                  aria-label={t("settings.role")}
                  value={inviteRole}
                  onChange={setInviteRole}
                  options={(["staff", "manager"] as const).map((r) => ({ value: r, label: <span className="capitalize">{t(r === "staff" ? "settings.roleStaff" : "settings.roleManager")}</span> }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("settings.permissions")}</Label>
                <div className="space-y-0.5">
                  {([
                    { key: "dashboard" as const, label: t("settings.permDashboard"), actions: ["view"] as const },
                    { key: "inventory" as const, label: t("settings.permInventory"), actions: ["view", "edit"] as const },
                    { key: "sales" as const, label: t("settings.permSales"), actions: ["view"] as const },
                    { key: "staffing" as const, label: t("settings.permStaffing"), actions: ["view", "edit"] as const },
                    { key: "products" as const, label: t("settings.permProducts"), actions: ["view", "edit"] as const },
                    { key: "pos" as const, label: t("settings.permPOS"), actions: ["view"] as const },
                    { key: "settings" as const, label: t("settings.permSettings"), actions: ["view"] as const },
                    { key: "team" as const, label: t("settings.permTeam"), actions: ["view", "invite", "edit"] as const },
                    { key: "website" as const, label: t("settings.permWebsite"), actions: ["view", "edit"] as const },
                    { key: "training_grading" as const, label: t("settings.permTrainingGrading"), actions: ["view", "edit"] as const },
                    { key: "merchiva" as const, label: t("settings.permMerchiva"), actions: ["view"] as const },
                  ]).map(({ key, label, actions }) => (
                    <div key={key} className="flex items-center gap-3 px-1 py-1.5 rounded hover:bg-muted/50">
                      <span className="text-sm flex-1">{label}</span>
                      {actions.map((action) => (
                        <Label key={action} className="cursor-pointer gap-1 text-xs font-normal capitalize text-muted-foreground">
                          <Checkbox
                            checked={invitePerms[key]?.[action] === true}
                            onCheckedChange={() => {
                              const sec: { view: boolean; edit?: boolean; invite?: boolean } = { ...invitePerms[key] };
                              sec[action] = !sec[action];
                              if (action === "view" && !sec.view) { sec.edit = false; sec.invite = false; }
                              if ((action === "edit" || action === "invite") && sec[action]) sec.view = true;
                              setInvitePerms({ ...invitePerms, [key]: sec });
                            }}
                            className="size-3.5"
                          />
                          {t(action === "view" ? "settings.actionView" : action === "edit" ? "settings.actionEdit" : "settings.actionInvite")}
                        </Label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="w-full">
                {inviting ? <Spinner size={16} /> : t("settings.sendInvitation")}
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
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const match = (memberRows as unknown as any[]).find(
                        (m) => m.organizationId === organizationId && m.status === "active" && m.punchInCode === exitPinInput && (m.role === "owner" || m.role === "manager"),
                      );
                      if (!match) { setExitPinError(t("settings.exitPinInvalid")); return; }
                      setStoreMachine(false);
                      updateStoreDevice(getOrCreateDeviceId(), { enabled: false }).catch(console.error);
                      setExitPinDialog(false);
                      hapticSuccess();
                      toast.success(t("settings.toastStoreModeDisabled"));
                    }
                  }}
                />
                {exitPinError && <p className="text-xs text-destructive mt-1">{exitPinError}</p>}
              </div>
              <Button
                onClick={() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const match = (memberRows as unknown as any[]).find(
                    (m) => m.organizationId === organizationId && m.status === "active" && m.punchInCode === exitPinInput && (m.role === "owner" || m.role === "manager"),
                  );
                  if (!match) { setExitPinError(t("settings.exitPinInvalidRole")); return; }
                  setStoreMachine(false);
                  updateStoreDevice(getOrCreateDeviceId(), { enabled: false }).catch(console.error);
                  setExitPinDialog(false);
                  hapticSuccess();
                  toast.success(t("settings.toastStoreModeDisabled"));
                }}
                disabled={exitPinInput.length !== 4}
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

        {/* ─── My Punch-in Code DynamicUIElement ─────────────────────────── */}
        <DynamicUIElement open={myCodeDialog} onOpenChange={setMyCodeDialog}>
          <DynamicUIElementContent>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("settings.punchInCodeMobileTitle")}>
                {myCode ? t("settings.changePunchCode") : t("settings.setPunchCode")}
              </DynamicUIElementTitle>
              <DynamicUIElementDescription>
                {myCode
                  ? t("settings.updatePunchCodeDesc")
                  : t("settings.setPunchCodeDesc")}
              </DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("settings.newCode")}</Label>
                <Input
                  value={myCodeInput}
                  onChange={(e) => setMyCodeInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  placeholder={t("settings.fourDigitsPlaceholder")}
                  className="h-11 font-mono text-base tracking-[0.3em]"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    if (!myMember) { toast.error(t("settings.toastNotMemberOfStore")); return; }
                    if (!/^[0-9]{4}$/.test(myCodeInput)) { toast.error(t("settings.toastCodeMustBe4")); return; }
                    setSavingMyCode(true);
                    try {
                      await setPunchInCode(myMember.id.toString(), myCodeInput);
                      hapticSuccess();
                      toast.success(t("settings.toastCodeSaved"));
                      setMyCodeDialog(false);
                      setMyCodeInput("");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : t("settings.toastFailedSaveCode"));
                    } finally {
                      setSavingMyCode(false);
                    }
                  }}
                  disabled={savingMyCode || myCodeInput.length < 4}
                  className="flex-1"
                >
                  {savingMyCode ? <Spinner size={16} /> : t("settings.save")}
                </Button>
                {myCode && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!myMember) return;
                      setSavingMyCode(true);
                      try {
                        await setPunchInCode(myMember.id.toString(), null);
                        toast.success(t("settings.toastCodeCleared"));
                        setMyCodeDialog(false);
                        setMyCodeInput("");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : t("settings.toastFailedClearCode"));
                      } finally {
                        setSavingMyCode(false);
                      }
                    }}
                    disabled={savingMyCode}
                  >
                    {t("settings.clear")}
                  </Button>
                )}
              </div>
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>

        {/* ─── Beta Features DynamicUIElement ────────────────────────────── */}
        <DynamicUIElement open={betaFeaturesDialog} onOpenChange={setBetaFeaturesDialog}>
          <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("settings.betaFeaturesMobileTitle")}>{t("settings.betaFeaturesTitle")}</DynamicUIElementTitle>
              <DynamicUIElementDescription>{t("settings.betaFeaturesDesc")}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div>
              {BETA_FEATURES.map((feature, index) => {
                const Icon =
                  feature.key === "pos" ? MonitorSmartphone :
                  feature.key === "website" ? Globe :
                  Palette;
                return (
                  <SToggleRow
                    key={feature.key}
                    icon={<Icon className="h-4 w-4 text-foreground" />}
                    title={t(feature.labelKey)}
                    meta={t(feature.descriptionKey)}
                    checked={betaFeatures[feature.key]}
                    disabled={savingBetaFeature === feature.key}
                    isFirst={index === 0}
                    onChange={() => {
                      void setBetaFeature(feature.key, !betaFeatures[feature.key])
                        .then(() => toast.success(t("settings.toastBetaFeaturesSaved")))
                        .catch((err) => {
                          toast.error(err instanceof Error ? err.message : t("settings.toastSaveFailed"));
                        });
                    }}
                  />
                );
              })}
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>
        {/* ─── Edit Member (role + permissions) ──────────────────────────── */}
        <EditMemberDialog
          member={editingMember}
          onClose={() => {
            setEditingMember(null);
            // refresh team list so updated role/permissions are visible
            loadTeam();
          }}
        />

        {/* ─── Reset Punch-in Code DynamicUIElement ──────────────────────── */}
        <DynamicUIElement open={!!resetCodeMember} onOpenChange={(o) => { if (!o) setResetCodeMember(null); }}>
          <DynamicUIElementContent>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("settings.resetCodeMobileTitle")}>{t("settings.resetPunchCodeTitle")}</DynamicUIElementTitle>
              <DynamicUIElementDescription>
                {resetCodeMember?.displayName || resetCodeMember?.email
                  ? <>{t("settings.setNewCodeFor")} <span className="font-medium">{resetCodeMember.displayName || resetCodeMember.email}</span>{t("settings.setNewCodePeriod")}</>
                  : t("settings.setNewCode")}
              </DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("settings.newCodeFourDigitsLabel")}</Label>
                <Input
                  value={resetCodeInput}
                  onChange={(e) => setResetCodeInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  placeholder={t("settings.codeDigitsExample")}
                  className="h-11 font-mono text-base tracking-[0.3em]"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    if (!resetCodeMember) return;
                    if (!/^[0-9]{4}$/.test(resetCodeInput)) {
                      toast.error(t("settings.toastCodeMustBe4"));
                      return;
                    }
                    setResettingCode(true);
                    try {
                      await setPunchInCode(resetCodeMember.id, resetCodeInput);
                      toast.success(t("settings.toastCodeReset"));
                      setResetCodeMember(null);
                      setResetCodeInput("");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : t("settings.toastFailedResetCode"));
                    } finally {
                      setResettingCode(false);
                    }
                  }}
                  disabled={resettingCode || resetCodeInput.length < 4}
                  className="flex-1"
                >
                  {resettingCode ? <Spinner size={16} /> : t("settings.save")}
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!resetCodeMember) return;
                    setResettingCode(true);
                    try {
                      await setPunchInCode(resetCodeMember.id, null);
                      toast.success(t("settings.toastCodeCleared"));
                      setResetCodeMember(null);
                      setResetCodeInput("");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : t("settings.toastFailedClearCode"));
                    } finally {
                      setResettingCode(false);
                    }
                  }}
                  disabled={resettingCode}
                >
                  {t("settings.clear")}
                </Button>
              </div>
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

  // ─── Helper: SRow ──────────────────────────────────────────────
  const SRow = ({
    icon,
    title,
    meta,
    right,
    onClick,
    isFirst,
    card,
  }: {
    icon: React.ReactNode;
    title: string;
    meta?: string;
    right?: React.ReactNode;
    onClick?: () => void;
    isFirst?: boolean;
    isCard?: boolean;
    card?: boolean;
  }) => {
    const Wrapper = onClick ? "button" : "div";
    // Mobile: list rows separated by border-t. lg + card: each row is a standalone bordered card.
    const baseBorder = `${isFirst ? "" : "border-t border-border"} ${card ? " lg:pt-6 lg:flex-col lg:items-start lg:border lg:border-border lg:rounded" : ""}`;
    const interactive = onClick ? "transition-colors active:bg-muted/40 lg:hover:bg-muted/40" : "";
    return (
      <Wrapper
        onClick={onClick}
        className={`flex items-center gap-3 px-[18px] py-3.5 w-full text-left ${card && " lg:pt-6 lg:flex-col lg:items-start"} ${baseBorder} ${interactive}`}
      >
        <IconTile>{icon}</IconTile>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {meta && <p className="text-xs text-muted-foreground mt-0.5 truncate">{meta}</p>}
        </div>
        <div className={cn("flex justify-end items-end gap-2 shrink-0",card && "lg:w-full")}>
          {right}
          {onClick && <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
        </div>
      </Wrapper>
    );
  };

  // ─── Helper: SToggleRow ────────────────────────────────────────
  const SToggleRow = ({
    icon,
    title,
    meta,
    checked,
    onChange,
    isFirst,
    disabled,
  }: {
    icon: React.ReactNode;
    title: string;
    meta?: string;
    checked: boolean;
    onChange: () => void;
    isFirst?: boolean;
    disabled?: boolean;
  }) => (
    <div className={`flex items-center gap-3 px-[18px] py-3.5 w-full ${isFirst ? "" : "border-t border-border"} ${disabled ? "opacity-60" : ""}`}>
      <IconTile>{icon}</IconTile>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {meta && <p className="text-xs text-muted-foreground mt-0.5">{meta}</p>}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        aria-label={`Toggle ${title}`}
        onCheckedChange={() => {
          if (disabled) return;
          hapticSuccess();
          onChange();
        }}
      />
    </div>
  );

  // ─── Helper: SGroup header ─────────────────────────────────────
  const SGroupHeader = ({ label }: { label: string }) => (
    <div className="px-[18px] pt-5 pb-1.5 border-b border-border">
      <Eyebrow>{label}</Eyebrow>
    </div>
  );

  const SCategoryHeader = ({ children }: { children: React.ReactNode }) => (
    <div className="px-[18px] pt-5 pb-1.5 lg:col-span-2 xl:col-span-3 lg:px-0 lg:pt-3 lg:pb-0">
      <Eyebrow>{children}</Eyebrow>
    </div>
  );

  // ─── Helper: Badge ─────────────────────────────────────────────
  const SBadge = ({
    children,
    tone = "default",
  }: {
    children: React.ReactNode;
    tone?: "default" | "outline" | "ok" | "warn";
  }) => {
    const statusTone: StatusTone = tone === "ok" ? "success" : tone === "warn" ? "warning" : "neutral";
    return (
      <StatusBadge
        tone={statusTone}
        className={cn("px-1.5 text-[11px]", tone === "default" && "text-foreground", tone === "outline" && "bg-background text-foreground")}
      >
        {children}
      </StatusBadge>
    );
  };

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
                      {org.parentOrgId && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{t("multiStore.subBadge")}</p>
                      )}
                      {isCurrent && !org.parentOrgId && (
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
                      {organizations.some((o) => !o.parentOrgId)
                        ? t("multiStore.drawerAddHint")
                        : t("multiStore.parentHelpRoot")}
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
                  {organizations.some((o) => !o.parentOrgId) && (
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        {t("multiStore.parentLabel")}
                      </Label>
                      <Select
                        value={drawerParentId ?? "__none__"}
                        onValueChange={(v) => setDrawerParentId(v && v !== "__none__" ? v : null)}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t("multiStore.parentNone")}</SelectItem>
                          {organizations
                            .filter((o) => !o.parentOrgId)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {drawerParentId ? t("multiStore.parentHelpSub") : t("multiStore.parentHelpRoot")}
                      </p>
                    </div>
                  )}
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
            meta={`${activeStaffCount} ${t("settings.membersSuffix")}`}
            onClick={() => setSubPanel("team")}
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
            title={t("multiStore.settings.cardTitle")}
            meta={
              msIsSubStore
                ? t("multiStore.settings.cardMetaSub").replace("{parent}", rootOrg?.name ?? "")
                : subStores.length > 0
                  ? t("multiStore.settings.cardMetaParent").replace("{count}", String(subStores.length))
                  : t("multiStore.settings.cardMetaSolo")
            }
            onClick={() => setSubPanel("multistore")}
            right={subStores.length > 0 ? <SBadge>{String(subStores.length)}</SBadge> : undefined}
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
          icon={<MonitorSmartphone className="h-4 w-4 text-foreground" />}
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
          title={t("settings.betaFeatures")}
          meta={t("settings.betaFeaturesAbout")}
          onClick={() => setBetaFeaturesDialog(true)}
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
            <SRow
              icon={<Coins className="h-4 w-4 text-foreground" />}
              title={t("settings.currency")}
              meta={t(getCurrencyInfo(paymentCurrency).labelKey)}
              onClick={() => setCurrencyDialog(true)}
              right={<span className="text-xs text-muted-foreground font-mono tabular-nums">{getCurrencyInfo(paymentCurrency).symbol} {paymentCurrency}</span>}
            />
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Team & Access Sub-Panel ─────────────────────────── */}
      <DynamicUIElement open={subPanel === "team"} onOpenChange={(open) => !open && setSubPanel(null)}>
        <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("settings.groupTeamAccess")}>{t("settings.groupTeamAccess")}</DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">{t("settings.groupTeamAccess")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div>
            <SRow
              icon={<Users className="h-4 w-4 text-foreground" />}
              title={t("settings.members")}
              meta={t("settings.manageTeam")}
              onClick={() => setTeamDialog(true)}
              right={<SBadge>{String(activeStaffCount)}</SBadge>}
              isFirst
            />
            <SRow
              icon={<Shield className="h-4 w-4 text-foreground" />}
              title={t("settings.rolesPermissions")}
              meta={t("settings.configureAccess")}
              onClick={() => setTeamDialog(true)}
            />
            <SRow
              icon={<Clock className="h-4 w-4 text-foreground" />}
              title={t("settings.scheduleRules")}
              meta={t("settings.availabilityAndTimeOff")}
              onClick={() => setAvailDialog(true)}
            />
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

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

      <DynamicUIElement open={subPanel === "notifications"} onOpenChange={(open) => !open && setSubPanel(null)}>
        <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("settings.groupNotifications")}>{t("settings.groupNotifications")}</DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">{t("settings.groupNotifications")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div>
            <SToggleRow
              icon={<Bell className="h-4 w-4 text-foreground" />}
              title={t("settings.desktopNotifications")}
              meta={
                isTauri
                  ? (tauriPushEnabled
                      ? (t("settings.desktopEnabled"))
                      : (t("settings.desktopDisabled")))
                  : !push.supported
                  ? (t("settings.desktopUnsupported"))
                  : push.permission === "denied"
                  ? (t("settings.desktopBlocked"))
                  : push.isSubscribed
                  ? (t("settings.desktopEnabled"))
                  : (t("settings.desktopDisabled"))
              }
              checked={isTauri ? tauriPushEnabled : push.isSubscribed}
              onChange={() => {
                if (isTauri) {
                  const next = !tauriPushEnabled;
                  if (next) {
                    void requestTauriNotificationPermission().then((ok) => {
                      tauriNotificationsPref.setEnabled(ok);
                      setTauriPushEnabled(ok);
                    });
                  } else {
                    tauriNotificationsPref.setEnabled(false);
                    setTauriPushEnabled(false);
                  }
                  return;
                }
                if (push.busy) return;
                if (push.isSubscribed) push.disable().catch(() => {});
                else push.enable().catch(() => {});
              }}
              isFirst
            />
            <SToggleRow
              icon={<Clock className="h-4 w-4 text-foreground" />}
              title={t("settings.shiftReminders")}
              meta={t("settings.beforeShift")}
              checked={shiftReminders}
              onChange={() => setShiftReminders(!shiftReminders)}
            />
            <SToggleRow
              icon={<Package className="h-4 w-4 text-foreground" />}
              title={t("settings.lowStockAlerts")}
              meta={t("settings.belowThreshold")}
              checked={lowStockAlerts}
              onChange={() => setLowStockAlerts(!lowStockAlerts)}
            />
            <SToggleRow
              icon={<Bell className="h-4 w-4 text-foreground" />}
              title={t("settings.weeklySummary")}
              meta={t("settings.performanceDigest")}
              checked={weeklySummary}
              onChange={() => setWeeklySummary(!weeklySummary)}
            />
          </div>
                    <div className="px-[18px] pb-4">
              <MorningBriefingSettings />
            </div>
          </DynamicUIElementContent>
      </DynamicUIElement>

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
      <DynamicUIElement open={subPanel === "preferences"} onOpenChange={(open) => !open && setSubPanel(null)}>
        <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("settings.groupPreferences")}>{t("settings.groupPreferences")}</DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">{t("settings.groupPreferences")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div>
            <SRow
              icon={<PanelLeft className="h-4 w-4 text-foreground" />}
              title={t("settings.navigationMode")}
              meta={navMode === "sidebar" ? t("settings.sidebar") : t("settings.bottomBar")}
              right={
                <SegmentedControl
                  size="sm"
                  className="shrink-0"
                  aria-label={t("settings.navigationMode")}
                  value={navMode}
                  onChange={(mode) => { hapticSuccess(); setNavMode(mode); }}
                  options={[
                    { value: "sidebar" as NavMode, label: t("settings.side") },
                    { value: "bottombar" as NavMode, label: t("settings.tab") },
                  ]}
                />
              }
              isFirst
            />
            <SRow
              icon={<Moon className="h-4 w-4 text-foreground" />}
              title={t("settings.darkMode")}
              meta={
                themeMode === "system" ? (t("settings.themeSystem"))
                : themeMode === "light" ? (t("settings.themeLight"))
                : (t("settings.themeDark"))
              }
              right={
                <SegmentedControl
                  size="sm"
                  className="shrink-0"
                  aria-label={t("settings.darkMode")}
                  value={themeMode}
                  onChange={(mode) => { hapticSuccess(); applyThemeMode(mode); }}
                  options={[
                    { value: "system" as ThemeMode, label: t("settings.themeSystem") },
                    { value: "light" as ThemeMode, label: t("settings.themeLight") },
                    { value: "dark" as ThemeMode, label: t("settings.themeDark") },
                  ]}
                />
              }
            />
            <SRow
              icon={<Languages className="h-4 w-4 text-foreground" />}
              title={t("settings.language")}
              meta={LOCALE_LABELS[locale]}
              onClick={() => setLangDialogOpen(true)}
            />
            <DynamicUIElement open={langDialogOpen} onOpenChange={setLangDialogOpen}>
              <DynamicUIElementContent className="max-w-sm">
                <DynamicUIElementHeader>
                  <DynamicUIElementTitle>{t("settings.language")}</DynamicUIElementTitle>
                </DynamicUIElementHeader>
                <div className="space-y-1 py-2">
                  {LOCALES.map((loc) => (
                    <OptionRow
                      key={loc}
                      selected={locale === loc}
                      onSelect={() => { setLocale(loc); setLangDialogOpen(false); }}
                      className="py-2.5"
                      title={LOCALE_LABELS[loc]}
                      meta={<span className="text-xs font-mono text-muted-foreground">{loc}</span>}
                    />
                  ))}
                </div>
              </DynamicUIElementContent>
            </DynamicUIElement>
            <SRow
              icon={<Calendar className="h-4 w-4 text-foreground" />}
              title={t("settings.weekStartsOn")}
              meta={t("settings.monday")}
            />
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Device Sub-Panel ────────────────────────────────── */}
      <DynamicUIElement open={subPanel === "device"} onOpenChange={(open) => !open && setSubPanel(null)}>
        <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("settings.groupDevice")}>{t("settings.groupDevice")}</DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">{t("settings.groupDevice")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div>
            <SToggleRow
              icon={<MonitorSmartphone className="h-4 w-4 text-foreground" />}
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
                  setMyCodeInput("");
                  setMyCodeDialog(true);
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
              icon={<MonitorSmartphone className="h-4 w-4 text-foreground" />}
              title={t("settings.deviceName")}
              meta={deviceName || t("settings.notSet")}
              onClick={() => { setDeviceNameInput(deviceName); setDeviceNameDialog(true); }}
              right={deviceName ? <span className="text-xs text-muted-foreground font-mono truncate max-w-[100px]">{deviceName}</span> : undefined}
            />
            <SRow
              icon={<KeyRound className="h-4 w-4 text-foreground" />}
              title={t("settings.punchInCode")}
              meta={myCode ? t("settings.codeSet") : t("settings.setFourDigit")}
              onClick={() => { setMyCodeInput(""); setMyCodeDialog(true); }}
              right={myCode ? <SBadge tone="ok">{t("settings.setBadge")}</SBadge> : undefined}
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
                    icon={<MonitorSmartphone className="h-4 w-4 text-foreground" />}
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
      <DynamicUIElement open={subPanel === "data"} onOpenChange={(open) => !open && setSubPanel(null)}>
        <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("settings.groupData")}>{t("settings.groupData")}</DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">{t("settings.groupData")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div>
            <SRow
              icon={<Download className="h-4 w-4 text-foreground" />}
              title={t("settings.exportData")}
              meta={t("settings.downloadCSV")}
              isFirst
            />
            <SRow
              icon={<Activity className="h-4 w-4 text-foreground" />}
              title={t("settings.activityLog")}
              meta={t("settings.recentActivity")}
            />
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── About Sub-Panel ─────────────────────────────────── */}
      <DynamicUIElement open={subPanel === "about"} onOpenChange={(open) => !open && setSubPanel(null)}>
        <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("settings.groupAbout")}>{t("settings.groupAbout")}</DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">{t("settings.groupAbout")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div>
            <SRow
              icon={<Info className="h-4 w-4 text-foreground" />}
              title={t("settings.aboutAppName")}
              right={<span className="text-xs text-muted-foreground font-mono tabular-nums">{t("settings.appVersion")}</span>}
              isFirst
            />
            <SRow
              icon={<FileText className="h-4 w-4 text-foreground" />}
              title={t("settings.terms")}
            />
            <SRow
              icon={<Shield className="h-4 w-4 text-foreground" />}
              title={t("settings.privacy")}
            />
            <SRow
              icon={<HelpCircle className="h-4 w-4 text-foreground" />}
              title={t("settings.helpSupport")}
            />
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Multi-Store Sub-Panel ───────────────────────────── */}
      <DynamicUIElement open={subPanel === "multistore"} onOpenChange={(open) => !open && setSubPanel(null)}>
        <DynamicUIElementContent className="max-w-md lg:max-w-2xl" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("multiStore.settings.title")}>
              {t("multiStore.settings.title")}
            </DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">
              {t("multiStore.settings.description")}
            </DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div className="px-[18px] py-4 space-y-5">
            {/* Current store role within the tree */}
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <Eyebrow className="mb-1">{t("multiStore.settings.currentRole")}</Eyebrow>
              <p className="text-sm font-medium">
                {msIsSubStore
                  ? t("multiStore.settings.roleSub").replace("{parent}", rootOrg?.name ?? "")
                  : subStores.length > 0
                    ? t("multiStore.settings.roleParent").replace("{count}", String(subStores.length))
                    : t("multiStore.settings.roleSolo")}
              </p>
            </div>

            {/* Store image */}
            <div className="space-y-2">
              <Eyebrow>{t("settings.storeImage")}</Eyebrow>
              <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
                <StoreLogo name={currentOrg?.name ?? ""} logoUrl={storeLogoUrl} className="h-14 w-14 text-lg" />
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {t("settings.storeImageHint")}
                  </p>
                  {role === "owner" && (
                    <div className="flex items-center gap-1.5">
                      <label className="flex cursor-pointer items-center gap-1.5 rounded border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors">
                        {uploadingStoreLogo ? <Spinner size={12} /> : null}
                        {t("settings.storeImageUpload")}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingStoreLogo}
                          onChange={handleStoreLogoUpload}
                        />
                      </label>
                      {storeLogoUrl && (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="text-muted-foreground"
                          disabled={uploadingStoreLogo}
                          onClick={handleStoreLogoRemove}
                        >
                          {t("settings.storeImageRemove")}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Share group list */}
            <div className="space-y-2">
              <Eyebrow>{t("multiStore.settings.groupHeader")}</Eyebrow>
              <div className="rounded-lg border border-border divide-y divide-border bg-card">
                {msShareGroupOrgs.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    {t("multiStore.settings.groupEmpty")}
                  </p>
                )}
                {msShareGroupOrgs.map((o) => {
                  const isCurrent = o.id === organizationId;
                  return (
                    <button
                      key={o.id}
                      onClick={() => !isCurrent && switchOrg(o.id)}
                      disabled={isCurrent}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/60 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      {o.parentOrgId && <span className="text-muted-foreground/70">↳</span>}
                      <StoreLogo name={o.name} logoUrl={o.logoUrl} className="h-7 w-7 text-[10px]" />
                      <span className="flex-1 truncate text-sm font-medium">{o.name}</span>
                      {!o.parentOrgId && (
                        <StatusBadge tone="neutral" size="xs">{t("multiStore.settings.parentBadge")}</StatusBadge>
                      )}
                      {o.parentOrgId && (
                        <StatusBadge tone="neutral" size="xs">{t("multiStore.subBadge")}</StatusBadge>
                      )}
                      {isCurrent && (
                        <StatusBadge tone="neutral" size="xs" className="border-foreground/30 bg-background text-foreground">{t("multiStore.settings.thisStore")}</StatusBadge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sharing policy summary — fixed, descriptive */}
            <div className="space-y-2">
              <Eyebrow>{t("multiStore.settings.policyHeader")}</Eyebrow>
              <div className="rounded-lg border border-border bg-card divide-y divide-border text-sm">
                <div className="px-3 py-2 flex items-start gap-2">
                  <Check className="h-3.5 w-3.5 mt-1 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-medium">{t("multiStore.settings.policySharedTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t("multiStore.settings.policySharedList")}</p>
                  </div>
                </div>
                <div className="px-3 py-2 flex items-start gap-2">
                  <Unlink className="h-3.5 w-3.5 mt-1 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-medium">{t("multiStore.settings.policyIsolatedTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t("multiStore.settings.policyIsolatedList")}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Detach (sub-store only, owner only) */}
            {msIsSubStore && role === "owner" && (
              <div className="space-y-2">
                <Eyebrow>{t("multiStore.settings.detachHeader")}</Eyebrow>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("multiStore.settings.detachHelp")}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={msSaving || !organizationId}
                  onClick={async () => {
                    if (!organizationId) return;
                    if (!confirm(t("multiStore.settings.detachConfirm"))) return;
                    setMsSaving(true);
                    try {
                      const { updateOrgParent } = await import("@/lib/spacetimedb/actions");
                      await updateOrgParent(organizationId, null);
                      hapticSuccess();
                      toast.success(t("multiStore.settings.detachSuccess"));
                      window.location.reload();
                    } catch (err) {
                      console.error(err);
                      toast.error(err instanceof Error ? err.message : t("multiStore.settings.detachFailed"));
                    } finally {
                      setMsSaving(false);
                    }
                  }}
                >
                  {msSaving ? <Spinner size={14} /> : t("multiStore.settings.detachButton")}
                </Button>
              </div>
            )}

            {/* Attach (root org with no children, owner only) */}
            {!msIsSubStore && subStores.length === 0 && role === "owner" && eligibleParentsForAttach.length > 0 && (
              <div className="space-y-2">
                <Eyebrow>{t("multiStore.settings.attachHeader")}</Eyebrow>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("multiStore.settings.attachHelp")}
                </p>
                <div className="flex gap-2">
                  <Select value={msAttachingTo} onValueChange={(v) => setMsAttachingTo(v ?? "")}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={t("multiStore.settings.attachPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleParentsForAttach.map((o) => (
                        <SelectItem key={o.id.toString()} value={o.id.toString()}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={msSaving || !msAttachingTo || !organizationId}
                    onClick={async () => {
                      if (!organizationId || !msAttachingTo) return;
                      if (!confirm(t("multiStore.settings.attachConfirm"))) return;
                      setMsSaving(true);
                      try {
                        const { updateOrgParent } = await import("@/lib/spacetimedb/actions");
                        await updateOrgParent(organizationId, msAttachingTo);
                        hapticSuccess();
                        toast.success(t("multiStore.settings.attachSuccess"));
                        window.location.reload();
                      } catch (err) {
                        console.error(err);
                        toast.error(err instanceof Error ? err.message : t("multiStore.settings.attachFailed"));
                      } finally {
                        setMsSaving(false);
                      }
                    }}
                  >
                    {msSaving ? <Spinner size={14} /> : t("multiStore.settings.attachButton")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Security Sub-Panel ──────────────────────────────── */}
      <DynamicUIElement open={subPanel === "security"} onOpenChange={(open) => !open && setSubPanel(null)}>
        <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("settings.groupSecurity")}>{t("settings.groupSecurity")}</DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">{t("settings.groupSecurity")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div>
            <SRow
              icon={<Fingerprint className="h-4 w-4 text-foreground" />}
              title={t("settings.passkeysTitle")}
              meta={t("settings.passkeysMeta")}
              isFirst
              onClick={async () => {
                try {
                  const res = await fetch("/api/auth/oauth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      provider: "passkey",
                      redirectTo: "/manager/settings",
                      client: "web",
                      ...(authUser?.email ? { loginHint: authUser.email } : {}),
                      screenHint: "sign-in",
                    }),
                  });
                  const data = await res.json();
                  if (data.url) {
                    window.location.href = data.url;
                  } else {
                    toast.error(data.error ?? t("settings.passkeysError"));
                  }
                } catch {
                  toast.error(t("settings.passkeysError"));
                }
              }}
              right={<ChevronRight className="h-4 w-4 text-muted-foreground" />}
            />
            <SRow
              icon={<Sparkles className="h-4 w-4 text-foreground" />}
              title={t("settings.magicAuthTitle")}
              meta={t("settings.magicAuthMeta")}
            />
            <SRow
              icon={<KeyRound className="h-4 w-4 text-foreground" />}
              title={t("settings.passwordRulesTitle")}
              meta={t("settings.passwordRulesMeta")}
            />
          </div>
          <p className="px-[18px] pt-3 pb-4 text-[11.5px] leading-relaxed text-muted-foreground">
            {t("settings.passkeysNote")}
          </p>
        </DynamicUIElementContent>
      </DynamicUIElement>

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
