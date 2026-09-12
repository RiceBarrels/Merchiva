"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSpacetimeDB } from "spacetimedb/react";
import { useT } from "@/lib/i18n/context";
import { useBriefingPrefs } from "@/lib/spacetimedb/hooks";
import { setBriefingPref, deleteBriefingPref } from "@/lib/spacetimedb/actions";

// A small, curated timezone list keeps the picker usable. "auto" resolves to
// the browser's IANA zone at save time. Add more as needed.
const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Moscow",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);
const BUSINESS_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function MorningBriefingSettings() {
  const t = useT();
  const stdb = useSpacetimeDB();
  const identity = stdb?.identity ?? null;
  const [prefRows] = useBriefingPrefs() as [unknown[], boolean];

  const myPref = useMemo(() => {
    if (!identity) return null;
    const hex = identity.toHexString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (prefRows as any[]).find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => r.userId?.toHexString?.() === hex,
    );
  }, [prefRows, identity]);

  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState<number[]>([8]);
  const [timezone, setTimezone] = useState<string>(browserTimezone());
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate local state from the persisted row once it arrives.
  useEffect(() => {
    if (hydrated) return;
    if (myPref) {
      setEnabled(Boolean(myPref.enabled));
      if (typeof myPref.timezone === "string") setTimezone(myPref.timezone);
      let hrs: number[] = [];
      if (typeof myPref.hours === "string" && myPref.hours) {
        try {
          const a = JSON.parse(myPref.hours);
          if (Array.isArray(a)) hrs = a.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 23);
        } catch {
          /* fall back to legacy single time */
        }
      }
      if (!hrs.length && typeof myPref.briefingTime === "string") {
        const h = parseInt(myPref.briefingTime.slice(0, 2), 10);
        if (Number.isFinite(h)) hrs = [h];
      }
      if (hrs.length) setHours(Array.from(new Set(hrs)).sort((a, b) => a - b));
      setHydrated(true);
    }
  }, [myPref, hydrated]);

  const tzOptions = useMemo(() => {
    const browser = browserTimezone();
    const set = new Set<string>([browser, ...TIMEZONES]);
    if (myPref?.timezone) set.add(myPref.timezone);
    return Array.from(set);
  }, [myPref]);

  function toggleHour(h: number) {
    setHours((prev) =>
      prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h].sort((a, b) => a - b),
    );
  }

  async function save() {
    if (enabled && hours.length === 0) {
      toast.error(t("settings.briefing.selectHoursWarn"));
      return;
    }
    setSaving(true);
    try {
      const sorted = Array.from(new Set(hours)).sort((a, b) => a - b);
      // Legacy single-time fallback = earliest selected hour.
      const briefingTime = `${String(sorted[0] ?? 8).padStart(2, "0")}:00`;
      await setBriefingPref(briefingTime, timezone, enabled, sorted);
      toast.success(t("settings.briefing.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.briefing.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function disableAndClear() {
    setSaving(true);
    try {
      await deleteBriefingPref();
      setEnabled(false);
      toast.success(t("settings.briefing.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("settings.briefing.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Bell className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-[13px] font-semibold">{t("settings.briefing.title")}</h2>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Label className="text-[12.5px]">{t("settings.briefing.enableLabel")}</Label>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              {t("settings.briefing.enableHint")}
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={saving}
            aria-label={t("settings.briefing.enableLabel")}
          />
        </div>

        {enabled && (
          <div className="space-y-4">
            {/* 24-hour selector grid ("graph") */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[12.5px]">{t("settings.briefing.hoursLabel")}</Label>
                <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
                  {hours.length}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1">
                {ALL_HOURS.map((h) => {
                  const on = hours.includes(h);
                  return (
                    <Button
                      key={h}
                      type="button"
                      variant={on ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleHour(h)}
                      disabled={saving}
                      aria-pressed={on}
                      className="font-mono text-[11px] tabular-nums"
                    >
                      {String(h).padStart(2, "0")}
                    </Button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setHours(BUSINESS_HOURS)}>
                  {t("settings.briefing.presetBusiness")}
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setHours([...ALL_HOURS])}>
                  {t("settings.briefing.presetAll")}
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setHours([])}>
                  {t("settings.briefing.presetClear")}
                </Button>
              </div>
              <p className="text-[10.5px] text-muted-foreground">
                {t("settings.briefing.hoursHint")}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[12.5px]">{t("settings.briefing.tzLabel")}</Label>
              <Select value={timezone} onValueChange={(v) => v && setTimezone(v)} disabled={saving}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tzOptions.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("settings.briefing.saveCta")}
          </Button>
          {myPref && (
            <Button variant="outline" onClick={disableAndClear} disabled={saving}>
              {t("settings.briefing.clearCta")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
