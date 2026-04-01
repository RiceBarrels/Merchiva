"use client";

import { useState, useEffect } from "react";
import {
  Settings,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Unlink,
  Link,
  Save,
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
  saveSquareCredentials,
  disconnectSquare,
  type UserSettings,
} from "@/lib/db/settings";

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [userId, setUserId]     = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");

  // Profile form
  const [businessName, setBusinessName] = useState("");
  const [timezone, setTimezone]         = useState("America/Los_Angeles");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved]   = useState(false);

  // Square form
  const [accessToken, setAccessToken] = useState("");
  const [locationId, setLocationId]   = useState("");
  const [connectingSquare, setConnectingSquare] = useState(false);
  const [squareError, setSquareError]  = useState<string | null>(null);

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

  const handleConnectSquare = async () => {
    if (!userId || !accessToken || !locationId) {
      setSquareError("Both Access Token and Location ID are required.");
      return;
    }
    setConnectingSquare(true);
    setSquareError(null);
    try {
      // Verify credentials before saving
      const res = await fetch("/api/square/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, locationId }),
      });
      if (!res.ok) {
        const err = await res.json();
        setSquareError(err.error ?? "Invalid credentials. Check your token and location ID.");
        return;
      }
      await saveSquareCredentials(userId, accessToken, locationId);
      setSettings((prev) =>
        prev
          ? { ...prev, squareConnected: true, squareLocationId: locationId }
          : null
      );
      setAccessToken("");
      setLocationId("");
    } catch {
      setSquareError("Connection failed. Please try again.");
    } finally {
      setConnectingSquare(false);
    }
  };

  const handleDisconnectSquare = async () => {
    if (!userId) return;
    await disconnectSquare(userId);
    setSettings((prev) =>
      prev ? { ...prev, squareConnected: false, squareLocationId: null, squareLastSyncedAt: null } : null
    );
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/square/sync", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        setSyncResult(json.message);
        // Refresh last synced
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
          {settings?.squareConnected ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 space-y-1">
                <p className="text-sm font-medium text-emerald-800">
                  Square is connected
                </p>
                {settings.squareLocationId && (
                  <p className="text-xs text-emerald-700">
                    Location ID: <code className="font-mono">{settings.squareLocationId}</code>
                  </p>
                )}
                {settings.squareLastSyncedAt && (
                  <p className="text-xs text-emerald-700">
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
                    Removes credentials from BizOps. Your Square account is unaffected.
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
              <div className="rounded-lg bg-muted/50 border border-border p-4 space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">How to connect Square:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Go to developer.squareup.com → Applications → your app</li>
                  <li>Copy your <strong>Production Access Token</strong></li>
                  <li>Find your <strong>Location ID</strong> in the Square dashboard → Locations</li>
                  <li>Paste both below and click Connect</li>
                </ol>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Production Access Token</Label>
                  <Input
                    type="password"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="sq0atp-…"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Location ID</Label>
                  <Input
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    placeholder="L…"
                  />
                </div>
              </div>

              {squareError && (
                <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  {squareError}
                </p>
              )}

              <Button
                onClick={handleConnectSquare}
                disabled={connectingSquare || !accessToken || !locationId}
                className="gap-2"
              >
                {connectingSquare ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link className="h-4 w-4" />
                )}
                {connectingSquare ? "Connecting…" : "Connect Square"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Integration info */}
      <Card className="border-violet-200 bg-violet-50/40">
        <CardContent className="p-4 flex gap-3">
          <Zap className="h-5 w-5 text-violet-600 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-violet-900">Claude AI Integration</p>
            <p className="text-sm text-violet-800 leading-relaxed">
              BizOps uses Claude to analyze your sales history and inventory data to generate
              demand forecasts, staffing recommendations, and product performance alerts.
              No API key needed — AI features are built in.
            </p>
            <p className="text-xs text-violet-600 mt-1">
              Planned: Weather API · Google Maps foot traffic · Holiday calendar
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
