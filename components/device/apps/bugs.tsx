"use client";

// "Report a bug" lite app for /store + /personal: one big button to report a
// problem with Merchiva, and below it what happened to the reports you already
// filed. Anyone can report — that is the whole point, since the person who runs
// into a bug is usually the one without permissions — so nothing here is gated.
// Managers can flip to "Everyone" for the store's open reports; the full
// tracker with triage lives at /manager/bugs.

import { useMemo, useRef, useState } from "react";
import { Bug, Camera, CheckCircle2, CircleDot, RefreshCw, Send, User, Users } from "lucide-react";
import { DeviceDrawer } from "@/components/device/device-drawer";
import { StatusBadge } from "@/components/ui/status-badge";
import { BUG_SEVERITIES, BUG_STATUS_TONE, isBugOpen, type BugReport, type BugSeverity } from "@/lib/bugs";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { useI18n } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { useBugReportDraft, useBugs } from "@/lib/spacetimedb/hooks/useBugs";
import { LiteButton, LiteChoice, LiteEmpty, LiteLoading, LiteRow, LiteScreen, LiteSection, LiteStat } from "./lite";
import type { LiteAppProps } from "./types";

type Who = "me" | "everyone";

/** Rows rendered per section; a device list never needs to be longer. */
const MAX_ROWS = 40;

