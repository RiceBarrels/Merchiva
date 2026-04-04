"use client";

import { useState, useEffect } from "react";
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
import { PermissionGuard } from "@/components/permission-guard";
import { hapticSuccess } from "@/lib/haptics";

interface SquareLocation {
  id: string;
  name: string;
  address: string | null;
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <PermissionGuard section="settings">
    <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Manage your account and integrations
        </p>
      </div>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" /> Account
          </CardTitle>
          <CardDescription>Your profile and business details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="h-16 w-16 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground">
                  {userEmail?.[0]?.toUpperCase() ?? "?"}
                </div>
              )}
              <label className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 shadow-sm">
                {uploadingAvatar ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Camera className="h-3 w-3" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                  disabled={uploadingAvatar}
                />
              </label>
            </div>
            <div>
              <p className="text-sm font-medium">{userEmail}</p>
              <p className="text-xs text-muted-foreground">Click the camera icon to upload a photo</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Business Name</Label>
            <Input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. My Coffee Shop"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. America/Los_Angeles"
            />
            <p className="text-xs text-muted-foreground">
              Used for daily sales aggregation and forecasting.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSaveProfile} disabled={savingProfile} className="gap-2">
              {savingProfile ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Profile
            </Button>
            {profileSaved && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                Saved
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* POS Integrations */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">POS Integrations</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Connect your point-of-sale system to sync products, inventory, and sales.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* ── Square Card ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded bg-black shrink-0">
                  <span className="text-white text-[9px] font-bold">SQ</span>
                </div>
                Square
                {settings?.squareConnected ? (
                  <Badge className="ml-auto gap-1 text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    Not connected
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Sync catalog, inventory counts, and orders.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {squareMessage && (
                <p className="text-xs font-medium rounded px-2.5 py-1.5 bg-emerald-50 text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {squareMessage}
                </p>
              )}
              {squareError && (
                <p className="text-xs text-destructive rounded bg-destructive/10 px-2.5 py-1.5 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {squareError}
                </p>
              )}

              {settings?.squareConnected && showLocationPicker ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium">Select a location</p>
                  {loadingLocations ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading…
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {locations.map((loc) => (
                        <button
                          key={loc.id}
                          onClick={() => handleSelectLocation(loc.id)}
                          disabled={selectingLocation}
                          className="w-full text-left rounded-sm border border-stone-200 px-2.5 py-2 hover:bg-stone-50 transition-colors disabled:opacity-50"
                        >
                          <p className="text-xs font-medium flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 text-stone-500" />
                            {loc.name}
                          </p>
                          {loc.address && (
                            <p className="text-[10px] text-stone-500 mt-0.5 pl-4">{loc.address}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : settings?.squareConnected ? (
                <div className="space-y-3">
                  <div className="rounded-sm bg-stone-50 border border-stone-200 px-2.5 py-2 space-y-0.5">
                    {settings.squareMerchantId && (
                      <p className="text-[11px] text-stone-600">
                        Merchant: <code className="font-mono">{settings.squareMerchantId}</code>
                      </p>
                    )}
                    {settings.squareLastSyncedAt && (
                      <p className="text-[11px] text-stone-500">
                        Synced {new Date(settings.squareLastSyncedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleSquareSync}
                      disabled={squareSyncing}
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-7"
                    >
                      {squareSyncing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      {squareSyncing ? "Syncing…" : "Sync Now"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-7 text-destructive hover:text-destructive"
                      onClick={handleDisconnectSquare}
                    >
                      <Unlink className="h-3 w-3" />
                      Disconnect
                    </Button>
                  </div>
                  {squareSyncResult && (
                    <p
                      className={`text-xs rounded px-2.5 py-1.5 ${
                        squareSyncResult.startsWith("Error")
                          ? "bg-destructive/10 text-destructive"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {squareSyncResult}
                    </p>
                  )}
                </div>
              ) : (
                <a href="/api/square/oauth/authorize">
                  <Button size="sm" className="gap-1.5 text-xs h-7">
                    <ExternalLink className="h-3 w-3" />
                    Connect Square
                  </Button>
                </a>
              )}
            </CardContent>
          </Card>

          {/* ── Clover Card ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded bg-[#1DA462] shrink-0">
                  <span className="text-white text-[9px] font-bold">CL</span>
                </div>
                Clover
                {settings?.cloverConnected ? (
                  <Badge className="ml-auto gap-1 text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    Not connected
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Sync items, stock levels, and orders.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {cloverMessage && (
                <p className="text-xs font-medium rounded px-2.5 py-1.5 bg-emerald-50 text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {cloverMessage}
                </p>
              )}
              {cloverError && (
                <p className="text-xs text-destructive rounded bg-destructive/10 px-2.5 py-1.5 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  {cloverError}
                </p>
              )}

              {settings?.cloverConnected ? (
                <div className="space-y-3">
                  <div className="rounded-sm bg-stone-50 border border-stone-200 px-2.5 py-2 space-y-0.5">
                    {settings.cloverMerchantId && (
                      <p className="text-[11px] text-stone-600">
                        Merchant: <code className="font-mono">{settings.cloverMerchantId}</code>
                      </p>
                    )}
                    {settings.cloverLastSyncedAt && (
                      <p className="text-[11px] text-stone-500">
                        Synced {new Date(settings.cloverLastSyncedAt).toLocaleString()}
                      </p>
                    )}
                    {!settings.cloverLastSyncedAt && (
                      <p className="text-[11px] text-stone-400 italic">Never synced</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleCloverSync}
                      disabled={cloverSyncing}
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-7"
                    >
                      {cloverSyncing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      {cloverSyncing ? "Syncing…" : "Sync Now"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-7 text-destructive hover:text-destructive"
                      onClick={handleDisconnectClover}
                    >
                      <Unlink className="h-3 w-3" />
                      Disconnect
                    </Button>
                  </div>
                  {cloverSyncResult && (
                    <p
                      className={`text-xs rounded px-2.5 py-1.5 ${
                        cloverSyncResult.startsWith("Error")
                          ? "bg-destructive/10 text-destructive"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {cloverSyncResult}
                    </p>
                  )}
                </div>
              ) : (
                <a href="/api/clover/connect">
                  <Button size="sm" className="gap-1.5 text-xs h-7">
                    <ExternalLink className="h-3 w-3" />
                    Connect Clover
                  </Button>
                </a>
              )}
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Claude AI info */}
      <Card>
        <CardContent className="p-3 flex gap-2.5">
          <Zap className="h-4 w-4 text-stone-500 mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-stone-800">Claude AI Integration</p>
            <p className="text-sm text-stone-600 leading-relaxed">
              BizOps uses Claude to analyze your sales history and inventory data to generate
              demand forecasts, staffing recommendations, and product performance alerts.
              No API key needed — AI features are built in.
            </p>
            <p className="text-xs text-stone-400 mt-1">
              Planned: Weather API · Google Maps foot traffic · Holiday calendar
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
    </PermissionGuard>
  );
}
