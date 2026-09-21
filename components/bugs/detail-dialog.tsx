"use client";

// One bug report, opened from the tracker list: what was reported, the context
// captured with it, and — for an owner or manager — the triage controls.
// Everyone else sees the same report read-only, including the resolution note.

import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/loaders/geometric";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import {
  BUG_SEVERITIES,
  BUG_SEVERITY_TONE,
  BUG_STATUS_TONE,
  type BugReport,
  type BugSeverity,
  type BugStatus,
} from "@/lib/bugs";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { deleteBugReport, updateBugReport } from "@/lib/spacetimedb/actions";
import { TRIAGE_STATUSES } from "@/lib/spacetimedb/hooks/useBugs";

export function BugDetailDialog({
  bug,
  canTriage,
  onClose,
  formatWhen,
}: {
  bug: BugReport | null;
  canTriage: boolean;
  onClose: () => void;
  formatWhen: (d: Date) => string;
}) {
  return (
    <DynamicUIElement open={bug !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DynamicUIElementContent className="max-w-lg">
        {/* Keyed so the triage fields reset when a different report is opened. */}
        {bug && <BugDetail key={bug.id} bug={bug} canTriage={canTriage} onClose={onClose} formatWhen={formatWhen} />}
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}

function BugDetail({
  bug,
  canTriage,
  onClose,
  formatWhen,
}: {
  bug: BugReport;
  canTriage: boolean;
  onClose: () => void;
  formatWhen: (d: Date) => string;
}) {
  const t = useT();
  const [status, setStatus] = useState<BugStatus>(bug.status);
  const [severity, setSeverity] = useState<BugSeverity>(bug.severity);
  const [note, setNote] = useState(bug.resolutionNote);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateBugReport(bug.id, { status, severity, resolutionNote: note });
      hapticSuccess();
      toast.success(t("bugs.saved"));
      onClose();
    } catch (err) {
      console.error("Bug triage failed:", err);
      hapticWarning();
      toast.error(t("bugs.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteBugReport(bug.id);
      hapticSuccess();
      onClose();
    } catch (err) {
      console.error("Bug delete failed:", err);
      hapticWarning();
      toast.error(t("bugs.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <DynamicUIElementHeader>
        <DynamicUIElementTitle mobileTitle={bug.title}>{bug.title}</DynamicUIElementTitle>
        <DynamicUIElementDescription>
          {[bug.reporterName || t("bugs.unknownReporter"), formatWhen(bug.createdAt)].join(" · ")}
        </DynamicUIElementDescription>
      </DynamicUIElementHeader>

      <div className="space-y-4 px-4 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge tone={BUG_STATUS_TONE[bug.status]}>{t(`bugs.status.${bug.status}`)}</StatusBadge>
          <StatusBadge tone={BUG_SEVERITY_TONE[bug.severity]}>{t(`bugs.severity.${bug.severity}`)}</StatusBadge>
          <StatusBadge tone="neutral">{t(`bugs.surface.${bug.surface}`)}</StatusBadge>
        </div>

        {bug.body && <p className="whitespace-pre-wrap text-sm leading-relaxed">{bug.body}</p>}

        {bug.screenshotUrl && (
          <a
            href={bug.screenshotUrl}
            target="_blank"
            rel="noreferrer"
            className="block overflow-hidden rounded border border-border bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={bug.screenshotUrl} alt="" className="max-h-72 w-full object-contain" />
          </a>
        )}

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded border border-border bg-muted/40 p-2.5 text-[11px]">
          <dt className="text-muted-foreground">{t("bugs.contextPage")}</dt>
          <dd className="truncate font-mono tabular-nums">{bug.route || "--"}</dd>
          <dt className="text-muted-foreground">{t("bugs.contextBuild")}</dt>
          <dd className="font-mono tabular-nums">{bug.appVersion || t("bugs.unknownVersion")}</dd>
          <dt className="text-muted-foreground">{t("bugs.contextDevice")}</dt>
          <dd className="break-all font-mono text-[10px] leading-snug">{bug.userAgent || "--"}</dd>
        </dl>

        {canTriage ? (
          <>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("bugs.detailStatus")}</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as BugStatus)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIAGE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{t(`bugs.status.${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("bugs.detailSeverity")}</Label>
                <Select value={severity} onValueChange={(v) => setSeverity(v as BugSeverity)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BUG_SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>{t(`bugs.severity.${s}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">{t("bugs.resolution")}</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("bugs.resolutionPlaceholder")}
                rows={3}
                className="resize-none text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button className="flex-1 gap-1.5" onClick={save} disabled={saving || deleting}>
                {saving && <Spinner size={16} />}
                {t("common.save")}
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("common.delete")}
                onClick={remove}
                disabled={saving || deleting}
              >
                {deleting ? <Spinner size={16} /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </div>
          </>
        ) : (
          <>
            {bug.resolutionNote && (
              <div className="rounded border border-border p-2.5">
                <p className="text-xs font-medium">{t("bugs.resolution")}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{bug.resolutionNote}</p>
                {bug.resolvedByName && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {fmt(t("bugs.resolvedBy"), { name: bug.resolvedByName })}
                  </p>
                )}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">{t("bugs.triageHint")}</p>
          </>
        )}
      </div>
    </>
  );
}
