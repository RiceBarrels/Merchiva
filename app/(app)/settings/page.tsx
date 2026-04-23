"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Settings,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Unlink,
  ExternalLink,
  Save,
  MapPin,
  Camera,
  ChevronRight,
  Clock,
  Users,
  Star,
  UserPlus,
  CreditCard,
  MonitorSmartphone,
  KeyRound,
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
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { upsertSettings, disconnectSquare, disconnectClover, setPunchInCode } from "@/lib/spacetimedb/actions";
import { useTable, useSpacetimeDB } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { getSettings, type UserSettings } from "@/lib/db/settings";
import { useSettings } from "@/lib/spacetimedb/hooks/useSettings";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { getCached, setCache, clearCache } from "@/lib/cache";
import { getMyAvailability, getTimeOffRequests } from "@/lib/db/availability";
import { upsertAvailability, createTimeOffRequest, updateMember, removeMember, cancelInvitation, inviteToOrg } from "@/lib/spacetimedb/actions";
import { getTeamMembers, getInvitations } from "@/lib/db/team";
import type { OrgMember, OrgInvitation, OrgRole, Permissions } from "@/lib/types";
import { defaultPermissions } from "@/lib/db/team";
import { usePermissions } from "@/lib/context/permissions";
import { hapticSuccess } from "@/lib/haptics";
import { useAuth } from "@/lib/auth/context";
import { useStoreMachineMode, useDeviceName } from "@/lib/store-machine-mode";
import { useNavMode, type NavMode } from "@/lib/nav-mode";
import { uploadFiles } from "@/lib/uploadthing";
import { toast } from "sonner";

