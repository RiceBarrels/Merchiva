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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { upsertSettings, disconnectSquare, disconnectClover, setPunchInCode, updateOpeningHours } from "@/lib/spacetimedb/actions";
import { parseOpeningHours, type WeeklyHours, type DayKey } from "@/lib/holidays";
import { useTable, useSpacetimeDB } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { getSettings, type UserSettings } from "@/lib/db/settings";
import { useSettings } from "@/lib/spacetimedb/hooks/useSettings";
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
import { LocationManager } from "@/components/location-manager";
import { useLocations } from "@/lib/spacetimedb/hooks";
import { Spinner } from "@/components/ui/loaders/geometric";

interface SquareLocation {
  id: string;
  name: string;
  address: string | null;
}

export default function SettingsPage() {
  const t = useT();
  const { locale, setLocale } = useI18n();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { role, organizationId, can, organizations, currentOrg, switchOrg } = usePermissions();
  const { signOut, user: authUser, accounts, switchAccount } = useAuth();
  const isAdmin = role === "owner" || role === "manager";
  const canEditTeam = can("team", "edit");
  // Settings data via SpacetimeDB migration hook
  const { settings, setSettings, loading } = useSettings();
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

  // Mobile drawer for switching store / account
  const [switcherOpen, setSwitcherOpen] = useState(false);

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

  // Payment settings
  const [paymentTaxRate, setPaymentTaxRate] = useState("0");
  const [paymentCurrency, setPaymentCurrency] = useState("USD");
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentSaved, setPaymentSaved] = useState(false);

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storeDeviceTable = (tables as any).storeDevice;
  const [storeDeviceRows] = useTable(storeDeviceTable ?? tables.orgMember);
  const hasStoreDeviceTable = !!storeDeviceTable;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgDevices = useMemo(() => {
    if (!hasStoreDeviceTable || !organizationId) return [];
    return (storeDeviceRows as unknown as any[]).filter((d) => d.organizationId === organizationId);
  }, [storeDeviceRows, organizationId, hasStoreDeviceTable]);
  const [manageDeviceDialog, setManageDeviceDialog] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [manageDeviceTarget, setManageDeviceTarget] = useState<any>(null);
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
  const [memberRows] = useTable(tables.orgMember);
  const myMember = (memberRows as unknown as Array<{
    id: { toString(): string };
    userId: { toString(): string };
    organizationId: string;
    status: string;
    punchInCode?: string;
  }>).find(
    (m) =>
      stdb?.identity &&
      m.userId.toString() === stdb.identity.toString() &&
      m.organizationId === organizationId &&
      m.status === "active",
  );
  const myCode = typeof myMember?.punchInCode === "string" && myMember.punchInCode.length > 0
    ? myMember.punchInCode
    : null;

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
  }, [settings, orgName]);

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
        timezone,
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
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationLatitude(String(position.coords.latitude));
        setLocationLongitude(String(position.coords.longitude));
        setGettingLocation(false);
        toast.success("Location detected");
      },
      (err) => {
        console.error("[settings] Geolocation error:", err);
        toast.error("Could not get your location. Please enter coordinates manually.");
        setGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSavePaymentSettings = async () => {
    if (!userId) return;
    setSavingPayment(true);
    try {
      const { upsertPaymentConfig } = await import("@/lib/db/payments");
      await upsertPaymentConfig(userId, {
        taxRate: parseFloat(paymentTaxRate) || 0,
        currency: paymentCurrency,
      });
      toast.success(t("settings.toastPaymentSaved"));
      setPaymentSaved(true);
      setTimeout(() => setPaymentSaved(false), 2500);
    } finally {
      setSavingPayment(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    if (!file.type.startsWith("image/")) return;
    if (file.size > 4 * 1024 * 1024) return; // 4MB max

    setUploadingAvatar(true);
    try {
      const [res] = await uploadFiles("avatar", { files: [file] });
      const url = res.ufsUrl;

      setAvatarUrl(url);
      hapticSuccess();
    } catch (err) {
      console.error("Avatar upload failed:", err);
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
  type SubPanel = "workspace" | "team" | "notifications" | "preferences" | "device" | "data" | "about" | "security" | "usage" | null;
  const [subPanel, setSubPanel] = useState<SubPanel>(null);

  // Shared dialog rendering used by the main mobile-first layout
  function renderDialogs() {
    return (
      <>
        {/* ─── Auto-lock picker ─────────────────────────────────────── */}
        <DynamicUIElement open={autolockDialog} onOpenChange={setAutolockDialog}>
          <DynamicUIElementContent>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle={t("lock.autolockTitle")}>{t("lock.autolockTitle")}</DynamicUIElementTitle>
              <DynamicUIElementDescription>{t("lock.autolockSubtitle")}</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="space-y-1">
              {AUTOLOCK_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setAutolockSecondsValue(s);
                    setAutolockDialog(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 border rounded text-sm transition-colors ${autolockSeconds === s ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground hover:bg-muted"}`}
                >
                  <span>{s === 0 ? t("lock.never") : autolockLabel(s)}</span>
                  {autolockSeconds === s && <Check className="h-4 w-4" />}
                </button>
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
                      <span className="text-xs font-semibold text-foreground uppercase tracking-wide">{t(`hours.day_${k}`)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{day.closed ? t("hours.closed") : t("hours.open")}</span>
                        <button
                          type="button"
                          aria-label={`Toggle ${k}`}
                          onClick={() => setHoursForm((f) => ({ ...f, [k]: { ...f[k], closed: !f[k].closed } }))}
                          className={`relative inline-flex h-4 w-7 items-center rounded-full border transition-colors ${!day.closed ? "bg-foreground border-foreground" : "bg-background border-border"}`}
                        >
                          <span className={`inline-block h-2.5 w-2.5 rounded-full bg-white dark:bg-stone-900 shadow transition-transform ${!day.closed ? "translate-x-3" : "translate-x-0.5"}`} />
                        </button>
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
                <div className="flex border border-border overflow-hidden w-fit rounded">
                  {(["permanent", "temporary"] as const).map((type, i) => (
                    <button key={type} onClick={() => setAvailForm((f) => ({ ...f, type }))}
                      className={`px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${i > 0 ? "border-l border-border" : ""} ${availForm.type === type ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted"}`}
                    >{t(`availability.${type}`)}</button>
                  ))}
                </div>
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
                      className={`flex-1 py-1.5 text-xs font-semibold border rounded transition-colors ${availForm.dayTimes[i].enabled ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:bg-muted"}`}
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
                          <button onClick={() => setAvailForm((f) => {
                            const dayTimes = f.dayTimes.map((d, j) => j === i ? { ...d, fullDay: !d.fullDay } : d);
                            return { ...f, dayTimes };
                          })}
                            className={`relative inline-flex h-4 w-7 items-center rounded-full border transition-colors ${dt.fullDay ? "bg-foreground border-foreground" : "bg-background border-border"}`}>
                            <span className={`inline-block h-2.5 w-2.5 rounded-full bg-white dark:bg-stone-900 shadow transition-transform ${dt.fullDay ? "translate-x-3" : "translate-x-0.5"}`} />
                          </button>
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
                <button onClick={() => setTimeOffForm((f) => ({ ...f, fullDays: !f.fullDays }))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${timeOffForm.fullDays ? "bg-foreground border-foreground" : "bg-background border-border"}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white dark:bg-stone-900 shadow transition-transform ${timeOffForm.fullDays ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
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
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {t("settings.activeLabel")} · {teamMembers.filter((m) => m.status === "active").length}
                    </p>
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
                          <button
                            onClick={() => { setResetCodeMember(m); setResetCodeInput(""); }}
                            className="text-xs text-muted-foreground hover:underline shrink-0"
                          >
                            {t("settings.resetCode")}
                          </button>
                        )}
                        {canEditTeam && m.role !== "owner" && m.userId !== userId && (
                          <button
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
                            className="text-xs text-muted-foreground hover:underline shrink-0"
                          >
                            {t("settings.edit")}
                          </button>
                        )}
                        {m.role !== "owner" && m.userId !== userId && (
                          <button
                            onClick={async () => {
                              await removeMember(m.id);
                              setTeamMembers((prev) => prev.filter((x) => x.id !== m.id));
                            }}
                            className="text-xs text-destructive hover:underline shrink-0"
                          >
                            {t("settings.remove")}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Pending invitations */}
                  {teamInvitations.length > 0 && (
                    <>
                      <div className="bg-muted/40 px-4 py-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {t("settings.pending")} · {teamInvitations.length}
                        </p>
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
                                <span className="inline-flex items-center gap-1 h-4 px-1.5 rounded-[0.25rem] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[10px] font-medium">
                                  <Clock className="h-2.5 w-2.5" />
                                  {t("settings.pendingAcceptance")}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {t("settings.expiresOn")} {new Date(inv.expiresAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{inv.role}</Badge>
                            <button
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
                              className="text-xs text-foreground hover:underline shrink-0"
                            >
                              {t("settings.resend")}
                            </button>
                            <button
                              onClick={async () => {
                                await cancelInvitation(inv.id);
                                setTeamInvitations((prev) => prev.filter((x) => x.id !== inv.id));
                              }}
                              className="text-xs text-destructive hover:underline shrink-0"
                            >
                              {t("settings.cancel")}
                            </button>
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
                <div className="flex gap-2">
                  {(["staff", "manager"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setInviteRole(r)}
                      className={`flex-1 rounded-[0.3rem] border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                        inviteRole === r
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      }`}
                    >{t(r === "staff" ? "settings.roleStaff" : "settings.roleManager")}</button>
                  ))}
                </div>
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
                  ]).map(({ key, label, actions }) => (
                    <div key={key} className="flex items-center gap-3 px-1 py-1.5 rounded hover:bg-muted/50">
                      <span className="text-sm flex-1">{label}</span>
                      {actions.map((action) => (
                        <label key={action} className="flex items-center gap-1 text-xs text-muted-foreground capitalize cursor-pointer">
                          <input
                            type="checkbox"
                            checked={invitePerms[key]?.[action] === true}
                            onChange={() => {
                              const sec: { view: boolean; edit?: boolean; invite?: boolean } = { ...invitePerms[key] };
                              sec[action] = !sec[action];
                              if (action === "view" && !sec.view) { sec.edit = false; sec.invite = false; }
                              if ((action === "edit" || action === "invite") && sec[action]) sec.view = true;
                              setInvitePerms({ ...invitePerms, [key]: sec });
                            }}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          {t(action === "view" ? "settings.actionView" : action === "edit" ? "settings.actionEdit" : "settings.actionInvite")}
                        </label>
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
              <DynamicUIElementTitle mobileTitle="Exit store mode">Enter PIN to exit store mode</DynamicUIElementTitle>
              <DynamicUIElementDescription>Enter an owner or manager punch-in code to disable store machine mode.</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Punch-in code</Label>
                <Input
                  value={exitPinInput}
                  onChange={(e) => { setExitPinInput(e.target.value.replace(/\D/g, "").slice(0, 4)); setExitPinError(""); }}
                  inputMode="numeric"
                  placeholder="4 digits"
                  className="h-11 font-mono text-base tracking-[0.3em]"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && exitPinInput.length === 4) {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const match = (memberRows as unknown as any[]).find(
                        (m) => m.organizationId === organizationId && m.status === "active" && m.punchInCode === exitPinInput && (m.role === "owner" || m.role === "manager"),
                      );
                      if (!match) { setExitPinError("Invalid code"); return; }
                      setStoreMachine(false);
                      updateStoreDevice(getOrCreateDeviceId(), { enabled: false }).catch(console.error);
                      setExitPinDialog(false);
                      hapticSuccess();
                      toast.success("Store mode disabled");
                    }
                  }}
                />
                {exitPinError && <p className="text-xs text-red-500 mt-1">{exitPinError}</p>}
              </div>
              <Button
                onClick={() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const match = (memberRows as unknown as any[]).find(
                    (m) => m.organizationId === organizationId && m.status === "active" && m.punchInCode === exitPinInput && (m.role === "owner" || m.role === "manager"),
                  );
                  if (!match) { setExitPinError("Invalid code. Must be an owner or manager code."); return; }
                  setStoreMachine(false);
                  updateStoreDevice(getOrCreateDeviceId(), { enabled: false }).catch(console.error);
                  setExitPinDialog(false);
                  hapticSuccess();
                  toast.success("Store mode disabled");
                }}
                disabled={exitPinInput.length !== 4}
                className="w-full"
              >
                Disable Store Mode
              </Button>
            </div>
          </DynamicUIElementContent>
        </DynamicUIElement>

        {/* ─── Manage Device DynamicUIElement ───────────────────────────── */}
        <DynamicUIElement open={manageDeviceDialog} onOpenChange={setManageDeviceDialog}>
          <DynamicUIElementContent>
            <DynamicUIElementHeader>
              <DynamicUIElementTitle mobileTitle="Manage device">Manage Device</DynamicUIElementTitle>
              <DynamicUIElementDescription>Rename or remove this store device.</DynamicUIElementDescription>
            </DynamicUIElementHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Device name</Label>
                <Input
                  value={manageDeviceNameInput}
                  onChange={(e) => setManageDeviceNameInput(e.target.value.slice(0, 40))}
                  placeholder="Front Counter"
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
                  toast.success("Device renamed");
                }}
                disabled={!manageDeviceNameInput.trim()}
                className="w-full"
              >
                Save
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  if (!manageDeviceTarget) return;
                  await removeStoreDevice(manageDeviceTarget.deviceId);
                  setManageDeviceDialog(false);
                  toast.success("Device removed");
                }}
                className="w-full text-red-600 border-red-200 hover:bg-red-50"
              >
                Remove Device
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
  const integrationsCount = (settings?.squareConnected ? 1 : 0) + (settings?.cloverConnected ? 1 : 0);

  // ─── Helper: icon tile (32px, rounded-[0.3rem], stone-100 bg, 1px border) ──
  const IconTile = ({ children }: { children: React.ReactNode }) => (
    <div className="h-8 w-8 rounded-[0.3rem] bg-muted border border-border flex items-center justify-center shrink-0">
      {children}
    </div>
  );

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
  }: {
    icon: React.ReactNode;
    title: string;
    meta?: string;
    checked: boolean;
    onChange: () => void;
    isFirst?: boolean;
  }) => (
    <div className={`flex items-center gap-3 px-[18px] py-3.5 w-full ${isFirst ? "" : "border-t border-border"}`}>
      <IconTile>{icon}</IconTile>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {meta && <p className="text-xs text-muted-foreground mt-0.5">{meta}</p>}
      </div>
      <button
        onClick={() => { hapticSuccess(); onChange(); }}
        className={`relative inline-flex h-5 w-[34px] items-center rounded-full shrink-0 transition-colors ${checked ? "bg-foreground" : "bg-muted border border-border"}`}
        aria-label={`Toggle ${title}`}
      >
        <span className={`inline-block h-3.5 w-3.5 rounded-full shadow transition-transform ${checked ? "bg-white dark:bg-stone-900 translate-x-[15px]" : "bg-white dark:bg-stone-900 translate-x-[2px]"}`} />
      </button>
    </div>
  );

  // ─── Helper: SGroup header ─────────────────────────────────────
  const SGroupHeader = ({ label }: { label: string }) => (
    <div className="px-[18px] pt-5 pb-1.5 border-b border-border">
      <p className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
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
    const cls = {
      default: "bg-muted text-foreground border-border",
      outline: "bg-background text-foreground border-border",
      ok: "bg-green-50 text-green-700 border-green-200",
      warn: "bg-amber-50 text-amber-700 border-amber-200",
    }[tone];
    return (
      <span className={`inline-flex items-center h-5 px-1.5 rounded text-[11px] font-medium border shrink-0 ${cls}`}>
        {children}
      </span>
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
            <img src={avatarUrl} alt="Avatar" className="h-11 w-11 rounded-[0.3rem] object-cover bg-muted border border-border" />
          ) : (
            <div className="h-11 w-11 rounded-[0.3rem] bg-muted border border-border flex items-center justify-center text-base font-semibold text-muted-foreground">
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
            <DrawerTitle className="text-base">{t("settings.groupStoreAccount") || "Store & Account"}</DrawerTitle>
            <DrawerDescription className="sr-only">
              {t("settings.groupStoreAccount") || "Switch store or account"}
            </DrawerDescription>
          </DrawerHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {/* Stores */}
            <div className="px-[18px] pt-2 pb-1.5">
              <p className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider">
                {t("nav.selectStore") || "Stores"}
              </p>
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
                    <IconTile>
                      <Building2 className="h-4 w-4 text-foreground" />
                    </IconTile>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{org.name}</p>
                      {isCurrent && (
                        <p className="text-xs text-muted-foreground mt-0.5">{t("settings.currentStore") || "Current"}</p>
                      )}
                    </div>
                    {isCurrent
                      ? <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                      : <span className="text-[11px] text-muted-foreground shrink-0">{t("common.switch") || "Switch"}</span>}
                  </button>
                );
              })}
            </div>

            {/* Accounts */}
            {accounts && accounts.length > 0 && (
              <>
                <div className="px-[18px] pt-4 pb-1.5">
                  <p className="text-[10.5px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("accounts.title") || "Accounts"}
                  </p>
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
                            <p className="text-xs text-muted-foreground mt-0.5">{t("settings.currentAccount") || "Signed in"}</p>
                          )}
                        </div>
                        {isCurrent
                          ? <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                          : <span className="text-[11px] text-muted-foreground shrink-0">{t("common.switch") || "Switch"}</span>}
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
                  <p className="text-sm font-medium text-foreground">{t("accounts.addAccount") || "Add account"}</p>
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
                  <LogOut className="h-4 w-4 text-red-500" />
                </IconTile>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-500">{t("common.signOut")}</p>
                </div>
              </button>
            </div>
          </div>
          <DrawerClose className="sr-only">{t("common.cancel") || "Close"}</DrawerClose>
        </DrawerContent>
      </Drawer>

      {/* ─── Category entries ────────────────────────────────── */}
      <div className="bg-background lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-3 lg:bg-transparent lg:mt-4 lg:p-0">
        <SRow
          icon={<Building2 className="h-4 w-4 text-foreground" />}
          title={t("settings.groupWorkspace")}
          meta={businessName || t("settings.notSet")}
          onClick={() => setSubPanel("workspace")}
          isFirst
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
          meta={`${themeMode === "system" ? (t("settings.themeSystem") || "System") : themeMode === "light" ? (t("settings.themeLight") || "Light") : (t("settings.themeDark") || "Dark")} · ${LOCALE_LABELS[locale]}`}
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
          meta="beta-0.1.0"
          onClick={() => setSubPanel("about")}
          card
        />
      </div>

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
              title="Forecast Location"
              meta={locationLatitude && locationLongitude ? `${locationLatitude}, ${locationLongitude}` : "Not set"}
              right={<span className="text-xs text-muted-foreground font-mono truncate max-w-[100px]">{googlePlacesId ? googlePlacesId.slice(0, 12) + "..." : "No Place ID"}</span>}
            />
            <SRow
              icon={<CreditCard className="h-4 w-4 text-foreground" />}
              title={t("settings.billing")}
              meta={t("settings.currentSubscription")}
              right={<SBadge tone="ok">{t("settings.active")}</SBadge>}
              onClick={() => router.push("/~/settings/billing")}
            />
            <SRow
              icon={<FileText className="h-4 w-4 text-foreground" />}
              title={t("settings.taxCompliance")}
              meta={`${t("settings.taxPrefix")} ${paymentTaxRate}% · ${paymentCurrency}`}
              right={<span className="text-xs text-muted-foreground font-mono tabular-nums">{paymentTaxRate}%</span>}
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
            <SRow
              icon={<Zap className="h-4 w-4 text-foreground" />}
              title={t("settings.square")}
              meta={settings?.squareConnected ? t("settings.squareConnectedShort") : t("settings.connectPOS")}
              onClick={() => {
                if (settings?.squareConnected) { handleSquareSync(); }
                else { window.location.href = "/api/square/oauth/authorize"; }
              }}
              right={
                settings?.squareConnected
                  ? <SBadge tone="ok">{t("settings.connected")}</SBadge>
                  : undefined
              }
            />
            <SRow
              icon={<Zap className="h-4 w-4 text-foreground" />}
              title={t("settings.clover")}
              meta={settings?.cloverConnected ? t("settings.cloverConnectedShort") : t("settings.connectPOS")}
              onClick={() => {
                if (settings?.cloverConnected) { handleCloverSync(); }
                else { window.location.href = "/api/clover/connect"; }
              }}
              right={
                settings?.cloverConnected
                  ? <SBadge tone="ok">{t("settings.connected")}</SBadge>
                  : undefined
              }
            />
          </div>
        </DynamicUIElementContent>
      </DynamicUIElement>

      {/* ─── Notifications Sub-Panel ─────────────────────────── */}
      <DynamicUIElement open={subPanel === "notifications"} onOpenChange={(open) => !open && setSubPanel(null)}>
        <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
          <DynamicUIElementHeader>
            <DynamicUIElementTitle mobileTitle={t("settings.groupNotifications")}>{t("settings.groupNotifications")}</DynamicUIElementTitle>
            <DynamicUIElementDescription className="hidden">{t("settings.groupNotifications")}</DynamicUIElementDescription>
          </DynamicUIElementHeader>
          <div>
            <SToggleRow
              icon={<Bell className="h-4 w-4 text-foreground" />}
              title={t("settings.desktopNotifications") || "Desktop notifications"}
              meta={
                isTauri
                  ? (tauriPushEnabled
                      ? (t("settings.desktopEnabled") || "Enabled on this device")
                      : (t("settings.desktopDisabled") || "Push alerts when the app is closed"))
                  : !push.supported
                  ? (t("settings.desktopUnsupported") || "Not supported in this browser")
                  : push.permission === "denied"
                  ? (t("settings.desktopBlocked") || "Blocked in browser settings")
                  : push.isSubscribed
                  ? (t("settings.desktopEnabled") || "Enabled on this device")
                  : (t("settings.desktopDisabled") || "Push alerts when the app is closed")
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
                <div className="flex gap-1 shrink-0">
                  {([
                    { mode: "sidebar" as NavMode, label: t("settings.side") },
                    { mode: "bottombar" as NavMode, label: t("settings.tab") },
                  ]).map(({ mode, label }) => (
                    <button
                      key={mode}
                      onClick={() => { hapticSuccess(); setNavMode(mode); }}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                        navMode === mode
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              }
              isFirst
            />
            <SRow
              icon={<Moon className="h-4 w-4 text-foreground" />}
              title={t("settings.darkMode")}
              meta={
                themeMode === "system" ? (t("settings.themeSystem") || "Follow system")
                : themeMode === "light" ? (t("settings.themeLight") || "Light")
                : (t("settings.themeDark") || "Dark")
              }
              right={
                <div className="flex gap-1 shrink-0">
                  {([
                    { mode: "system" as ThemeMode, label: t("settings.themeSystem") || "System" },
                    { mode: "light" as ThemeMode,  label: t("settings.themeLight")  || "Light"  },
                    { mode: "dark" as ThemeMode,   label: t("settings.themeDark")   || "Dark"   },
                  ]).map(({ mode, label }) => (
                    <button
                      key={mode}
                      onClick={() => { hapticSuccess(); applyThemeMode(mode); }}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                        themeMode === mode
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              }
            />
            <button
              type="button"
              onClick={() => setLangDialogOpen(true)}
              className="flex items-center gap-3 px-[18px] py-3.5 w-full border-t border-border text-left"
            >
              <IconTile><Languages className="h-4 w-4 text-foreground" /></IconTile>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t("settings.language")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{LOCALE_LABELS[locale]}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
            <DynamicUIElement open={langDialogOpen} onOpenChange={setLangDialogOpen}>
              <DynamicUIElementContent className="max-w-sm">
                <DynamicUIElementHeader>
                  <DynamicUIElementTitle>{t("settings.language")}</DynamicUIElementTitle>
                </DynamicUIElementHeader>
                <div className="space-y-1 py-2">
                  {LOCALES.map((loc) => (
                    <button
                      key={loc}
                      onClick={() => { setLocale(loc); setLangDialogOpen(false); }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[0.3rem] px-3 py-2.5 text-left transition-colors",
                        locale === loc ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                      )}
                    >
                      <span className="text-sm font-medium">{LOCALE_LABELS[loc]}</span>
                      <span className={cn("text-xs font-mono", locale === loc ? "text-primary-foreground/70" : "text-muted-foreground")}>{loc}</span>
                      <div className="flex-1" />
                      {locale === loc && <Check className="h-4 w-4" />}
                    </button>
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
                <SGroupHeader label="Store Devices" />
                {orgDevices.map((device: { id: { toString(): string }; deviceId: string; name: string; enabled: boolean; lastSeenAt: { toDate?: () => Date } }, i: number) => (
                  <SRow
                    key={device.id.toString()}
                    icon={<MonitorSmartphone className="h-4 w-4 text-foreground" />}
                    title={device.name || "Unnamed device"}
                    meta={device.deviceId.slice(0, 8)}
                    isFirst={i === 0}
                    right={device.enabled ? <SBadge tone="ok">Active</SBadge> : <SBadge>Off</SBadge>}
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
              right={<span className="text-xs text-muted-foreground font-mono tabular-nums">beta-0.1.0</span>}
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
                      redirectTo: "/~/settings",
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
        <button
          onClick={handleLogout}
          className="flex items-center justify-center gap-2 w-full h-11 rounded-[0.3rem] bg-red-50 border border-red-200 text-red-600 text-sm font-medium transition-colors active:bg-red-100"
        >
          <LogOut className="h-4 w-4" />
          {t("settings.signOut")}
        </button>
      </div>
    </div>

    {renderDialogs()}
    </>
  );
}


