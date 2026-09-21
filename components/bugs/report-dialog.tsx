"use client";

// "Report a bug" dialog for the manager surface. The device surfaces have
// their own lite version (components/device/apps/bugs.tsx); both share the
// draft state, the screenshot upload and the submit path in useBugReportDraft,
// so a report filed from a phone carries exactly the same context as this one.

import { useRef } from "react";
import { toast } from "sonner";
import { Bug, Camera, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/loaders/geometric";
import { Textarea } from "@/components/ui/textarea";
import { BUG_SEVERITIES, type BugSeverity } from "@/lib/bugs";
import { hapticSuccess, hapticWarning } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { useBugReportDraft } from "@/lib/spacetimedb/hooks/useBugs";

export function ReportBugDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const draft = useBugReportDraft("manager");
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = draft.submitting || draft.uploading;

  const send = async () => {
    const ok = await draft.submit();
    if (!ok) {
      hapticWarning();
      toast.error(t(draft.error === "title" ? "bugs.titleRequired" : "bugs.sendFailed"));
      return;
    }
    hapticSuccess();
    toast.success(t("bugs.sent"));
    onOpenChange(false);
  };

  const pickScreenshot = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const ok = await draft.attach(file);
    if (!ok) toast.error(t("bugs.uploadFailed"));
  };

  return (
    <DynamicUIElement open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DynamicUIElementContent className="max-w-md">
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("bugs.report")}>{t("bugs.report")}</DynamicUIElementTitle>
          <DynamicUIElementDescription>{t("bugs.reportDesc")}</DynamicUIElementDescription>
        </DynamicUIElementHeader>

        <div className="space-y-4 px-4 pb-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t("bugs.formTitle")}</Label>
            <Input
              value={draft.title}
              onChange={(e) => draft.setTitle(e.target.value)}
              placeholder={t("bugs.formTitlePlaceholder")}
              maxLength={140}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t("bugs.formBody")}</Label>
            <Textarea
              value={draft.body}
              onChange={(e) => draft.setBody(e.target.value)}
              placeholder={t("bugs.formBodyPlaceholder")}
              rows={4}
              className="resize-none text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t("bugs.formSeverity")}</Label>
            <Select value={draft.severity} onValueChange={(v) => draft.setSeverity(v as BugSeverity)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUG_SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>{t(`bugs.severity.${s}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">{t("bugs.formScreenshot")}</Label>
            <input
              ref={fileRef}
              type="file"
              accept={draft.accept}
              className="hidden"
              onChange={(e) => { void pickScreenshot(e.target.files?.[0]); }}
            />
            {draft.screenshot ? (
              <div className="flex items-center gap-2 rounded border border-border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={draft.screenshot.url} alt="" className="h-10 w-10 rounded object-cover" />
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{draft.screenshot.name}</span>
                <Button variant="ghost" size="icon-xs" aria-label={t("common.delete")} onClick={draft.removeScreenshot}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full gap-1.5"
                onClick={() => fileRef.current?.click()}
                disabled={draft.uploading}
              >
                {draft.uploading ? <Spinner size={14} /> : <Camera className="h-3.5 w-3.5" />}
                {t("bugs.formScreenshotAdd")}
              </Button>
            )}
          </div>

          <Separator />

          <Button className="w-full gap-1.5" onClick={send} disabled={busy || !draft.canSubmit}>
            {draft.submitting ? <Spinner size={16} /> : <Bug className="h-4 w-4" />}
            {draft.submitting ? t("bugs.sending") : t("bugs.submit")}
          </Button>
          <p className="text-center text-[10px] text-muted-foreground">{t("bugs.contextHint")}</p>
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