interface SquareLocation {
  id: string;
  name: string;
  address: string | null;
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const { role, organizationId, can } = usePermissions();
  const { signOut } = useAuth();
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
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved]   = useState(false);

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Square OAuth feedback (replaced with toast)

  // Location picker
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locations, setLocations] = useState<SquareLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [selectingLocation, setSelectingLocation] = useState(false);

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
  const [deviceNameDialog, setDeviceNameDialog] = useState(false);
  const [deviceNameInput, setDeviceNameInput] = useState("");

  // Punch-in code reset dialog (managers/team.edit resetting another member's code)
  const [resetCodeMember, setResetCodeMember] = useState<OrgMember | null>(null);
  const [resetCodeInput, setResetCodeInput] = useState("");
  const [resettingCode, setResettingCode] = useState(false);

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

  // Desktop breakpoint detection
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    setIsDesktop(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

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
      toast.success("Square connected successfully!");
    }
    if (searchParams.get("error")) {
      const err = searchParams.get("error");
      const messages: Record<string, string> = {
        oauth_denied: "Square authorization was denied.",
        invalid_state: "Security check failed. Please try again.",
        no_code: "No authorization code received.",
        token_exchange_failed: "Failed to exchange authorization code.",
        exchange_failed: "Connection failed. Please try again.",
      };
      toast.error(messages[err!] ?? "An error occurred connecting to Square.");
    }
    if (searchParams.get("pickLocation") === "true") {
      setShowLocationPicker(true);
      fetchLocations();
    }

    // Clover
    if (searchParams.get("clover_connected") === "true") {
      toast.success("Clover connected successfully!");
      // Reload settings to reflect new connection
      getSettings()
        .then(setSettings)
        .catch((err) => console.error("Failed to reload settings:", err));
    }
    if (searchParams.get("clover_error")) {
      const err = searchParams.get("clover_error");
      const messages: Record<string, string> = {
        no_code: "No authorization code received from Clover.",
        token_exchange_failed: "Failed to exchange authorization code with Clover.",
        missing_token: "Clover did not return a valid token.",
        exchange_failed: "Connection failed. Please try again.",
      };
      toast.error(messages[err!] ?? "An error occurred connecting to Clover.");
    }
  }, [searchParams]);

  const fetchLocations = async () => {
    setLoadingLocations(true);
    try {
      const res = await fetch("/api/square/oauth/locations");
      const json = await res.json();
      setLocations(json.locations ?? []);
    } catch {
      toast.error("Failed to load locations.");
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
        toast.success("Square connected successfully!");
        const updated = await getSettings();
        setSettings(updated);
      } else {
        const err = await res.json();
        toast.error(err.error ?? "Failed to select location.");
      }
    } catch {
      toast.error("Failed to select location.");
    } finally {
      setSelectingLocation(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!userId) return;
    setSavingProfile(true);
    try {
      await upsertSettings(userId, { businessName, timezone });
      setSettings((prev) => {
        const next = prev ? { ...prev, businessName, timezone } : null;
        if (next) setCache("settings", next);
        return next;
      });
      hapticSuccess();
      toast.success("Profile saved");
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } finally {
      setSavingProfile(false);
    }
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
      toast.success("Payment settings saved");
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
        setSquareSyncResult(`Error: ${json.error}`);
      }
    } catch {
      setSquareSyncResult("Sync failed. Check your connection and try again.");
    } finally {
      setSquareSyncing(false);
    }
  };

  const handleDisconnectClover = async () => {
    if (!userId) return;
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
        setCloverSyncResult(`Error: ${json.error}`);
      }
    } catch {
      setCloverSyncResult("Sync failed. Check your connection and try again.");
    } finally {
      setCloverSyncing(false);
    }
  };

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
            }),
          });
          if (!res.ok) {
            const { error } = await res.json().catch(() => ({ error: "email error" }));
            toast.warning(`Invitation created, but email failed: ${error}`);
          } else {
            toast.success("Invitation sent");
          }
        } catch (emailErr) {
          console.error("Invite email failed:", emailErr);
          toast.warning("Invitation created, but email failed to send.");
        }
      } else {
        toast.warning("Invitation created, but could not send email (token not found).");
      }

      setInviteDialog(false);
      setInviteEmail("");
      setInviteRole("staff");
      setInvitePerms(defaultPermissions());
      loadTeam();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send invitation.");
    } finally {
      setInviting(false);
    }
  };

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
  const [darkMode, setDarkMode] = useState(false);

  if (isDesktop) return (
    <>
      <SettingsDesktop
        settings={settings}
        businessName={businessName}
        setBusinessName={setBusinessName}
        timezone={timezone}
        setTimezone={setTimezone}
        avatarUrl={avatarUrl}
        userEmail={userEmail}
        handleAvatarUpload={handleAvatarUpload}
        uploadingAvatar={uploadingAvatar}
        handleSaveProfile={handleSaveProfile}
        savingProfile={savingProfile}
        profileSaved={profileSaved}
        isAdmin={isAdmin}
        canEditTeam={canEditTeam}
        storeMachine={storeMachine}
        setStoreMachine={setStoreMachine}
        deviceName={deviceName}
        setDeviceNameInput={setDeviceNameInput}
        setDeviceNameDialog={setDeviceNameDialog}
        myCode={myCode}
        setMyCodeInput={setMyCodeInput}
        setMyCodeDialog={setMyCodeDialog}
        setAvailDialog={setAvailDialog}
        setTimeOffDialog={setTimeOffDialog}
        setTimeOffForm={setTimeOffForm}
        setTeamDialog={setTeamDialog}
        teamDialog={teamDialog}
        teamMembers={teamMembers}
        teamInvitations={teamInvitations}
        teamLoading={teamLoading}
        loadTeam={loadTeam}
        setInviteDialog={setInviteDialog}
        setResetCodeMember={setResetCodeMember}
        setResetCodeInput={setResetCodeInput}
        userId={userId}
        handleSquareSync={handleSquareSync}
        handleDisconnectSquare={handleDisconnectSquare}
        squareSyncing={squareSyncing}
        squareSyncResult={squareSyncResult}
        handleCloverSync={handleCloverSync}
        handleDisconnectClover={handleDisconnectClover}
        cloverSyncing={cloverSyncing}
        cloverSyncResult={cloverSyncResult}
        paymentTaxRate={paymentTaxRate}
        setPaymentTaxRate={setPaymentTaxRate}
        paymentCurrency={paymentCurrency}
        setPaymentCurrency={setPaymentCurrency}
        handleSavePaymentSettings={handleSavePaymentSettings}
        savingPayment={savingPayment}
        paymentSaved={paymentSaved}
        hapticSuccess={hapticSuccess}
        removeMember={removeMember}
        setTeamMembers={setTeamMembers}
        cancelInvitation={cancelInvitation}
        setTeamInvitations={setTeamInvitations}
      />
      {renderDialogs()}
    </>
  );

  // Shared dialog rendering for both mobile and desktop
  function renderDialogs() {
    return (
      <>
        {/* ─── Availability Dialog ─────────────────────────── */}
        <Dialog open={availDialog} onOpenChange={setAvailDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle mobileTitle="Availability">Set Availability</DialogTitle>
              <DialogDescription>Set your regular availability for scheduling.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <div className="flex border border-border overflow-hidden w-fit rounded">
                  {(["permanent", "temporary"] as const).map((t, i) => (
                    <button key={t} onClick={() => setAvailForm((f) => ({ ...f, type: t }))}
                      className={`px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${i > 0 ? "border-l border-border" : ""} ${availForm.type === t ? "bg-stone-900 text-white" : "bg-white text-stone-600 hover:bg-stone-50"}`}
                    >{t}</button>
                  ))}
                </div>
              </div>
              {availForm.type === "temporary" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={availForm.startDate} onChange={(e) => setAvailForm((f) => ({ ...f, startDate: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>End Date</Label><Input type="date" value={availForm.endDate} onChange={(e) => setAvailForm((f) => ({ ...f, endDate: e.target.value }))} /></div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Available Days</Label>
                <div className="flex gap-1.5">
                  {DAY_NAMES.map((d, i) => (
                    <button key={d} onClick={() => setAvailForm((f) => {
                      const dayTimes = f.dayTimes.map((dt, j) => j === i ? { ...dt, enabled: !dt.enabled } : dt);
                      return { ...f, dayTimes };
                    })}
                      className={`flex-1 py-1.5 text-xs font-semibold border rounded transition-colors ${availForm.dayTimes[i].enabled ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-500 border-border hover:bg-stone-50"}`}
                    >{d}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={availForm.status} onValueChange={(v) => setAvailForm((f) => ({ ...f, status: v ?? f.status }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="unavailable">Unavailable</SelectItem>
                    <SelectItem value="preferred">Preferred</SelectItem>
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
                        <span className="text-xs font-semibold text-stone-700">{DAY_NAMES[i]}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">Full Day</span>
                          <button onClick={() => setAvailForm((f) => {
                            const dayTimes = f.dayTimes.map((d, j) => j === i ? { ...d, fullDay: !d.fullDay } : d);
                            return { ...f, dayTimes };
                          })}
                            className={`relative inline-flex h-4 w-7 items-center rounded-full border transition-colors ${dt.fullDay ? "bg-stone-900 border-stone-900" : "bg-white border-border"}`}>
                            <span className={`inline-block h-2.5 w-2.5 rounded-full bg-white shadow transition-transform ${dt.fullDay ? "translate-x-3" : "translate-x-0.5"}`} />
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
                <Label>Comments</Label>
                <Textarea value={availForm.comments} onChange={(e) => setAvailForm((f) => ({ ...f, comments: e.target.value }))} placeholder="Any notes..." rows={2} className="resize-none text-sm" />
              </div>
              <Button onClick={handleSaveAvailability} disabled={savingAvail} className="w-full">
                {savingAvail ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Availability"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── Time Off Dialog ─────────────────────────────── */}
        <Dialog open={timeOffDialog} onOpenChange={setTimeOffDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle mobileTitle="Time Off">Request Time Off</DialogTitle>
              <DialogDescription>Submit a request for your manager to review.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Full Days</Label>
                <button onClick={() => setTimeOffForm((f) => ({ ...f, fullDays: !f.fullDays }))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full border transition-colors ${timeOffForm.fullDays ? "bg-stone-900 border-stone-900" : "bg-white border-border"}`}>
                  <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${timeOffForm.fullDays ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={timeOffForm.startDate} onChange={(e) => setTimeOffForm((f) => ({ ...f, startDate: e.target.value }))} /></div>
                <div className="space-y-1.5"><Label>End Date</Label><Input type="date" value={timeOffForm.endDate} onChange={(e) => setTimeOffForm((f) => ({ ...f, endDate: e.target.value }))} /></div>
              </div>
              {!timeOffForm.fullDays && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label>Start Time</Label><Input type="time" value={timeOffForm.startTime} onChange={(e) => setTimeOffForm((f) => ({ ...f, startTime: e.target.value }))} /></div>
                  <div className="space-y-1.5"><Label>End Time</Label><Input type="time" value={timeOffForm.endTime} onChange={(e) => setTimeOffForm((f) => ({ ...f, endTime: e.target.value }))} /></div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Comments</Label>
                <Textarea value={timeOffForm.comments} onChange={(e) => setTimeOffForm((f) => ({ ...f, comments: e.target.value }))} placeholder="Reason for time off..." rows={3} className="resize-none text-sm" />
              </div>
              <Button onClick={handleTimeOffRequest} disabled={savingTimeOff || !timeOffForm.startDate || !timeOffForm.endDate} className="w-full">
                {savingTimeOff ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Time Off Request"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── Team Dialog ──────────────────────────────────── */}
        <Dialog open={teamDialog} onOpenChange={setTeamDialog}>
          <DialogContent noPadding>
            <DialogHeader>
              <DialogTitle mobileTitle="Team">Team Members</DialogTitle>
              <DialogDescription className="hidden">Manage your team</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col h-full">
              {teamLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {/* Active members */}
                  <div className="bg-muted/40 px-4 py-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Active · {teamMembers.filter((m) => m.status === "active").length}
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {teamMembers.filter((m) => m.status === "active").map((m) => (
                      <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="h-9 w-9 rounded-full bg-stone-100 flex items-center justify-center text-sm font-bold text-stone-500 shrink-0">
                          {(m.displayName || "?")[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {m.displayName || m.email}
                            {m.userId === userId && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
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
                            Reset code
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
                            Remove
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
                          Pending · {teamInvitations.length}
                        </p>
                      </div>
                      <div className="divide-y divide-border">
                        {teamInvitations.map((inv) => (
                          <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="h-9 w-9 rounded-full bg-stone-100 flex items-center justify-center text-sm text-stone-400 shrink-0">
                              @
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{inv.email}</p>
                              <p className="text-xs text-muted-foreground">Expires {new Date(inv.expiresAt).toLocaleDateString()}</p>
                            </div>
                            <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{inv.role}</Badge>
                            <button
                              onClick={async () => {
                                await cancelInvitation(inv.id);
                                setTeamInvitations((prev) => prev.filter((x) => x.id !== inv.id));
                              }}
                              className="text-xs text-destructive hover:underline shrink-0"
                            >
                              Cancel
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
                      <UserPlus className="h-4 w-4" /> Invite Member
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── Invite Member Dialog ─────────────────────────── */}
        <Dialog open={inviteDialog} onOpenChange={setInviteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle mobileTitle="Invite">Invite Team Member</DialogTitle>
              <DialogDescription>Send an invitation email to join your team.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <div className="flex gap-2">
                  {(["staff", "manager"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setInviteRole(r)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                        inviteRole === r
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      }`}
                    >{r}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Permissions</Label>
                <div className="space-y-0.5">
                  {([
                    { key: "dashboard" as const, label: "Dashboard", actions: ["view"] as const },
                    { key: "inventory" as const, label: "Inventory", actions: ["view", "edit"] as const },
                    { key: "sales" as const, label: "Sales", actions: ["view"] as const },
                    { key: "staffing" as const, label: "Staffing", actions: ["view", "edit"] as const },
                    { key: "products" as const, label: "Products", actions: ["view", "edit"] as const },
                    { key: "pos" as const, label: "POS", actions: ["view"] as const },
                    { key: "settings" as const, label: "Settings", actions: ["view"] as const },
                    { key: "team" as const, label: "Team", actions: ["view", "invite", "edit"] as const },
                    { key: "website" as const, label: "Website", actions: ["view", "edit"] as const },
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
                          {action}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="w-full">
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Invitation"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── Device Name Dialog ──────────────────────────────── */}
        <Dialog open={deviceNameDialog} onOpenChange={setDeviceNameDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle mobileTitle="Device name">
                {deviceName ? "Rename this device" : "Name this device"}
              </DialogTitle>
              <DialogDescription>
                {deviceName
                  ? "Update how this machine is labeled."
                  : "Give this device a name (e.g. \"Front Counter\" or \"Kitchen iPad\") so staff can tell it apart from other store machines."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Device name</Label>
                <Input
                  value={deviceNameInput}
                  onChange={(e) => setDeviceNameInput(e.target.value.slice(0, 40))}
                  placeholder="Front Counter"
                  className="h-11"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && deviceNameInput.trim()) {
                      setDeviceNameValue(deviceNameInput);
                      setDeviceNameDialog(false);
                      if (!storeMachine) setStoreMachine(true);
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
                  hapticSuccess();
                  toast.success("Device name saved");
                }}
                disabled={!deviceNameInput.trim()}
                className="w-full"
              >
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── My Punch-in Code Dialog ─────────────────────────── */}
        <Dialog open={myCodeDialog} onOpenChange={setMyCodeDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle mobileTitle="Punch-in code">
                {myCode ? "Change your punch-in code" : "Set your punch-in code"}
              </DialogTitle>
              <DialogDescription>
                {myCode
                  ? "Update the 4-digit code you enter at this store to punch in."
                  : "Pick a 4-digit code you'll enter at this store to punch in."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>New code</Label>
                <Input
                  value={myCodeInput}
                  onChange={(e) => setMyCodeInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  placeholder="4 digits"
                  className="h-11 font-mono text-base tracking-[0.3em]"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    if (!myMember) { toast.error("Not a member of this store"); return; }
                    if (!/^[0-9]{4}$/.test(myCodeInput)) { toast.error("Code must be 4 digits"); return; }
                    setSavingMyCode(true);
                    try {
                      await setPunchInCode(myMember.id.toString(), myCodeInput);
                      hapticSuccess();
                      toast.success("Code saved");
                      setMyCodeDialog(false);
                      setMyCodeInput("");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to save code");
                    } finally {
                      setSavingMyCode(false);
                    }
                  }}
                  disabled={savingMyCode || myCodeInput.length < 4}
                  className="flex-1"
                >
                  {savingMyCode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
                {myCode && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!myMember) return;
                      setSavingMyCode(true);
                      try {
                        await setPunchInCode(myMember.id.toString(), null);
                        toast.success("Code cleared");
                        setMyCodeDialog(false);
                        setMyCodeInput("");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed to clear code");
                      } finally {
                        setSavingMyCode(false);
                      }
                    }}
                    disabled={savingMyCode}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── Reset Punch-in Code Dialog ──────────────────────── */}
        <Dialog open={!!resetCodeMember} onOpenChange={(o) => { if (!o) setResetCodeMember(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle mobileTitle="Reset code">Reset punch-in code</DialogTitle>
              <DialogDescription>
                {resetCodeMember?.displayName || resetCodeMember?.email
                  ? <>Set a new code for <span className="font-medium">{resetCodeMember.displayName || resetCodeMember.email}</span>.</>
                  : "Set a new code."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>New code (4 digits)</Label>
                <Input
                  value={resetCodeInput}
                  onChange={(e) => setResetCodeInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  placeholder="e.g. 1234"
                  className="h-11 font-mono text-base tracking-[0.3em]"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={async () => {
                    if (!resetCodeMember) return;
                    if (!/^[0-9]{4}$/.test(resetCodeInput)) {
                      toast.error("Code must be 4 digits");
                      return;
                    }
                    setResettingCode(true);
                    try {
                      await setPunchInCode(resetCodeMember.id, resetCodeInput);
                      toast.success("Code reset");
                      setResetCodeMember(null);
                      setResetCodeInput("");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to reset code");
                    } finally {
                      setResettingCode(false);
                    }
                  }}
                  disabled={resettingCode || resetCodeInput.length < 4}
                  className="flex-1"
                >
                  {resettingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!resetCodeMember) return;
                    setResettingCode(true);
                    try {
                      await setPunchInCode(resetCodeMember.id, null);
                      toast.success("Code cleared");
                      setResetCodeMember(null);
                      setResetCodeInput("");
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to clear code");
                    } finally {
                      setResettingCode(false);
                    }
                  }}
                  disabled={resettingCode}
                >
                  Clear
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
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
  const integrationsCount = (settings?.squareConnected ? 1 : 0) + (settings?.cloverConnected ? 1 : 0);

  // ─── Helper: icon tile (32px, rounded-lg, stone-100 bg, 1px border) ──
  const IconTile = ({ children }: { children: React.ReactNode }) => (
    <div className="h-8 w-8 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center shrink-0">
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
  }: {
    icon: React.ReactNode;
    title: string;
    meta?: string;
    right?: React.ReactNode;
    onClick?: () => void;
    isFirst?: boolean;
  }) => {
    const Wrapper = onClick ? "button" : "div";
    return (
      <Wrapper
        onClick={onClick}
        className={`flex items-center gap-3 px-[18px] py-3.5 w-full text-left ${isFirst ? "" : "border-t border-stone-200"}`}
      >
        <IconTile>{icon}</IconTile>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-900">{title}</p>
          {meta && <p className="text-xs text-stone-500 mt-0.5 truncate">{meta}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {right}
          {onClick && <ChevronRight className="h-4 w-4 text-stone-400 shrink-0" />}
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
    <div className={`flex items-center gap-3 px-[18px] py-3.5 w-full ${isFirst ? "" : "border-t border-stone-200"}`}>
      <IconTile>{icon}</IconTile>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-900">{title}</p>
        {meta && <p className="text-xs text-stone-500 mt-0.5">{meta}</p>}
      </div>
      <button
        onClick={() => { hapticSuccess(); onChange(); }}
        className={`relative inline-flex h-5 w-[34px] items-center rounded-full shrink-0 transition-colors ${checked ? "bg-stone-900" : "bg-stone-100 border border-stone-200"}`}
        aria-label={`Toggle ${title}`}
      >
        <span className={`inline-block h-3.5 w-3.5 rounded-full shadow transition-transform ${checked ? "bg-white translate-x-[15px]" : "bg-white translate-x-[2px]"}`} />
      </button>
    </div>
  );

  // ─── Helper: SGroup header ─────────────────────────────────────
  const SGroupHeader = ({ label }: { label: string }) => (
    <div className="px-[18px] pt-5 pb-1.5 border-b border-stone-200">
      <p className="text-[10.5px] font-semibold text-stone-500 uppercase tracking-wider">{label}</p>
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
      default: "bg-stone-100 text-stone-700 border-stone-200",
      outline: "bg-white text-stone-700 border-stone-200",
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
    <div className="min-h-screen bg-white pb-28">
      {/* ─── TopBar ─────────────────────────────────────────── */}
      <div className="flex items-center sticky top-0 z-10 py-4 px-6 gap-6 bg-white border-b border-stone-200">
        <SettingsIcon className="h- w-5 text-stone-900" />
        <div className="flex items-center justify-between flex-1">
          <div>
            <h1 className="text-xl font-semibold text-stone-900">Settings</h1>
            <p className="text-xs text-stone-500">{businessName || "Your Business"} {activeStaffCount > 0 ? `· ${activeStaffCount} members` : ""}</p>
          </div>
          <button className="h-8 w-8 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-center">
            <Search className="h-4 w-4 text-stone-500" />
          </button>
        </div>
      </div>

      {/* ─── User Card ──────────────────────────────────────── */}
      <div
        className="flex items-center gap-3.5 w-full px-[18px] py-4 border-b border-stone-200 text-left"
      >
        <div className="relative shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="h-11 w-11 rounded-lg object-cover bg-stone-100 border border-stone-200" />
          ) : (
            <div className="h-11 w-11 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-base font-semibold text-stone-500">
              {(businessName || userEmail)?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <label className="absolute -bottom-1 -right-1 p-0.5 rounded bg-stone-100 border border-stone-200 cursor-pointer">
            {uploadingAvatar ? <Loader2 className="h-2.5 w-2.5 animate-spin text-stone-500" /> : <Camera className="h-2.5 w-2.5 text-stone-500" />}
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
          </label>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-stone-900 truncate">{businessName || userEmail || "Your Name"}</p>
          <p className="text-xs font-mono text-stone-500 truncate tabular-nums">{userEmail || "email"}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <SBadge tone="outline">{role ?? "member"}</SBadge>
          {userId && <SBadge>{userId.slice(0, 6)}</SBadge>}
        </div>
      </div>

      {/* ─── Workspace Group ────────────────────────────────── */}
      <SGroupHeader label="Workspace" />
      <div className="bg-white">
        <SRow
          icon={<Building2 className="h-4 w-4 text-stone-700" />}
          title="Business profile"
          meta={businessName || "Not set"}
          right={<span className="text-xs text-stone-500 font-mono truncate max-w-[120px]">{timezone}</span>}
          isFirst
        />
        <SRow
          icon={<MapPin className="h-4 w-4 text-stone-700" />}
          title="Locations"
          meta="Manage store locations"
          right={<SBadge>1</SBadge>}
        />
        <SRow
          icon={<CreditCard className="h-4 w-4 text-stone-700" />}
          title="Billing"
          meta="Current subscription"
          right={<SBadge tone="ok">Active</SBadge>}
        />
        <SRow
          icon={<FileText className="h-4 w-4 text-stone-700" />}
          title="Tax & compliance"
          meta={`Tax ${paymentTaxRate}% · ${paymentCurrency}`}
          right={<span className="text-xs text-stone-500 font-mono tabular-nums">{paymentTaxRate}%</span>}
        />
      </div>

      {/* ─── Team & Access Group ────────────────────────────── */}
      {isAdmin && (
        <>
          <SGroupHeader label="Team & access" />
          <div className="bg-white">
            <SRow
              icon={<Users className="h-4 w-4 text-stone-700" />}
              title="Members"
              meta="Manage your team"
              onClick={() => setTeamDialog(true)}
              right={<SBadge>{String(activeStaffCount)}</SBadge>}
              isFirst
            />
            <SRow
              icon={<Shield className="h-4 w-4 text-stone-700" />}
              title="Roles & permissions"
              meta="Configure access levels"
              onClick={() => setTeamDialog(true)}
            />
            <SRow
              icon={<Clock className="h-4 w-4 text-stone-700" />}
              title="Schedule rules"
              meta="Availability and time off"
              onClick={() => setAvailDialog(true)}
            />
            <SRow
              icon={<Zap className="h-4 w-4 text-stone-700" />}
              title="API & integrations"
              meta={
                settings?.squareConnected
                  ? "Square connected"
                  : settings?.cloverConnected
                    ? "Clover connected"
                    : "Connect POS"
              }
              onClick={() => {
                if (settings?.squareConnected) { handleSquareSync(); }
                else { window.location.href = "/api/square/oauth/authorize"; }
              }}
              right={
                (settings?.squareConnected || settings?.cloverConnected)
                  ? <SBadge tone="ok">{settings?.squareConnected ? "Square" : "Clover"}</SBadge>
                  : undefined
              }
            />
          </div>
        </>
      )}

      {/* ─── Notifications Group ────────────────────────────── */}
      <SGroupHeader label="Notifications" />
      <div className="bg-white">
        <SToggleRow
          icon={<Clock className="h-4 w-4 text-stone-700" />}
          title="Shift reminders"
          meta="Before your shift starts"
          checked={shiftReminders}
          onChange={() => setShiftReminders(!shiftReminders)}
          isFirst
        />
        <SToggleRow
          icon={<Package className="h-4 w-4 text-stone-700" />}
          title="Low stock alerts"
          meta="When items fall below threshold"
          checked={lowStockAlerts}
          onChange={() => setLowStockAlerts(!lowStockAlerts)}
        />
        <SToggleRow
          icon={<Bell className="h-4 w-4 text-stone-700" />}
          title="Weekly summary"
          meta="Performance digest every Monday"
          checked={weeklySummary}
          onChange={() => setWeeklySummary(!weeklySummary)}
        />
      </div>

      {/* ─── Preferences Group ──────────────────────────────── */}
      <SGroupHeader label="Preferences" />
      <div className="bg-white">
        <SRow
          icon={<PanelLeft className="h-4 w-4 text-stone-700" />}
          title="Navigation mode"
          meta={navMode === "sidebar" ? "Sidebar" : "Bottom bar"}
          right={
            <div className="flex gap-1 shrink-0">
              {([
                { mode: "sidebar" as NavMode, label: "Side" },
                { mode: "bottombar" as NavMode, label: "Tab" },
              ]).map(({ mode, label }) => (
                <button
                  key={mode}
                  onClick={() => { hapticSuccess(); setNavMode(mode); }}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${
                    navMode === mode
                      ? "bg-stone-900 text-white"
                      : "bg-stone-100 text-stone-500 border border-stone-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          }
          isFirst
        />
        <SToggleRow
          icon={<Moon className="h-4 w-4 text-stone-700" />}
          title="Dark mode"
          meta="Switch to dark theme"
          checked={darkMode}
          onChange={() => setDarkMode(!darkMode)}
        />
        <SRow
          icon={<Languages className="h-4 w-4 text-stone-700" />}
          title="Language"
          meta="English (US)"
        />
        <SRow
          icon={<Calendar className="h-4 w-4 text-stone-700" />}
          title="Week starts on"
          meta="Monday"
        />
      </div>

      {/* ─── Device Group ───────────────────────────────────── */}
      <SGroupHeader label="Device" />
      <div className="bg-white">
        <SToggleRow
          icon={<MonitorSmartphone className="h-4 w-4 text-stone-700" />}
          title="Store machine mode"
          meta="Restrict to POS, Inventory, Punch-in"
          checked={storeMachine}
          onChange={() => {
            if (!storeMachine && !deviceName) {
              setDeviceNameInput("");
              setDeviceNameDialog(true);
              return;
            }
            setStoreMachine(!storeMachine);
          }}
          isFirst
        />
        <SRow
          icon={<MonitorSmartphone className="h-4 w-4 text-stone-700" />}
          title="Device name"
          meta={deviceName || "Not set"}
          onClick={() => { setDeviceNameInput(deviceName); setDeviceNameDialog(true); }}
          right={deviceName ? <span className="text-xs text-stone-500 font-mono truncate max-w-[100px]">{deviceName}</span> : undefined}
        />
        <SRow
          icon={<KeyRound className="h-4 w-4 text-stone-700" />}
          title="Punch-in code"
          meta={myCode ? "Code set" : "Set a 4-digit code"}
          onClick={() => { setMyCodeInput(""); setMyCodeDialog(true); }}
          right={myCode ? <SBadge tone="ok">Set</SBadge> : undefined}
        />
      </div>

      {/* ─── Data Group ─────────────────────────────────────── */}
      <SGroupHeader label="Data" />
      <div className="bg-white">
        <SRow
          icon={<Download className="h-4 w-4 text-stone-700" />}
          title="Export data"
          meta="Download your data as CSV"
          isFirst
        />
        <SRow
          icon={<Activity className="h-4 w-4 text-stone-700" />}
          title="Activity log"
          meta="Recent account activity"
        />
      </div>

      {/* ─── About Group ────────────────────────────────────── */}
      <SGroupHeader label="About" />
      <div className="bg-white">
        <SRow
          icon={<Info className="h-4 w-4 text-stone-700" />}
          title="Merchiva"
          right={<span className="text-xs text-stone-400 font-mono tabular-nums">beta-0.1.0</span>}
          isFirst
        />
        <SRow
          icon={<FileText className="h-4 w-4 text-stone-700" />}
          title="Terms of service"
        />
        <SRow
          icon={<Shield className="h-4 w-4 text-stone-700" />}
          title="Privacy policy"
        />
        <SRow
          icon={<HelpCircle className="h-4 w-4 text-stone-700" />}
          title="Help & support"
        />
      </div>

      {/* ─── Sign Out Button ────────────────────────────────── */}
      <div className="px-[18px] py-5">
        <button
          onClick={handleLogout}
          className="flex items-center justify-center gap-2 w-full h-11 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm font-medium transition-colors active:bg-red-100"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>

    {renderDialogs()}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Desktop helper components
   ───────────────────────────────────────────────────────────────────────────── */

function DesktopField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)] gap-4 items-start py-3 border-b last:border-b-0 border-border">
      <div>
        <label className="text-[13px] font-medium">{label}</label>
        {hint && <div className="text-[11.5px] text-stone-500 mt-0.5">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function DesktopCard({
  title,
  desc,
  right,
  children,
}: {
  title?: string;
  desc?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-border rounded-[0.3rem]">
      {(title || right) && (
        <div className="px-5 py-3 flex items-center justify-between border-b border-border">
          <div>
            {title && <div className="text-[14px] font-semibold">{title}</div>}
            {desc && <div className="text-[11.5px] text-stone-500 mt-0.5">{desc}</div>}
          </div>
          {right}
        </div>
      )}
      <div className="px-5">{children}</div>
    </div>
  );
}

type DesktopSection =
  | "business"
  | "timezone"
  | "availability"
  | "timeoff"
  | "square"
  | "clover"
  | "taxrate"
  | "currency"
  | "storemachine"
  | "punchcode"
  | "devicename"
  | "team";

interface SettingsDesktopProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings: any;
  businessName: string;
  setBusinessName: (v: string) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  avatarUrl: string | null;
  userEmail: string;
  handleAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  uploadingAvatar: boolean;
  handleSaveProfile: () => void;
  savingProfile: boolean;
  profileSaved: boolean;
  isAdmin: boolean;
  canEditTeam: boolean;
  storeMachine: boolean;
  setStoreMachine: (v: boolean) => void;
  deviceName: string;
  setDeviceNameInput: (v: string) => void;
  setDeviceNameDialog: (v: boolean) => void;
  myCode: string | null;
  setMyCodeInput: (v: string) => void;
  setMyCodeDialog: (v: boolean) => void;
  setAvailDialog: (v: boolean) => void;
  setTimeOffDialog: (v: boolean) => void;
  setTimeOffForm: (fn: (f: { fullDays: boolean; startDate: string; endDate: string; startTime: string; endTime: string; comments: string }) => { fullDays: boolean; startDate: string; endDate: string; startTime: string; endTime: string; comments: string }) => void;
  setTeamDialog: (v: boolean) => void;
  teamDialog: boolean;
  teamMembers: OrgMember[];
  teamInvitations: OrgInvitation[];
  teamLoading: boolean;
  loadTeam: () => void;
  setInviteDialog: (v: boolean) => void;
  setResetCodeMember: (m: OrgMember | null) => void;
  setResetCodeInput: (v: string) => void;
  userId: string | null;
  handleSquareSync: () => void;
  handleDisconnectSquare: () => void;
  squareSyncing: boolean;
  squareSyncResult: string | null;
  handleCloverSync: () => void;
  handleDisconnectClover: () => void;
  cloverSyncing: boolean;
  cloverSyncResult: string | null;
  paymentTaxRate: string;
  setPaymentTaxRate: (v: string) => void;
  paymentCurrency: string;
  setPaymentCurrency: (v: string) => void;
  handleSavePaymentSettings: () => void;
  savingPayment: boolean;
  paymentSaved: boolean;
  hapticSuccess: () => void;
  removeMember: (id: string) => Promise<void>;
  setTeamMembers: React.Dispatch<React.SetStateAction<OrgMember[]>>;
  cancelInvitation: (id: string) => Promise<void>;
  setTeamInvitations: React.Dispatch<React.SetStateAction<OrgInvitation[]>>;
}

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Anchorage", "Pacific/Honolulu", "America/Phoenix",
  "America/Toronto", "America/Vancouver",
  "Europe/London", "Europe/Paris", "Europe/Berlin",
  "Asia/Tokyo", "Asia/Shanghai", "Asia/Singapore", "Asia/Seoul",
  "Australia/Sydney", "Australia/Melbourne",
  "Pacific/Auckland",
];

interface SectionCardDef {
  id: DesktopSection;
  icon: React.ElementType;
  label: string;
  desc: string;
}

function SettingsDesktop(props: SettingsDesktopProps) {
  const [activeSection, setActiveSection] = useState<DesktopSection | null>(null);

  // Load team data when opening team detail
  const teamLoadedRef = useRef(false);
  useEffect(() => {
    if (activeSection === "team" && !teamLoadedRef.current) {
      teamLoadedRef.current = true;
      props.loadTeam();
    }
  }, [activeSection]);

  const groups: { title: string; cards: SectionCardDef[]; adminOnly?: boolean }[] = [
    {
      title: "ACCOUNT",
      cards: [
        { id: "business", icon: Building2, label: "Business Name", desc: props.businessName || "Not set" },
        { id: "timezone", icon: Globe, label: "Timezone", desc: props.timezone.replace(/_/g, " ") },
      ],
    },
    {
      title: "SCHEDULING",
      cards: [
        { id: "availability", icon: Star, label: "Availability", desc: "Set your weekly availability" },
        { id: "timeoff", icon: Calendar, label: "Time Off", desc: "Request time off" },
      ],
    },
    {
      title: "POS INTEGRATIONS",
      adminOnly: true,
      cards: [
        { id: "square", icon: Zap, label: "Square", desc: props.settings?.squareConnected ? "Connected" : "Not connected" },
        { id: "clover", icon: Zap, label: "Clover", desc: props.settings?.cloverConnected ? "Connected" : "Not connected" },
      ],
    },
    {
      title: "PAYMENTS",
      adminOnly: true,
      cards: [
        { id: "taxrate", icon: CreditCard, label: "Tax Rate", desc: `${props.paymentTaxRate}%` },
        { id: "currency", icon: CreditCard, label: "Currency", desc: props.paymentCurrency },
      ],
    },
    {
      title: "DEVICE",
      cards: [
        { id: "storemachine", icon: MonitorSmartphone, label: "Store Machine Mode", desc: props.storeMachine ? "Enabled" : "Disabled" },
        { id: "punchcode", icon: KeyRound, label: "Punch-in Code", desc: props.myCode ? "Code set" : "Not set" },
        { id: "devicename", icon: MonitorSmartphone, label: "Device Name", desc: props.deviceName || "Not set" },
      ],
    },
    {
      title: "TEAM",
      adminOnly: true,
      cards: [
        { id: "team", icon: Users, label: "Team Members", desc: "Manage members, roles, invitations" },
      ],
    },
  ];

  const sectionMeta: Record<DesktopSection, { icon: React.ElementType; title: string; desc: string }> = {
    business: { icon: Building2, title: "Business Name", desc: "Your business identity" },
    timezone: { icon: Globe, title: "Timezone", desc: "Set your local timezone for scheduling" },
    availability: { icon: Star, title: "Availability", desc: "Set your weekly availability" },
    timeoff: { icon: Calendar, title: "Time Off", desc: "Request time off" },
    square: { icon: Zap, title: "Square", desc: "POS integration with Square" },
    clover: { icon: Zap, title: "Clover", desc: "POS integration with Clover" },
    taxrate: { icon: CreditCard, title: "Tax Rate", desc: "Configure tax rate for transactions" },
    currency: { icon: CreditCard, title: "Currency", desc: "Set your primary currency" },
    storemachine: { icon: MonitorSmartphone, title: "Store Machine Mode", desc: "Restrict this device to POS, Inventory, and Punch-in" },
    punchcode: { icon: KeyRound, title: "Punch-in Code", desc: "Your 4-digit code for punch-in" },
    devicename: { icon: MonitorSmartphone, title: "Device Name", desc: "Identify this machine" },
    team: { icon: Users, title: "Team Members", desc: "Manage members, roles, and invitations" },
  };

  const handleCardClick = (id: DesktopSection) => {
    if (id === "availability") {
      props.setAvailDialog(true);
      return;
    }
    if (id === "timeoff") {
      props.setTimeOffForm(() => ({
        fullDays: true,
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date().toISOString().split("T")[0],
        startTime: "09:00",
        endTime: "17:00",
        comments: "",
      }));
      props.setTimeOffDialog(true);
      return;
    }
    if (id === "punchcode") {
      props.setMyCodeInput("");
      props.setMyCodeDialog(true);
      return;
    }
    if (id === "devicename") {
      props.setDeviceNameInput(props.deviceName);
      props.setDeviceNameDialog(true);
      return;
    }
    setActiveSection(id);
  };

  const renderDetail = () => {
    if (!activeSection) return null;
    const meta = sectionMeta[activeSection];

    return (
          <div>

            {activeSection === "business" && (
              <DesktopCard title="Business Info" desc="Manage your business identity">
                <DesktopField label="Avatar" hint="Upload a logo or photo">
                  <div className="flex items-center gap-3">
                    {props.avatarUrl ? (
                      <img src={props.avatarUrl} alt="Avatar" className="h-10 w-10 rounded-[0.3rem] object-cover border border-border" />
                    ) : (
                      <div className="h-10 w-10 rounded-[0.3rem] bg-stone-100 flex items-center justify-center text-sm font-bold text-stone-500 border border-border">
                        {props.userEmail?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <label className="text-[12px] text-stone-500 hover:text-stone-900 cursor-pointer transition-colors">
                      {props.uploadingAvatar ? "Uploading..." : "Change"}
                      <input type="file" accept="image/*" className="hidden" onChange={props.handleAvatarUpload} disabled={props.uploadingAvatar} />
                    </label>
                  </div>
                </DesktopField>
                <DesktopField label="Business Name" hint="Shown to your team and customers">
                  <Input
                    value={props.businessName}
                    onChange={(e) => props.setBusinessName(e.target.value)}
                    placeholder="e.g. My Coffee Shop"
                    className="max-w-sm"
                  />
                </DesktopField>
                <div className="py-3 flex justify-end">
                  <Button onClick={props.handleSaveProfile} disabled={props.savingProfile} size="sm" className="gap-2">
                    {props.savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {props.profileSaved ? "Saved!" : "Save"}
                  </Button>
                </div>
              </DesktopCard>
            )}

            {activeSection === "timezone" && (
              <DesktopCard title="Timezone" desc="Used for scheduling and reporting">
                <DesktopField label="Timezone" hint="Your local timezone">
                  <Select value={props.timezone} onValueChange={(v) => { if (v) props.setTimezone(v); }}>
                    <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DesktopField>
                <div className="py-3 flex justify-end">
                  <Button onClick={props.handleSaveProfile} disabled={props.savingProfile} size="sm" className="gap-2">
                    {props.savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {props.profileSaved ? "Saved!" : "Save"}
                  </Button>
                </div>
              </DesktopCard>
            )}

            {activeSection === "square" && (
              <DesktopCard title="Square" desc="Connect your Square account to sync catalog and orders">
                <DesktopField label="Status" hint="Connection status">
                  <div className="flex items-center gap-2">
                    {props.settings?.squareConnected ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-[13px] text-emerald-700 font-medium">Connected</span>
                        {props.settings.squareLastSyncedAt && (
                          <span className="text-[11.5px] text-stone-500 ml-2">
                            Last synced {new Date(props.settings.squareLastSyncedAt).toLocaleDateString()}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[13px] text-stone-500">Not connected</span>
                    )}
                  </div>
                </DesktopField>
                {props.squareSyncResult && (
                  <div className="py-2">
                    <p className="text-[12px] text-stone-600">{props.squareSyncResult}</p>
                  </div>
                )}
                <div className="py-3 flex gap-2 justify-end">
                  {props.settings?.squareConnected ? (
                    <>
                      <Button onClick={props.handleSquareSync} disabled={props.squareSyncing} size="sm" variant="outline" className="gap-2">
                        {props.squareSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Sync Now
                      </Button>
                      <Button onClick={props.handleDisconnectSquare} size="sm" variant="outline" className="gap-2 text-destructive hover:text-destructive">
                        <Unlink className="h-3.5 w-3.5" />
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => { window.location.href = "/api/square/oauth/authorize"; }} size="sm" className="gap-2">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Connect Square
                    </Button>
                  )}
                </div>
              </DesktopCard>
            )}

            {activeSection === "clover" && (
              <DesktopCard title="Clover" desc="Connect your Clover account to sync items and orders">
                <DesktopField label="Status" hint="Connection status">
                  <div className="flex items-center gap-2">
                    {props.settings?.cloverConnected ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-[13px] text-emerald-700 font-medium">Connected</span>
                        {props.settings.cloverLastSyncedAt && (
                          <span className="text-[11.5px] text-stone-500 ml-2">
                            Last synced {new Date(props.settings.cloverLastSyncedAt).toLocaleDateString()}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[13px] text-stone-500">Not connected</span>
                    )}
                  </div>
                </DesktopField>
                {props.cloverSyncResult && (
                  <div className="py-2">
                    <p className="text-[12px] text-stone-600">{props.cloverSyncResult}</p>
                  </div>
                )}
                <div className="py-3 flex gap-2 justify-end">
                  {props.settings?.cloverConnected ? (
                    <>
                      <Button onClick={props.handleCloverSync} disabled={props.cloverSyncing} size="sm" variant="outline" className="gap-2">
                        {props.cloverSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Sync Now
                      </Button>
                      <Button onClick={props.handleDisconnectClover} size="sm" variant="outline" className="gap-2 text-destructive hover:text-destructive">
                        <Unlink className="h-3.5 w-3.5" />
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => { window.location.href = "/api/clover/connect"; }} size="sm" className="gap-2">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Connect Clover
                    </Button>
                  )}
                </div>
              </DesktopCard>
            )}

            {activeSection === "taxrate" && (
              <DesktopCard title="Tax Rate" desc="Configure your tax rate for transactions">
                <DesktopField label="Tax Rate (%)" hint="Applied to sales transactions">
                  <Input
                    type="number"
                    value={props.paymentTaxRate}
                    onChange={(e) => props.setPaymentTaxRate(e.target.value)}
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="0"
                    className="max-w-[120px]"
                  />
                </DesktopField>
                <div className="py-3 flex justify-end">
                  <Button onClick={props.handleSavePaymentSettings} disabled={props.savingPayment} size="sm" className="gap-2">
                    {props.savingPayment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {props.paymentSaved ? "Saved!" : "Save"}
                  </Button>
                </div>
              </DesktopCard>
            )}

            {activeSection === "currency" && (
              <DesktopCard title="Currency" desc="Set your primary currency">
                <DesktopField label="Currency" hint="Used for pricing and reporting">
                  <Select value={props.paymentCurrency} onValueChange={(v) => props.setPaymentCurrency(v ?? props.paymentCurrency)}>
                    <SelectTrigger className="max-w-[200px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD - US Dollar</SelectItem>
                      <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                      <SelectItem value="EUR">EUR - Euro</SelectItem>
                      <SelectItem value="GBP">GBP - British Pound</SelectItem>
                      <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                    </SelectContent>
                  </Select>
                </DesktopField>
                <div className="py-3 flex justify-end">
                  <Button onClick={props.handleSavePaymentSettings} disabled={props.savingPayment} size="sm" className="gap-2">
                    {props.savingPayment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {props.paymentSaved ? "Saved!" : "Save"}
                  </Button>
                </div>
              </DesktopCard>
            )}

            {activeSection === "storemachine" && (
              <DesktopCard title="Store Machine Mode" desc="Restrict this device to POS, Inventory, and Punch-in">
                <DesktopField label="Enabled" hint="Only show POS, Inventory, and Punch-in on this device">
                  <button
                    onClick={() => {
                      props.hapticSuccess();
                      if (!props.storeMachine && !props.deviceName) {
                        props.setDeviceNameInput("");
                        props.setDeviceNameDialog(true);
                        return;
                      }
                      props.setStoreMachine(!props.storeMachine);
                    }}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full border shrink-0 transition-colors ${props.storeMachine ? "bg-stone-900 border-stone-900" : "bg-white border-border"}`}
                    aria-label="Toggle store machine mode"
                  >
                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${props.storeMachine ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                </DesktopField>
              </DesktopCard>
            )}

            {activeSection === "team" && (
              <DesktopCard
                title="Team Members"
                desc={`${props.teamMembers.filter((m) => m.status === "active").length} active members`}
                right={
                  <Button onClick={() => props.setInviteDialog(true)} size="sm" variant="outline" className="gap-2">
                    <UserPlus className="h-3.5 w-3.5" />
                    Invite
                  </Button>
                }
              >
                {props.teamLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left text-[11px] font-medium text-stone-500 uppercase tracking-wide py-2 pr-3">Member</th>
                          <th className="text-left text-[11px] font-medium text-stone-500 uppercase tracking-wide py-2 pr-3">Role</th>
                          <th className="text-left text-[11px] font-medium text-stone-500 uppercase tracking-wide py-2 pr-3">Email</th>
                          <th className="text-left text-[11px] font-medium text-stone-500 uppercase tracking-wide py-2 pr-3">Status</th>
                          <th className="text-right text-[11px] font-medium text-stone-500 uppercase tracking-wide py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {props.teamMembers.filter((m) => m.status === "active").map((m) => (
                          <tr key={m.id}>
                            <td className="py-2.5 pr-3">
                              <div className="flex items-center gap-2.5">
                                <div className="h-7 w-7 rounded-full bg-stone-100 flex items-center justify-center text-[11px] font-bold text-stone-500 shrink-0">
                                  {(m.displayName || "?")[0].toUpperCase()}
                                </div>
                                <span className="text-[13px] font-medium truncate max-w-[160px]">
                                  {m.displayName || m.email}
                                  {m.userId === props.userId && <span className="text-[11px] text-stone-400 ml-1">(you)</span>}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 pr-3">
                              <Badge variant={m.role === "owner" ? "default" : "secondary"} className="text-[10px] capitalize">
                                {m.role}
                              </Badge>
                            </td>
                            <td className="py-2.5 pr-3">
                              <span className="text-[12px] text-stone-500 truncate block max-w-[200px]">{m.email}</span>
                            </td>
                            <td className="py-2.5 pr-3">
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Active
                              </span>
                            </td>
                            <td className="py-2.5 text-right">
                              <div className="flex items-center gap-2 justify-end">
                                {props.canEditTeam && m.userId !== props.userId && (
                                  <button
                                    onClick={() => { props.setResetCodeMember(m); props.setResetCodeInput(""); }}
                                    className="text-[11px] text-stone-500 hover:text-stone-900 hover:underline"
                                  >
                                    Reset code
                                  </button>
                                )}
                                {m.role !== "owner" && m.userId !== props.userId && (
                                  <button
                                    onClick={async () => {
                                      await props.removeMember(m.id);
                                      props.setTeamMembers((prev) => prev.filter((x) => x.id !== m.id));
                                    }}
                                    className="text-[11px] text-destructive hover:underline"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {props.teamInvitations.length > 0 && (
                      <div className="mt-4">
                        <div className="text-[10.5px] font-medium text-stone-500 uppercase tracking-wide mb-2">
                          Pending Invitations ({props.teamInvitations.length})
                        </div>
                        <div className="divide-y divide-border">
                          {props.teamInvitations.map((inv) => (
                            <div key={inv.id} className="flex items-center gap-3 py-2.5">
                              <div className="h-7 w-7 rounded-full bg-stone-100 flex items-center justify-center text-[11px] text-stone-400 shrink-0">
                                @
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="text-[13px] font-medium truncate block">{inv.email}</span>
                                <span className="text-[11px] text-stone-500">Expires {new Date(inv.expiresAt).toLocaleDateString()}</span>
                              </div>
                              <Badge variant="secondary" className="text-[10px] capitalize">{inv.role}</Badge>
                              <button
                                onClick={async () => {
                                  await props.cancelInvitation(inv.id);
                                  props.setTeamInvitations((prev) => prev.filter((x) => x.id !== inv.id));
                                }}
                                className="text-[11px] text-destructive hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </DesktopCard>
            )}
          </div>
    );
  };

  const detailMeta = activeSection ? sectionMeta[activeSection] : null;
  const DetailIcon = detailMeta?.icon ?? Settings;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Settings" subtitle="Configure your business, team, and integrations" />
      <div className="flex-1 overflow-auto bg-stone-50">
        <div className="max-w-6xl mx-auto px-8 py-8">
          {groups.map((group) => {
            if (group.adminOnly && !props.isAdmin) return null;
            return (
              <div key={group.title} className="mb-8">
                <h3 className="text-[10.5px] font-medium text-stone-500 uppercase tracking-wide mb-3">
                  {group.title}
                </h3>
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
                  {group.cards.map((card) => {
                    const CardIcon = card.icon;
                    return (
                      <button
                        key={card.id}
                        onClick={() => handleCardClick(card.id)}
                        className="group text-left bg-white border border-border rounded-[0.3rem] p-4 hover:border-stone-400 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <div className="h-9 w-9 rounded-[0.3rem] bg-stone-100 group-hover:bg-stone-900 group-hover:text-white flex items-center justify-center shrink-0 transition-colors">
                            <CardIcon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[14px] font-semibold truncate">{card.label}</div>
                            <div className="text-[11.5px] text-stone-500 mt-0.5 truncate">{card.desc}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Detail dialog ─── */}
      <Dialog open={!!activeSection} onOpenChange={(o) => { if (!o) setActiveSection(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-[0.3rem] bg-stone-900 text-white flex items-center justify-center shrink-0">
                <DetailIcon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[16px] font-semibold">{detailMeta?.title}</div>
                <div className="text-[12px] text-stone-500 font-normal">{detailMeta?.desc}</div>
              </div>
            </DialogTitle>
            <DialogDescription className="hidden">{detailMeta?.desc}</DialogDescription>
          </DialogHeader>
          {renderDetail()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

