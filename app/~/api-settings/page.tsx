"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Key,
  Copy,
  Trash2,
  Plus,
  Check,
  Globe,
  TestTube,
  Eye,
  EyeOff,
  Webhook,
  ShieldCheck,
  Loader2,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/lib/context/permissions";
import { useT } from "@/lib/i18n/context";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ApiKeyData {
  key: string;
  createdAt: string;
}

interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
}

const WEBHOOK_EVENTS = [
  "order.created",
  "inventory.low",
  "shift.changed",
  "payment.completed",
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateHex(len: number): string {
  const arr = new Uint8Array(len / 2);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function maskKey(key: string): string {
  if (key.length <= 12) return key;
  return key.slice(0, 7) + "****...****" + key.slice(-4);
}

function samplePayload(event: string): object {
  const base = { id: "evt_" + generateHex(8), type: event, created: new Date().toISOString() };
  switch (event) {
    case "order.created":
      return { ...base, data: { orderId: "ord_abc123", total: 24.5, items: 3, currency: "USD" } };
    case "inventory.low":
      return { ...base, data: { itemId: "inv_xyz", name: "Oat Milk", currentStock: 2, minStock: 10 } };
    case "shift.changed":
      return { ...base, data: { shiftId: "shf_001", staffName: "Jane D.", date: "2026-05-03", oldTime: "09:00-17:00", newTime: "10:00-18:00" } };
    case "payment.completed":
      return { ...base, data: { paymentId: "pay_def456", amount: 18.75, method: "card", status: "completed" } };
    default:
      return base;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ApiSettingsPage() {
  const t = useT();
  const { organizationId } = usePermissions();

  // API Keys state
  const [apiKey, setApiKey] = useState<ApiKeyData | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);

  // Webhooks state
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>([]);
  const [testPayload, setTestPayload] = useState<{ event: string; payload: object } | null>(null);

  // Load from localStorage
  useEffect(() => {
    if (!organizationId) return;
    try {
      const stored = localStorage.getItem(`api_key_${organizationId}`);
      if (stored) setApiKey(JSON.parse(stored));
      const wh = localStorage.getItem(`webhooks_${organizationId}`);
      if (wh) setWebhooks(JSON.parse(wh));
    } catch { /* ignore */ }
  }, [organizationId]);

  const saveWebhooks = useCallback(
    (wh: WebhookConfig[]) => {
      setWebhooks(wh);
      if (organizationId) {
        localStorage.setItem(`webhooks_${organizationId}`, JSON.stringify(wh));
      }
    },
    [organizationId],
  );

  const handleGenerateKey = () => {
    const key = "sk_live_" + generateHex(32);
    const data: ApiKeyData = { key, createdAt: new Date().toISOString() };
    setApiKey(data);
    setShowKey(true);
    if (organizationId) {
      localStorage.setItem(`api_key_${organizationId}`, JSON.stringify(data));
    }
    toast.success("API key generated");
  };

  const handleRevokeKey = () => {
    setApiKey(null);
    setShowKey(false);
    if (organizationId) {
      localStorage.removeItem(`api_key_${organizationId}`);
    }
    toast.success("API key revoked");
  };

  const handleCopyKey = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey.key);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddWebhook = () => {
    if (!newUrl.trim()) {
      toast.error("URL is required");
      return;
    }
    if (newEvents.length === 0) {
      toast.error("Select at least one event");
      return;
    }
    const wh: WebhookConfig = {
      id: "wh_" + generateHex(8),
      url: newUrl.trim(),
      events: [...newEvents],
      secret: "whsec_" + generateHex(16),
      active: true,
    };
    saveWebhooks([...webhooks, wh]);
    setNewUrl("");
    setNewEvents([]);
    toast.success("Webhook added");
  };

  const handleDeleteWebhook = (id: string) => {
    saveWebhooks(webhooks.filter((w) => w.id !== id));
    toast.success("Webhook removed");
  };

  const handleToggleWebhook = (id: string) => {
    saveWebhooks(webhooks.map((w) => (w.id === id ? { ...w, active: !w.active } : w)));
  };

  const handleTestWebhook = (wh: WebhookConfig) => {
    const event = wh.events[0] ?? "order.created";
    setTestPayload({ event, payload: samplePayload(event) });
  };

  const toggleEvent = (event: string) => {
    setNewEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  return (
    <PermissionGuard section="settings">
      <div className="">
        <PageHeader title="API & Webhooks" subtitle="Manage API keys and webhook integrations" />

        <div className="px-4 sm:px-6 pb-6">
          <Tabs defaultValue="keys" className="space-y-4">
            <TabsList>
              <TabsTrigger value="keys" className="gap-1.5">
                <Key className="h-3.5 w-3.5" />
                API Keys
              </TabsTrigger>
              <TabsTrigger value="webhooks" className="gap-1.5">
                <Webhook className="h-3.5 w-3.5" />
                Webhooks
              </TabsTrigger>
            </TabsList>

            {/* ─── API Keys Tab ─────────────────────────────────────────────── */}
            <TabsContent value="keys" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">API Key</CardTitle>
                  <CardDescription>
                    Use this key to authenticate requests to the Merchiva API.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {apiKey ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 font-mono text-sm bg-muted rounded-[0.3rem] px-3 py-2 border border-border truncate">
                          {showKey ? apiKey.key : maskKey(apiKey.key)}
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => setShowKey((v) => !v)}
                        >
                          {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={handleCopyKey}
                        >
                          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Created {new Date(apiKey.createdAt).toLocaleDateString()}
                        </p>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive gap-1.5" onClick={handleRevokeKey}>
                          <Trash2 className="h-3.5 w-3.5" />
                          Revoke
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button onClick={handleGenerateKey} className="gap-1.5">
                      <Plus className="h-4 w-4" />
                      Generate API Key
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Usage docs */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Usage</CardTitle>
                  <CardDescription>How to authenticate with the Merchiva API</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Authentication</p>
                    <div className="bg-muted rounded-[0.3rem] p-3 border border-border">
                      <code className="text-xs font-mono text-foreground whitespace-pre">
                        {`Authorization: Bearer sk_live_****`}
                      </code>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Available Endpoints</p>
                    <div className="space-y-1">
                      {[
                        { method: "GET", path: "/api/v1/products", desc: "List products" },
                        { method: "GET", path: "/api/v1/inventory", desc: "List inventory items" },
                        { method: "GET", path: "/api/v1/orders", desc: "List recent orders" },
                        { method: "POST", path: "/api/v1/orders", desc: "Create order" },
                        { method: "GET", path: "/api/v1/staff", desc: "List staff members" },
                      ].map((ep) => (
                        <div key={ep.path + ep.method} className="flex items-center gap-2 text-sm">
                          <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 w-12 justify-center shrink-0">
                            {ep.method}
                          </Badge>
                          <code className="font-mono text-xs text-muted-foreground">{ep.path}</code>
                          <span className="text-xs text-muted-foreground ml-auto">{ep.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-2.5 rounded-[0.3rem] bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                    <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                      This is a placeholder implementation. In production, API keys would be stored server-side with proper hashing and rate limiting.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── Webhooks Tab ──────────────────────────────────────────────── */}
            <TabsContent value="webhooks" className="space-y-4">
              {/* Add webhook */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Add Webhook</CardTitle>
                  <CardDescription>
                    Receive notifications when events occur in your store.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Endpoint URL</Label>
                    <Input
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      placeholder="https://your-server.com/webhooks/merchiva"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Events</Label>
                    <div className="flex flex-wrap gap-2">
                      {WEBHOOK_EVENTS.map((event) => (
                        <button
                          key={event}
                          type="button"
                          onClick={() => toggleEvent(event)}
                          className={`px-2.5 py-1 text-xs font-mono rounded-[0.3rem] border transition-colors ${
                            newEvents.includes(event)
                              ? "bg-foreground text-background border-foreground"
                              : "bg-card border-border text-muted-foreground hover:border-muted-foreground"
                          }`}
                        >
                          {event}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Button onClick={handleAddWebhook} size="sm" className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Add Webhook
                  </Button>
                </CardContent>
              </Card>

              {/* Webhook list */}
              {webhooks.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Configured Webhooks</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {webhooks.map((wh) => (
                      <div
                        key={wh.id}
                        className="border border-border rounded-[0.3rem] p-3 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm font-mono truncate flex-1">{wh.url}</span>
                          <Badge variant={wh.active ? "default" : "outline"} className="text-[10px] shrink-0">
                            {wh.active ? "Active" : "Paused"}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {wh.events.map((ev) => (
                            <Badge key={ev} variant="outline" className="text-[10px] font-mono">
                              {ev}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => handleTestWebhook(wh)}
                          >
                            <TestTube className="h-3 w-3" />
                            Test
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleToggleWebhook(wh.id)}
                          >
                            {wh.active ? "Pause" : "Enable"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                            onClick={() => handleDeleteWebhook(wh.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Test payload display */}
              {testPayload && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Sample Payload</CardTitle>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setTestPayload(null)}>
                        Dismiss
                      </Button>
                    </div>
                    <CardDescription>
                      This is what would be sent for a <code className="font-mono text-xs">{testPayload.event}</code> event.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-muted rounded-[0.3rem] p-3 border border-border text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(testPayload.payload, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}

              {webhooks.length === 0 && (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center space-y-2">
                    <Webhook className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
                    <p className="text-sm font-medium">No webhooks configured</p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Add a webhook endpoint above to receive real-time notifications about store events.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PermissionGuard>
  );
}
