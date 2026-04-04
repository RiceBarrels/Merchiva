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
import { createClient } from "@/lib/supabase/client";
import {
  getSettings,
  upsertSettings,
  disconnectSquare,
  disconnectClover,
  type UserSettings,
} from "@/lib/db/settings";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PermissionGuard } from "@/components/permission-guard";
import {
  getMyAvailability, upsertAvailability,
  getTimeOffRequests, createTimeOffRequest,
} from "@/lib/db/availability";
import {
  getTeamMembers, getInvitations, updateMember, removeMember, cancelInvitation,
} from "@/lib/db/team";
import type { OrgMember, OrgInvitation, OrgRole, Permissions } from "@/lib/types";
import { defaultPermissions } from "@/lib/db/team";
import { usePermissions } from "@/lib/context/permissions";
import { hapticSuccess } from "@/lib/haptics";

interface SquareLocation {
  id: string;
  name: string;
  address: string | null;
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const { role, organizationId } = usePermissions();
  const isAdmin = role === "owner" || role === "manager";
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading]   = useState(true);
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

  // Square OAuth feedback
  const [squareMessage, setSquareMessage] = useState<string | null>(null);
  const [squareError, setSquareError] = useState<string | null>(null);

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
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Square sync
  const [squareSyncing, setSquareSyncing] = useState(false);
  const [squareSyncResult, setSquareSyncResult] = useState<string | null>(null);

  // Clover OAuth feedback
  const [cloverMessage, setCloverMessage] = useState<string | null>(null);
  const [cloverError, setCloverError] = useState<string | null>(null);

  // Clover sync
  const [cloverSyncing, setCloverSyncing] = useState(false);
  const [cloverSyncResult, setCloverSyncResult] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        setUserEmail(user.email ?? "");
        // Load avatar
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("avatar_url")
          .eq("user_id", user.id)
          .maybeSingle();
        if (profile?.avatar_url) setAvatarUrl(profile.avatar_url);
      }
    });
    getSettings()
      .then((s) => {
        setSettings(s);
        if (s) {
          setBusinessName(s.businessName ?? "");
          setTimezone(s.timezone);
        }
      })
      .catch((err) => console.error("Failed to load settings:", err))
      .finally(() => setLoading(false));
  }, []);

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
      setSquareMessage("Square connected successfully!");
      setTimeout(() => setSquareMessage(null), 5000);
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
      setSquareError(messages[err!] ?? "An error occurred connecting to Square.");
    }
    if (searchParams.get("pickLocation") === "true") {
      setShowLocationPicker(true);
      fetchLocations();
    }

    // Clover
    if (searchParams.get("clover_connected") === "true") {
      setCloverMessage("Clover connected successfully!");
      setTimeout(() => setCloverMessage(null), 5000);
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
      setCloverError(messages[err!] ?? "An error occurred connecting to Clover.");
    }
  }, [searchParams]);

  const fetchLocations = async () => {
    setLoadingLocations(true);
    try {
      const res = await fetch("/api/square/oauth/locations");
      const json = await res.json();
      setLocations(json.locations ?? []);
    } catch {
      setSquareError("Failed to load locations.");
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
        setSquareMessage("Square connected successfully!");
        setTimeout(() => setSquareMessage(null), 5000);
        const updated = await getSettings();
        setSettings(updated);
      } else {
        const err = await res.json();
        setSquareError(err.error ?? "Failed to select location.");
      }
    } catch {
      setSquareError("Failed to select location.");
    } finally {
      setSelectingLocation(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!userId) return;
    setSavingProfile(true);
    try {
      await upsertSettings(userId, { businessName, timezone });
      setSettings((prev) =>
        prev ? { ...prev, businessName, timezone } : null
      );
      hapticSuccess();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    // Validate
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) return; // 5MB max

    setUploadingAvatar(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${userId}/avatar.${ext}`;

      // Upload (upsert)
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

      // Add cache buster
      const url = `${publicUrl}?t=${Date.now()}`;

      // Save to profile
      await supabase
        .from("user_profiles")
        .update({ avatar_url: url })
        .eq("user_id", userId);

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
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, permissions: invitePerms }),
      });
      const json = await res.json();
      if (!res.ok) { setInviteError(json.error ?? "Failed"); return; }
      setInviteDialog(false);
      setInviteEmail("");
      setInviteRole("staff");
      setInvitePerms(defaultPermissions());
      loadTeam();
    } catch {
      setInviteError("Failed to send invitation.");
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
    <div className="max-w-2xl mx-auto">
      {/* ─── Profile Header ─────────────────────────────────── */}
      <div className="flex flex-col items-center py-8 bg-gradient-to-b from-stone-100 to-background">
        <div className="relative">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="h-20 w-20 rounded-full object-cover border-2 border-white shadow" />
          ) : (
            <div className="h-20 w-20 rounded-full bg-stone-200 flex items-center justify-center text-2xl font-bold text-stone-500 border-2 border-white shadow">
              {userEmail?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <label className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 shadow">
            {uploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
          </label>
        </div>
        <p className="mt-3 text-base font-semibold">{businessName || userEmail}</p>
        <p className="text-xs text-muted-foreground">{userEmail}</p>
      </div>

      {/* ─── Account Section ───────────────────────────────── */}
      <div className="bg-muted/40 px-4 py-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account</p>
      </div>
      <div className="divide-y divide-border bg-card">
        <SettingsRow icon={Settings} label="Business Name" detail={businessName || "Not set"}>
          <Input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. My Coffee Shop"
            className="mt-2"
          />
        </SettingsRow>
        <SettingsRow icon={Clock} label="Timezone" detail={timezone}>
          <Select value={timezone} onValueChange={(v) => { if (v) setTimezone(v); }}>
            <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[
                "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
                "America/Anchorage", "Pacific/Honolulu", "America/Phoenix",
                "America/Toronto", "America/Vancouver",
                "Europe/London", "Europe/Paris", "Europe/Berlin",
                "Asia/Tokyo", "Asia/Shanghai", "Asia/Singapore", "Asia/Seoul",
                "Australia/Sydney", "Australia/Melbourne",
                "Pacific/Auckland",
              ].map((tz) => (
                <SelectItem key={tz} value={tz}>{tz.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
        <div className="px-4 py-3">
          <Button onClick={handleSaveProfile} disabled={savingProfile} size="sm" className="w-full gap-2">
            {savingProfile ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {profileSaved ? "Saved!" : "Save Profile"}
          </Button>
        </div>
      </div>

      {/* ─── Scheduling ─────────────────────────────────────── */}
      <div className="bg-muted/40 px-4 py-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scheduling</p>
      </div>
      <div className="divide-y divide-border bg-card">
        <button onClick={() => setAvailDialog(true)} className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-muted/50 transition-colors text-left">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 shrink-0">
            <Star className="h-4 w-4 text-stone-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Availability</p>
            <p className="text-xs text-muted-foreground">Set your weekly availability</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
        <button onClick={() => { setTimeOffForm({ fullDays: true, startDate: new Date().toISOString().split("T")[0], endDate: new Date().toISOString().split("T")[0], startTime: "09:00", endTime: "17:00", comments: "" }); setTimeOffDialog(true); }} className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-muted/50 transition-colors text-left">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 shrink-0">
            <Clock className="h-4 w-4 text-stone-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Time Off</p>
            <p className="text-xs text-muted-foreground">Request time off or view pending requests</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </div>

      {/* ─── POS Integrations (admin only) ─────────────────── */}
      {isAdmin && (<>
      <div className="bg-muted/40 px-4 py-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">POS Integrations</p>
      </div>
      <div className="divide-y divide-border bg-card">
        {/* Square */}
        <button
          onClick={() => {
            if (settings?.squareConnected) { handleSquareSync(); }
            else { window.location.href = "/api/square/oauth/authorize"; }
          }}
          className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-muted/50 transition-colors text-left"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-black shrink-0">
            <span className="text-white text-xs font-bold">SQ</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Square</p>
            <p className="text-xs text-muted-foreground">
              {settings?.squareConnected
                ? squareSyncing ? "Syncing…" : settings.squareLastSyncedAt ? `Synced ${new Date(settings.squareLastSyncedAt).toLocaleDateString()}` : "Connected"
                : "Connect to sync catalog & orders"
              }
            </p>
          </div>
          {settings?.squareConnected ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          ) : (
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>
        {settings?.squareConnected && (
          <button onClick={handleDisconnectSquare} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-muted/50 transition-colors text-left">
            <div className="w-9" />
            <p className="text-xs text-destructive">Disconnect Square</p>
          </button>
        )}

        {/* Clover */}
        <button
          onClick={() => {
            if (settings?.cloverConnected) { handleCloverSync(); }
            else { window.location.href = "/api/clover/connect"; }
          }}
          className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-muted/50 transition-colors text-left"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1DA462] shrink-0">
            <span className="text-white text-xs font-bold">CL</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Clover</p>
            <p className="text-xs text-muted-foreground">
              {settings?.cloverConnected
                ? cloverSyncing ? "Syncing…" : settings.cloverLastSyncedAt ? `Synced ${new Date(settings.cloverLastSyncedAt).toLocaleDateString()}` : "Connected"
                : "Connect to sync items & orders"
              }
            </p>
          </div>
          {settings?.cloverConnected ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          ) : (
            <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>
        {settings?.cloverConnected && (
          <button onClick={handleDisconnectClover} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-muted/50 transition-colors text-left">
            <div className="w-9" />
            <p className="text-xs text-destructive">Disconnect Clover</p>
          </button>
        )}
      </div>

      {/* ─── AI ───────────────────────────────────────────── */}
      <div className="bg-muted/40 px-4 py-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Features</p>
      </div>
      <div className="divide-y divide-border bg-card">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 shrink-0">
            <Zap className="h-4 w-4 text-stone-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Claude AI</p>
            <p className="text-xs text-muted-foreground">Sales forecasting, staffing recommendations, and alerts — built in.</p>
          </div>
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        </div>
      </div>
      </>)}

      {/* ─── Team (admin only) ────────────────────────────── */}
      {isAdmin && (
      <>
      <div className="bg-muted/40 px-4 py-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Team</p>
      </div>
      <div className="divide-y divide-border bg-card">
        <button onClick={() => setTeamDialog(true)} className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-muted/50 transition-colors text-left">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 shrink-0">
            <Users className="h-4 w-4 text-stone-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Team Members</p>
            <p className="text-xs text-muted-foreground">Manage members, roles, and invitations</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </div>
      </>
      )}

      <div className="h-8" />
    </div>

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
                          ✉
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
                { key: "dashboard" as const, label: "Dashboard", hasEdit: false },
                { key: "inventory" as const, label: "Inventory", hasEdit: true },
                { key: "sales" as const, label: "Sales", hasEdit: false },
                { key: "staffing" as const, label: "Staffing", hasEdit: true },
                { key: "products" as const, label: "Products", hasEdit: true },
                { key: "settings" as const, label: "Settings", hasEdit: false },
              ]).map(({ key, label, hasEdit }) => (
                <div key={key} className="flex items-center gap-3 px-1 py-1.5 rounded hover:bg-muted/50">
                  <span className="text-sm flex-1">{label}</span>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={invitePerms[key]?.view === true}
                      onChange={() => {
                        const sec = { ...invitePerms[key] };
                        sec.view = !sec.view;
                        if (!sec.view) sec.edit = false;
                        setInvitePerms({ ...invitePerms, [key]: sec });
                      }}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                    View
                  </label>
                  {hasEdit && (
                    <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={invitePerms[key]?.edit === true}
                        onChange={() => {
                          const sec = { ...invitePerms[key] };
                          sec.edit = !sec.edit;
                          if (sec.edit) sec.view = true;
                          setInvitePerms({ ...invitePerms, [key]: sec });
                        }}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      Edit
                    </label>
                  )}
                </div>
              ))}
            </div>
          </div>
          {inviteError && (
            <p className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{inviteError}</p>
          )}
          <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="w-full">
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send Invitation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    </>
  );
}

function SettingsRow({
  icon: Icon,
  label,
  detail,
  children,
}: {
  icon: React.ElementType;
  label: string;
  detail?: string;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 w-full px-4 py-3.5 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-100 shrink-0">
          <Icon className="h-4 w-4 text-stone-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{label}</p>
          {detail && <p className="text-xs text-muted-foreground truncate">{detail}</p>}
        </div>
        <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>
      {expanded && children && (
        <div className="px-4 pb-3 pl-16">
          {children}
        </div>
      )}
    </div>
  );
}
