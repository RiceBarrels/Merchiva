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
  Server,
  PlugZap,
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
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { usePermissions } from "@/lib/context/permissions";
import { useT } from "@/lib/i18n/context";
import { loadStoredMcpServers, saveStoredMcpServers } from "@/lib/merchiva/mcp/config";
import type { McpServerConfig, McpToolInfo } from "@/lib/merchiva/mcp/types";
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

interface McpFormState {
  label: string;
  url: string;
  authToken: string;
}

interface McpTestResult {
  serverId: string;
  tools: McpToolInfo[];
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

  // MCP state
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [mcpForm, setMcpForm] = useState<McpFormState>({ label: "", url: "", authToken: "" });
  const [testingMcpId, setTestingMcpId] = useState<string | null>(null);
  const [mcpTestResult, setMcpTestResult] = useState<McpTestResult | null>(null);

  // Load from localStorage
  useEffect(() => {
    if (!organizationId) return;
    try {
      const stored = localStorage.getItem(`api_key_${organizationId}`);
      if (stored) setApiKey(JSON.parse(stored));
      const wh = localStorage.getItem(`webhooks_${organizationId}`);
      if (wh) setWebhooks(JSON.parse(wh));
      setMcpServers(loadStoredMcpServers(organizationId));
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
    toast.success(t("apiSettings.toast.keyGenerated"));
  };

  const handleRevokeKey = () => {
    setApiKey(null);
    setShowKey(false);
    if (organizationId) {
      localStorage.removeItem(`api_key_${organizationId}`);
    }
    toast.success(t("apiSettings.toast.keyRevoked"));
  };

  const handleCopyKey = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey.key);
    setCopied(true);
    toast.success(t("apiSettings.toast.copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddWebhook = () => {
    if (!newUrl.trim()) {
      toast.error(t("apiSettings.toast.urlRequired"));
      return;
    }
    if (newEvents.length === 0) {
      toast.error(t("apiSettings.toast.selectEvent"));
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
    toast.success(t("apiSettings.toast.webhookAdded"));
  };

  const handleDeleteWebhook = (id: string) => {
    saveWebhooks(webhooks.filter((w) => w.id !== id));
    toast.success(t("apiSettings.toast.webhookRemoved"));
  };

  const handleToggleWebhook = (id: string) => {
    saveWebhooks(webhooks.map((w) => (w.id === id ? { ...w, active: !w.active } : w)));
  };

  const handleTestWebhook = (wh: WebhookConfig) => {
    const event = wh.events[0] ?? "order.created";
    setTestPayload({ event, payload: samplePayload(event) });
  };

  const saveMcpServers = useCallback(
    (servers: McpServerConfig[]) => {
      setMcpServers(servers);
      saveStoredMcpServers(organizationId, servers);
    },
    [organizationId],
  );

  const handleAddMcpServer = () => {
    if (!mcpForm.url.trim()) {
      toast.error(t("apiSettings.toast.urlRequired"));
      return;
    }
    const server: McpServerConfig = {
      id: "mcp_" + generateHex(8),
      label: mcpForm.label.trim() || "MCP Server",
      url: mcpForm.url.trim(),
      enabled: true,
      authToken: mcpForm.authToken.trim() || undefined,
    };
    saveMcpServers([...mcpServers, server]);
    setMcpForm({ label: "", url: "", authToken: "" });
    setMcpTestResult(null);
    toast.success(t("apiSettings.mcp.toastAdded"));
  };

  const handleDeleteMcpServer = (id: string) => {
    saveMcpServers(mcpServers.filter((server) => server.id !== id));
    if (mcpTestResult?.serverId === id) setMcpTestResult(null);
    toast.success(t("apiSettings.mcp.toastRemoved"));
  };

  const handleToggleMcpServer = (id: string) => {
    saveMcpServers(mcpServers.map((server) => (
      server.id === id ? { ...server, enabled: !server.enabled } : server
    )));
  };

  const handleTestMcpServer = async (server: McpServerConfig) => {
    setTestingMcpId(server.id);
    setMcpTestResult(null);
    try {
      const res = await fetch("/api/mcp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ server }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "MCP connection failed");
      const tools = Array.isArray(data.tools) ? data.tools : [];
      setMcpTestResult({ serverId: server.id, tools });
      toast.success(t("apiSettings.mcp.toastConnected").replace("{count}", String(tools.length)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("apiSettings.mcp.toastFailed"));
    } finally {
      setTestingMcpId(null);
    }
  };

  const toggleEvent = (event: string) => {
    setNewEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  return (
    <PermissionGuard section="settings">
      <div className="">
        <PageHeader title={t("apiSettings.pageTitle")} subtitle={t("apiSettings.pageSubtitle")} />

        <div className="px-4 sm:px-6 pb-6">
          <Tabs defaultValue="keys" className="space-y-4">
            <TabsList>
              <TabsTrigger value="keys" className="gap-1.5">
                <Key className="h-3.5 w-3.5" />
                {t("apiSettings.tabs.apiKeys")}
              </TabsTrigger>
              <TabsTrigger value="webhooks" className="gap-1.5">
                <Webhook className="h-3.5 w-3.5" />
                {t("apiSettings.tabs.webhooks")}
              </TabsTrigger>
              <TabsTrigger value="mcp" className="gap-1.5">
                <Server className="h-3.5 w-3.5" />
                {t("apiSettings.tabs.mcp")}
              </TabsTrigger>
            </TabsList>

            {/* ─── API Keys Tab ─────────────────────────────────────────────── */}
            <TabsContent value="keys" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t("apiSettings.apiKey.title")}</CardTitle>
                  <CardDescription>
                    {t("apiSettings.apiKey.description")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {apiKey ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 font-mono text-sm bg-muted rounded-lg px-3 py-2 border border-border truncate">
                          {showKey ? apiKey.key : maskKey(apiKey.key)}
                        </div>
                        <Button
                          variant="outline"
                          size="icon-lg"
                          className="shrink-0"
                          onClick={() => setShowKey((v) => !v)}
                        >
                          {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-lg"
                          className="shrink-0"
                          onClick={handleCopyKey}
                        >
                          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          {t("apiSettings.apiKey.created").replace("{date}", new Date(apiKey.createdAt).toLocaleDateString())}
                        </p>
                        <Button variant="destructive" size="sm" className="gap-1.5" onClick={handleRevokeKey}>
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("apiSettings.apiKey.revoke")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button onClick={handleGenerateKey} className="gap-1.5">
                      <Plus className="h-4 w-4" />
                      {t("apiSettings.apiKey.generate")}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Usage docs */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t("apiSettings.usage.title")}</CardTitle>
                  <CardDescription>{t("apiSettings.usage.description")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t("apiSettings.usage.authentication")}</p>
                    <div className="bg-muted rounded-lg p-3 border border-border">
                      <code className="text-xs font-mono text-foreground whitespace-pre">
                        {`Authorization: Bearer sk_live_****`}
                      </code>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t("apiSettings.usage.availableEndpoints")}</p>
                    <div className="space-y-1">
                      {[
                        { method: "GET", path: "/api/v1/products", desc: t("apiSettings.endpoints.listProducts") },
                        { method: "GET", path: "/api/v1/inventory", desc: t("apiSettings.endpoints.listInventory") },
                        { method: "GET", path: "/api/v1/orders", desc: t("apiSettings.endpoints.listOrders") },
                        { method: "POST", path: "/api/v1/orders", desc: t("apiSettings.endpoints.createOrder") },
                        { method: "GET", path: "/api/v1/staff", desc: t("apiSettings.endpoints.listStaff") },
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
                  <Callout tone="warning" icon={ShieldCheck}>
                    {t("apiSettings.usage.placeholderNotice")}
                  </Callout>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ─── Webhooks Tab ──────────────────────────────────────────────── */}
            <TabsContent value="webhooks" className="space-y-4">
              {/* Add webhook */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t("apiSettings.addWebhook.title")}</CardTitle>
                  <CardDescription>
                    {t("apiSettings.addWebhook.description")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>{t("apiSettings.addWebhook.endpointUrl")}</Label>
                    <Input
                      value={newUrl}
                      onChange={(e) => setNewUrl(e.target.value)}
                      placeholder="https://your-server.com/webhooks/merchiva"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("apiSettings.addWebhook.events")}</Label>
                    <div className="flex flex-wrap gap-2">
                      {WEBHOOK_EVENTS.map((event) => (
                        <Button
                          key={event}
                          type="button"
                          variant={newEvents.includes(event) ? "default" : "outline"}
                          size="xs"
                          aria-pressed={newEvents.includes(event)}
                          className={newEvents.includes(event) ? "font-mono" : "font-mono text-muted-foreground"}
                          onClick={() => toggleEvent(event)}
                        >
                          {event}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Button onClick={handleAddWebhook} size="sm" className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    {t("apiSettings.addWebhook.submit")}
                  </Button>
                </CardContent>
              </Card>

              {/* Webhook list */}
              {webhooks.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t("apiSettings.configured.title")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {webhooks.map((wh) => (
                      <div
                        key={wh.id}
                        className="border border-border rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-sm font-mono truncate flex-1">{wh.url}</span>
                          <Badge variant={wh.active ? "default" : "outline"} className="text-[10px] shrink-0">
                            {wh.active ? t("apiSettings.status.active") : t("apiSettings.status.paused")}
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
                            {t("apiSettings.webhookActions.test")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleToggleWebhook(wh.id)}
                          >
                            {wh.active ? t("apiSettings.webhookActions.pause") : t("apiSettings.webhookActions.enable")}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => handleDeleteWebhook(wh.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                            {t("common.delete")}
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
                      <CardTitle className="text-base">{t("apiSettings.samplePayload.title")}</CardTitle>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setTestPayload(null)}>
                        {t("apiSettings.samplePayload.dismiss")}
                      </Button>
                    </div>
                    <CardDescription>
                      {t("apiSettings.samplePayload.descriptionPrefix")}<code className="font-mono text-xs">{testPayload.event}</code>{t("apiSettings.samplePayload.descriptionSuffix")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-muted rounded-lg p-3 border border-border text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(testPayload.payload, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              )}

              {webhooks.length === 0 && (
                <Card>
                  <EmptyState icon={Webhook} title={t("apiSettings.empty.title")} description={t("apiSettings.empty.description")} />
                </Card>
              )}
            </TabsContent>

            {/* ─── MCP Tab ─────────────────────────────────────────────────── */}
            <TabsContent value="mcp" className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t("apiSettings.mcp.addTitle")}</CardTitle>
                  <CardDescription>{t("apiSettings.mcp.addDescription")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                    <div className="space-y-1.5">
                      <Label>{t("apiSettings.mcp.label")}</Label>
                      <Input
                        value={mcpForm.label}
                        onChange={(e) => setMcpForm((prev) => ({ ...prev, label: e.target.value }))}
                        placeholder="Search"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("apiSettings.mcp.url")}</Label>
                      <Input
                        value={mcpForm.url}
                        onChange={(e) => setMcpForm((prev) => ({ ...prev, url: e.target.value }))}
                        placeholder="https://mcp.example.com/mcp"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t("apiSettings.mcp.token")}</Label>
                    <Input
                      type="password"
                      value={mcpForm.authToken}
                      onChange={(e) => setMcpForm((prev) => ({ ...prev, authToken: e.target.value }))}
                      placeholder={t("apiSettings.mcp.tokenPlaceholder")}
                    />
                  </div>
                  <Callout tone="neutral" icon={ShieldCheck}>
                    {t("apiSettings.mcp.securityNote")}
                  </Callout>
                  <Button onClick={handleAddMcpServer} size="sm" className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    {t("apiSettings.mcp.addSubmit")}
                  </Button>
                </CardContent>
              </Card>

              {mcpServers.length > 0 ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{t("apiSettings.mcp.configuredTitle")}</CardTitle>
                    <CardDescription>{t("apiSettings.mcp.configuredDescription")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {mcpServers.map((server) => (
                      <div key={server.id} className="rounded-lg border border-border p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <PlugZap className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{server.label}</p>
                            <p className="truncate font-mono text-xs text-muted-foreground">{server.url}</p>
                          </div>
                          <Badge variant={server.enabled ? "default" : "outline"} className="text-[10px] shrink-0">
                            {server.enabled ? t("apiSettings.status.active") : t("apiSettings.status.paused")}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => handleTestMcpServer(server)}
                            disabled={testingMcpId === server.id}
                          >
                            {testingMcpId === server.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3" />}
                            {t("apiSettings.webhookActions.test")}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleToggleMcpServer(server.id)}
                          >
                            {server.enabled ? t("apiSettings.webhookActions.pause") : t("apiSettings.webhookActions.enable")}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => handleDeleteMcpServer(server.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                            {t("common.delete")}
                          </Button>
                        </div>
                        {mcpTestResult?.serverId === server.id && (
                          <div className="rounded-lg bg-muted p-2.5">
                            <p className="mb-1.5 text-xs font-medium">
                              {t("apiSettings.mcp.toolsFound").replace("{count}", String(mcpTestResult.tools.length))}
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {mcpTestResult.tools.slice(0, 24).map((tool) => (
                                <Badge key={tool.name} variant="outline" className="font-mono text-[10px]">
                                  {tool.name}
                                </Badge>
                              ))}
                              {mcpTestResult.tools.length > 24 && (
                                <Badge variant="outline" className="font-mono text-[10px]">
                                  +{mcpTestResult.tools.length - 24}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <EmptyState icon={Server} title={t("apiSettings.mcp.emptyTitle")} description={t("apiSettings.mcp.emptyDescription")} />
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PermissionGuard>
  );
}