export function BugsLite({ surface, isManager }: LiteAppProps) {
  const { t, locale } = useI18n();
  const { bugs, mine, isReady } = useBugs();
  const draft = useBugReportDraft(surface);
  const fileRef = useRef<HTMLInputElement>(null);

  const [who, setWho] = useState<Who>("me");
  const [reporting, setReporting] = useState(false);
  const [detail, setDetail] = useState<BugReport | null>(null);

  const myOpen = useMemo(() => mine.filter((b) => isBugOpen(b.status)).length, [mine]);
  const teamOpen = useMemo(() => bugs.filter((b) => isBugOpen(b.status)).slice(0, MAX_ROWS), [bugs]);
  const myRows = useMemo(() => mine.slice(0, MAX_ROWS), [mine]);

  const busy = draft.submitting || draft.uploading;

  const closeReport = () => {
    if (busy) return;
    draft.reset();
    setReporting(false);
  };

  const send = async () => {
    const ok = await draft.submit();
    if (!ok) {
      hapticWarning();
      return;
    }
    hapticSuccess();
    setReporting(false);
  };

  const pickPhoto = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (file) await draft.attach(file);
  };

  const when = (d: Date) => d.toLocaleDateString(locale, { month: "short", day: "numeric" });

  const row = (bug: BugReport) => (
    <LiteRow
      key={bug.id}
      icon={isBugOpen(bug.status) ? CircleDot : CheckCircle2}
      iconTone={isBugOpen(bug.status) ? "warning" : "success"}
      title={bug.title}
      sub={[who === "everyone" ? bug.reporterName : null, when(bug.createdAt)].filter(Boolean).join(" · ")}
      right={<StatusBadge tone={BUG_STATUS_TONE[bug.status]}>{t(`bugs.status.${bug.status}`)}</StatusBadge>}
      onClick={() => setDetail(bug)}
    />
  );

  if (!isReady && bugs.length === 0) {
    return (
      <LiteScreen>
        <LiteLoading />
      </LiteScreen>
    );
  }

  return (
    <LiteScreen>
      <LiteStat
        icon={Bug}
        tone={myOpen > 0 ? "warning" : "default"}
        label={t("device.lite.bugs.myOpen")}
        value={myOpen}
        sub={t("device.lite.bugs.reportHint")}
      />

      <LiteButton icon={Bug} label={t("device.lite.bugs.report")} onClick={() => setReporting(true)} />

      {isManager && (
        <LiteChoice<Who>
          value={who}
          onChange={setWho}
          options={[
            { value: "me", label: t("device.lite.bugs.mine"), icon: User },
            { value: "everyone", label: t("device.lite.bugs.everyone"), icon: Users },
          ]}
        />
      )}

      {who === "me" ? (
        myRows.length === 0 ? (
          <LiteEmpty icon={Bug} title={t("device.lite.bugs.none")} description={t("device.lite.bugs.noneHint")} />
        ) : (
          <LiteSection title={t("device.lite.bugs.myReports")}>
            <div className="space-y-2">{myRows.map(row)}</div>
          </LiteSection>
        )
      ) : teamOpen.length === 0 ? (
        <LiteEmpty icon={CheckCircle2} title={t("device.lite.bugs.teamAllClear")} />
      ) : (
        <LiteSection title={t("device.lite.bugs.openReports")}>
          <div className="space-y-2">{teamOpen.map(row)}</div>
        </LiteSection>
      )}

      {/* ── Report form ───────────────────────────────────────────────────── */}
      <DeviceDrawer
        open={reporting}
        onOpenChange={(open) => { if (!open) closeReport(); }}
        title={t("device.lite.bugs.report")}
        cancelLabel={t("common.cancel")}
        onCancel={closeReport}
      >
        <div className="flex flex-col gap-3 pb-1">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-muted-foreground">{t("device.lite.bugs.what")}</span>
            <input
              value={draft.title}
              onChange={(e) => draft.setTitle(e.target.value)}
              placeholder={t("device.lite.bugs.whatPlaceholder")}
              maxLength={140}
              className="h-12 rounded-lg border border-input bg-background px-3 text-[16px] outline-none placeholder:text-muted-foreground"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-muted-foreground">{t("device.lite.bugs.details")}</span>
            <textarea
              value={draft.body}
              onChange={(e) => draft.setBody(e.target.value)}
              placeholder={t("device.lite.bugs.detailsPlaceholder")}
              rows={3}
              className="resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-[16px] outline-none placeholder:text-muted-foreground"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-muted-foreground">{t("device.lite.bugs.severity")}</span>
            <LiteChoice<BugSeverity>
              value={draft.severity}
              onChange={draft.setSeverity}
              options={BUG_SEVERITIES.map((s) => ({ value: s, label: t(`bugs.severity.${s}`) }))}
            />
          </div>

          <input
            ref={fileRef}
            type="file"
            accept={draft.accept}
            capture="environment"
            className="hidden"
            onChange={(e) => { void pickPhoto(e.target.files?.[0]); }}
          />
          {draft.screenshot ? (
            <div className="relative overflow-hidden rounded-lg border border-border bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={draft.screenshot.url} alt="" className="max-h-56 w-full object-contain" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="absolute bottom-2 right-2 inline-flex h-9 items-center gap-1.5 rounded-lg bg-background/90 px-3 text-[13px] font-medium text-foreground"
              >
                <RefreshCw className="h-4 w-4" />
                {t("device.lite.bugs.retake")}
              </button>
            </div>
          ) : (
            <LiteButton
              icon={Camera}
              tone="outline"
              label={t("device.lite.bugs.photo")}
              busy={draft.uploading}
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            />
          )}

          {draft.error && (
            <p className="text-[13px] text-destructive">
              {t(
                draft.error === "title"
                  ? "device.lite.bugs.titleRequired"
                  : draft.error === "upload"
                    ? "device.lite.bugs.uploadFailed"
                    : "device.lite.bugs.failed",
              )}
            </p>
          )}

          <LiteButton
            icon={Send}
            label={t("device.lite.bugs.send")}
            onClick={send}
            busy={draft.submitting}
            disabled={busy || !draft.canSubmit}
          />
        </div>
      </DeviceDrawer>

      {/* ── One report, read-only ─────────────────────────────────────────── */}
      <DeviceDrawer
        open={detail !== null}
        onOpenChange={(open) => { if (!open) setDetail(null); }}
        title={detail?.title ?? ""}
        cancelLabel={t("common.close")}
        onCancel={() => setDetail(null)}
      >
        {detail && (
          <div className="flex flex-col gap-3 pb-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={BUG_STATUS_TONE[detail.status]}>{t(`bugs.status.${detail.status}`)}</StatusBadge>
              <StatusBadge tone="neutral">{t(`bugs.severity.${detail.severity}`)}</StatusBadge>
            </div>

            {detail.body && (
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{detail.body}</p>
            )}

            {detail.screenshotUrl && (
              <div className="overflow-hidden rounded-lg border border-border bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={detail.screenshotUrl} alt="" className="max-h-56 w-full object-contain" />
              </div>
            )}

            {detail.resolutionNote && (
              <div className="rounded-lg border border-border p-3">
                <p className="text-[13px] font-medium">{t("bugs.resolution")}</p>
                <p className="mt-1 whitespace-pre-wrap text-[15px] text-muted-foreground">{detail.resolutionNote}</p>
                {detail.resolvedByName && (
                  <p className="mt-1.5 text-[13px] text-muted-foreground">
                    {fmt(t("bugs.resolvedBy"), { name: detail.resolvedByName })}
                  </p>
                )}
              </div>
            )}

            <p className="text-[13px] text-muted-foreground">
              {[detail.reporterName || t("bugs.unknownReporter"), when(detail.createdAt)].join(" · ")}
            </p>
          </div>
        )}
      </DeviceDrawer>
    </LiteScreen>
  );
}
