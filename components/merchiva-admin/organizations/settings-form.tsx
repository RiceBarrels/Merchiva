"use client";

import { useState } from "react";
import { formatTs } from "@/lib/merchiva-admin/client";
import { Badge, ErrorBanner, Notice, Panel, btnCls, cell, inputCls } from "@/components/merchiva-admin/ui";
import type { SettingsRow } from "./types";
import { fieldCls, labelCls, useAction } from "./use-action";

function prettyJson(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function compactJson(raw: string): string | undefined {
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export function SettingsForm({ orgId, settings, loading, error, onChanged }: { orgId: string; settings: SettingsRow | null; loading: boolean; error: string | null; onChanged: () => void }) {
  const general = useAction(onChanged);
  const hours = useAction(onChanged);
  const jsonCfg = useAction(onChanged);

  // The parent remounts this form (key = settings id + updatedAt) whenever the
  // row reloads, so initial state from props is enough.
  const [businessName, setBusinessName] = useState(settings?.businessName ?? "");
  const [businessType, setBusinessType] = useState(settings?.businessType ?? "");
  const [timezone, setTimezone] = useState(settings?.timezone ?? "");
  const [taxRate, setTaxRate] = useState(String(settings?.paymentTaxRate ?? 0));
  const [currency, setCurrency] = useState(settings?.paymentCurrency ?? "");
  const [lat, setLat] = useState(settings?.locationLatitude ?? "");
  const [lng, setLng] = useState(settings?.locationLongitude ?? "");
  const [placesId, setPlacesId] = useState(settings?.googlePlacesId ?? "");
  const [openingHours, setOpeningHours] = useState(prettyJson(settings?.openingHours ?? null));
  const [countryCode, setCountryCode] = useState(settings?.countryCode ?? "");
  const [assistantConfig, setAssistantConfig] = useState(prettyJson(settings?.assistantConfig ?? null));
  const [deviceApps, setDeviceApps] = useState(prettyJson(settings?.deviceApps ?? null));
  const [betaFeatures, setBetaFeatures] = useState(prettyJson(settings?.betaFeatures ?? null));

  async function saveGeneral(e: React.FormEvent) {
    e.preventDefault();
    const rate = Number(taxRate);
    if (!Number.isFinite(rate) || rate < 0) {
      general.setError("Tax rate must be a non-negative number");
      return;
    }
    await general.run(
      "updateSettings",
      {
        organizationId: orgId,
        businessName: businessName.trim() || null,
        businessType: businessType.trim() || null,
        timezone: timezone.trim(),
        paymentTaxRate: rate,
        paymentCurrency: currency.trim(),
        locationLatitude: lat.trim() || null,
        locationLongitude: lng.trim() || null,
        googlePlacesId: placesId.trim() || null,
      },
      "Settings updated",
    );
  }

  async function saveHours(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = openingHours.trim();
    const compact = trimmed ? compactJson(trimmed) : "";
    if (compact === undefined) {
      hours.setError("Opening hours must be valid JSON");
      return;
    }
    await hours.run(
      "updateOpeningHours",
      { organizationId: orgId, openingHours: compact !== (settings?.openingHours ?? "") ? compact : null, countryCode: countryCode.trim() !== (settings?.countryCode ?? "") ? countryCode.trim() : null },
      "Opening hours / country updated",
    );
  }

  async function saveJson(reducer: "setAssistantConfig" | "setDeviceApps" | "setBetaFeatures", raw: string, label: string) {
    const compact = compactJson(raw.trim() || "{}");
    if (compact === undefined) {
      jsonCfg.setError(`${label} must be valid JSON`);
      return;
    }
    await jsonCfg.run(reducer, { organizationId: orgId, config: compact }, `${label} updated`);
  }

  if (!loading && !settings) {
    return (
      <Panel title="Settings">
        <ErrorBanner message={error} />
        <div className="px-4 py-6 text-center text-[13px] text-stone-500">No settings row for this organization.</div>
      </Panel>
    );
  }

  const busy = general.busy || hours.busy || jsonCfg.busy;

  return (
    <Panel title="Settings" actions={settings && <span className="text-[11px] text-stone-500">updated {formatTs(settings.updatedAt)}</span>}>
      <ErrorBanner message={error ?? general.error ?? hours.error ?? jsonCfg.error} />
      <Notice message={general.notice ?? hours.notice ?? jsonCfg.notice} />
      {settings && (
        <div className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-4 py-2 text-[12px] text-stone-600">
          <span>
            Square <Badge tone={settings.squareConnected ? "ok" : "neutral"}>{settings.squareConnected ? "connected" : "not connected"}</Badge>
            {settings.squareMerchantId && <span className="ml-1 font-mono">{settings.squareMerchantId}</span>}
            {settings.squareLastSyncedAt && <span className="ml-1">synced {formatTs(settings.squareLastSyncedAt)}</span>}
          </span>
          <span>
            Schedule provider {cell(settings.scheduleProvider)} <Badge tone={settings.scheduleConnected ? "ok" : "neutral"}>{settings.scheduleConnected ? "connected" : "off"}</Badge>
            {settings.scheduleLastSyncStatus && <span className="ml-1 font-mono">{settings.scheduleLastSyncStatus}</span>}
          </span>
          <span>Auto-commit schedules {cell(settings.autoCommitSchedules)}</span>
          <span>
            Supplier inbox prefix <span className="font-mono">{settings.supplierInboundPrefix || "—"}</span>
          </span>
          <span className="font-mono text-[10.5px] text-stone-400">{settings.id}</span>
        </div>
      )}

      <form onSubmit={saveGeneral} className="border-b border-stone-200 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className={fieldCls}>
            <label className={labelCls}>Business name</label>
            <input className={inputCls} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Business type</label>
            <input className={inputCls} value={businessType} onChange={(e) => setBusinessType(e.target.value)} />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Timezone (IANA)</label>
            <input className={`${inputCls} font-mono`} value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Currency</label>
            <input className={`${inputCls} font-mono`} value={currency} onChange={(e) => setCurrency(e.target.value)} required maxLength={3} />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Tax rate (%)</label>
            <input className={`${inputCls} font-mono`} type="number" min={0} step="0.001" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} required />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Latitude</label>
            <input className={`${inputCls} font-mono`} value={lat} onChange={(e) => setLat(e.target.value)} />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Longitude</label>
            <input className={`${inputCls} font-mono`} value={lng} onChange={(e) => setLng(e.target.value)} />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Google Places id</label>
            <input className={`${inputCls} font-mono`} value={placesId} onChange={(e) => setPlacesId(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button type="submit" className={btnCls} disabled={busy}>
            {general.busy ? "Saving…" : "Save general"}
          </button>
          <span className="text-[11px] text-stone-500">updateSettings checks settings.view on the caller; the module grants the admin identity an empty permission set, so this may be rejected.</span>
        </div>
      </form>

      <form onSubmit={saveHours} className="border-b border-stone-200 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_160px]">
          <div className={fieldCls}>
            <label className={labelCls}>Opening hours (JSON)</label>
            <textarea className={`${inputCls} min-h-[120px] font-mono text-[12px]`} value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} spellCheck={false} />
          </div>
          <div className={fieldCls}>
            <label className={labelCls}>Country code</label>
            <input className={`${inputCls} font-mono`} value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} maxLength={2} placeholder="US" />
          </div>
        </div>
        <div className="mt-3">
          <button type="submit" className={btnCls} disabled={busy}>
            {hours.busy ? "Saving…" : "Save hours & country"}
          </button>
        </div>
      </form>

      <div className="grid gap-4 p-4 md:grid-cols-3">
        <div className={fieldCls}>
          <label className={labelCls}>Assistant config (JSON)</label>
          <textarea className={`${inputCls} min-h-[140px] font-mono text-[12px]`} value={assistantConfig} onChange={(e) => setAssistantConfig(e.target.value)} spellCheck={false} />
          <button type="button" className={btnCls} disabled={busy} onClick={() => saveJson("setAssistantConfig", assistantConfig, "Assistant config")}>
            Save
          </button>
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Device apps (JSON)</label>
          <textarea className={`${inputCls} min-h-[140px] font-mono text-[12px]`} value={deviceApps} onChange={(e) => setDeviceApps(e.target.value)} spellCheck={false} />
          <button type="button" className={btnCls} disabled={busy} onClick={() => saveJson("setDeviceApps", deviceApps, "Device apps")}>
            Save
          </button>
        </div>
        <div className={fieldCls}>
          <label className={labelCls}>Beta features (JSON)</label>
          <textarea className={`${inputCls} min-h-[140px] font-mono text-[12px]`} value={betaFeatures} onChange={(e) => setBetaFeatures(e.target.value)} spellCheck={false} />
          <button type="button" className={btnCls} disabled={busy} onClick={() => saveJson("setBetaFeatures", betaFeatures, "Beta features")}>
            Save
          </button>
          <p className="text-[11px] text-stone-500">setBetaFeatures also checks settings.view; may be rejected for the admin identity.</p>
        </div>
      </div>
    </Panel>
  );
}
