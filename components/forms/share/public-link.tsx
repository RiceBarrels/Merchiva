"use client";

// The anyone-with-the-link switch (decision C4): only the store owner turns it on or issues a new link; whoever
// edits the form may turn it off. Never for a form with photo or file questions. The token lives on form_meta,
// which only Drive admins read, so this section renders only when `meta` is present.

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Globe, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { QrCodeView } from "@/components/device/qr-code-view";
import { ConfirmDialog } from "@/components/forms/list/confirm-dialog";
import { usePermissions } from "@/lib/context/permissions";
import type { FormMetaView, FormView } from "@/lib/forms/types";
import { useT } from "@/lib/i18n/context";
import { formsErrorKey, setFormPublicLink } from "@/lib/spacetimedb/actions/forms";

/** Absolute public URL. On Capacitor the page origin is `capacitor://`, so prefer the public app URL. */
export function publicFormUrl(token: string): string {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  const pageOrigin = typeof window !== "undefined" && /^https?:$/.test(window.location.protocol) ? window.location.origin : "";
  return `${configured || pageOrigin}/f/${token}`;
}

export function PublicLink({ form, meta }: { form: FormView; meta: FormMetaView }) {
  const t = useT();
  const { role } = usePermissions();
  const isOwner = role === "owner";
  const [busy, setBusy] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);

  const enabled = form.publicEnabled && meta.publicToken !== "";
  const url = enabled ? publicFormUrl(meta.publicToken) : "";
  const canToggle = enabled || (isOwner && !form.hasFileQuestions);

  const run = async (next: boolean, rotate = false) => {
    setBusy(true);
    try {
      await setFormPublicLink(form.id, next, rotate);
      if (rotate) toast.success(t("forms.share.publicRotated"));
    } catch (err) {
      toast.error(t(formsErrorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(url)
      .then(() => toast.success(t("forms.share.publicCopied")))
      .catch(() => toast.error(t("forms.errors.generic")));
  };

  return (
    <section className="space-y-3 rounded border border-border p-3" aria-labelledby="form-public-title">
      <div className="flex items-start gap-3">
        <Globe className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 id="form-public-title" className="text-sm font-medium">{t("forms.share.publicTitle")}</h3>
          <p className="text-xs text-muted-foreground">{t("forms.share.publicDesc")}</p>
        </div>
        <Switch
          checked={enabled}
          disabled={busy || !canToggle}
          aria-label={t("forms.share.publicTitle")}
          onCheckedChange={(checked) => { void run(checked); }}
        />
      </div>

      {!enabled && form.hasFileQuestions && <Callout tone="neutral">{t("forms.errors.public_unsafe")}</Callout>}
      {!enabled && !form.hasFileQuestions && !isOwner && (
        <p className="text-xs text-muted-foreground">{t("forms.share.publicOwnerOnly")}</p>
      )}

      {enabled && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <QrCodeView value={url} size={136} className="shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-1">
              <Input readOnly value={url} aria-label={t("forms.share.publicUrl")} className="h-8 font-mono text-xs" dir="ltr"
                onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="sm" className="gap-1" onClick={copy}>
                <Copy />
                {t("forms.share.copy")}
              </Button>
            </div>
            {isOwner && (
              <Button variant="ghost" size="sm" className="gap-1" disabled={busy} onClick={() => setRotateOpen(true)}>
                <RefreshCw />
                {t("forms.share.publicRotate")}
              </Button>
            )}
            {form.status !== "open" && <p className="text-xs text-muted-foreground">{t("forms.share.publicOpenOnly")}</p>}
            <p className="text-xs text-muted-foreground">{t("forms.share.publicNote")}</p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={rotateOpen}
        onOpenChange={setRotateOpen}
        title={t("forms.share.publicRotateTitle")}
        description={t("forms.share.publicRotateDesc")}
        confirmLabel={t("forms.share.publicRotate")}
        onConfirm={() => { void run(true, true); }}
      />
    </section>
  );
}
