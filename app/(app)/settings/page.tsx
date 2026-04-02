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
  type UserSettings,
} from "@/lib/db/settings";
import { PermissionGuard } from "@/components/permission-guard";

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

  // Square OAuth feedback
  const [squareMessage, setSquareMessage] = useState<string | null>(null);
  const [squareError, setSquareError] = useState<string | null>(null);

  // Location picker
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locations, setLocations] = useState<SquareLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [selectingLocation, setSelectingLocation] = useState(false);

  // Sync state
  const [syncing, setSyncing]   = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        setUserEmail(user.email ?? "");
      }
    });
    getSettings().then((s) => {
      setSettings(s);
      if (s) {
        setBusinessName(s.businessName ?? "");
        setTimezone(s.timezone);
      }
      setLoading(false);
    });
  }, []);

  // Handle OAuth redirect query params
  useEffect(() => {
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
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDisconnectSquare = async () => {
    if (!userId) return;
    await disconnectSquare(userId);
    setSettings((prev) =>
      prev ? { ...prev, squareConnected: false, squareMerchantId: null, squareLocationId: null, squareLastSyncedAt: null } : null
    );
    setShowLocationPicker(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/square/sync", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setSyncResult(json.message);
        const updated = await getSettings();
        setSettings(updated);
      } else {
        setSyncResult(`Error: ${json.error}`);
      }
    } catch {
      setSyncResult("Sync failed. Check your connection and try again.");
    } finally {
      setSyncing(false);
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
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={userEmail} disabled className="bg-muted text-muted-foreground" />
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

      {/* Square Integration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-black">
              <span className="text-white text-[9px] font-bold">SQ</span>
            </div>
            Square Integration
            {settings?.squareConnected ? (
              <Badge className="ml-auto gap-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                <CheckCircle2 className="h-3 w-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="secondary" className="ml-auto">Not connected</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Connect your Square account to automatically sync products, inventory
            counts, and sales history into BizOps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {squareMessage && (
            <p className="text-sm font-medium rounded-lg px-3 py-2 bg-emerald-50 text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {squareMessage}
            </p>
          )}

          {squareError && (
            <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              {squareError}
            </p>
          )}

          {settings?.squareConnected && showLocationPicker ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium">Select a Location</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your Square account has multiple locations. Choose one to sync with BizOps.
                </p>
              </div>

              {loadingLocations ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading locations…
                </div>
              ) : (
                <div className="space-y-2">
                  {locations.map((loc) => (
                    <button
                      key={loc.id}
                      onClick={() => handleSelectLocation(loc.id)}
                      disabled={selectingLocation}
                      className="w-full text-left rounded-sm border border-stone-200 p-3 hover:bg-stone-50 transition-colors disabled:opacity-50"
                    >
                      <p className="text-sm font-medium flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-stone-500" />
                        {loc.name}
                      </p>
                      {loc.address && (
                        <p className="text-xs text-stone-500 mt-0.5 ml-5.5">{loc.address}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : settings?.squareConnected ? (
            <div className="space-y-4">
              <div className="rounded-sm bg-stone-50 border border-stone-200 p-3 space-y-1">
                <p className="text-sm font-medium text-stone-800">
                  Square is connected
                </p>
                {settings.squareMerchantId && (
                  <p className="text-xs text-stone-600">
                    Merchant: <code className="font-mono">{settings.squareMerchantId}</code>
                  </p>
                )}
                {settings.squareLocationId && (
                  <p className="text-xs text-stone-600">
                    Location: <code className="font-mono">{settings.squareLocationId}</code>
                  </p>
                )}
                {settings.squareLastSyncedAt && (
                  <p className="text-xs text-stone-600">
                    Last synced:{" "}
                    {new Date(settings.squareLastSyncedAt).toLocaleString()}
                  </p>
                )}
              </div>

              {/* Sync */}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Sync Data</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pull your latest catalog, inventory, and orders into BizOps.
                  </p>
                </div>
                <Button
                  onClick={handleSync}
                  disabled={syncing}
                  variant="outline"
                  className="gap-2"
                >
                  {syncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {syncing ? "Syncing…" : "Sync Now"}
                </Button>
                {syncResult && (
                  <p
                    className={`text-sm font-medium rounded-lg px-3 py-2 ${
                      syncResult.startsWith("Error")
                        ? "bg-destructive/10 text-destructive"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {syncResult}
                  </p>
                )}
              </div>

              <Separator />

              {/* Disconnect */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Disconnect Square</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Revokes access and removes credentials. Your Square account is unaffected.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={handleDisconnectSquare}
                >
                  <Unlink className="h-3.5 w-3.5" />
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect your Square account to automatically sync products, inventory, and sales into BizOps.
              </p>

              <a href="/api/square/oauth/authorize">
                <Button className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Connect Square
                </Button>
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Integration info */}
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
