"use client";

// The "Email me" switch and the plain account of what gets emailed. Shared by
// Settings → Notifications on /manager and the /personal settings panel. Never on a
// shared store screen (lib/notifications/viewer.ts): there the switch would be the
// tablet account's.
//
// The switch is notification_pref.emailEnabled (no row = on), written through
// setNotificationEmail. What is emailed is decided by the module and the cron
// (spacetimedb/src/notify/, lib/notifications/server/); the copy below follows them.

import { useCallback, useState } from "react";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { Callout } from "@/components/ui/callout";
import { useT } from "@/lib/i18n/context";
import { fmt } from "@/lib/i18n/fmt";
import { setNotificationEmail } from "@/lib/spacetimedb/actions/notifications";
import { useNotificationPref } from "@/lib/spacetimedb/hooks/useNotificationSettings";

export interface NotificationEmailSwitch {
  readonly checked: boolean;
  /** Before the module answers, and while a change is being saved. */
  readonly disabled: boolean;
  readonly toggle: () => void;
}

/** The caller's email switch, shown as the value being saved while the write is in flight. */
export function useNotificationEmailSwitch(): NotificationEmailSwitch {
  const t = useT();
  const pref = useNotificationPref();
  const [saving, setSaving] = useState<boolean | null>(null);

  const toggle = useCallback(() => {
    if (!pref.available || saving !== null) return;
    const next = !pref.emailEnabled;
    setSaving(next);
    setNotificationEmail(next)
      .catch((err: unknown) => {
        console.warn("setNotificationEmail failed:", err);
        toast.error(t("notify.settings.saveFailed"));
      })
      .finally(() => setSaving(null));
  }, [pref.available, pref.emailEnabled, saving, t]);

  return { checked: saving ?? pref.emailEnabled, disabled: !pref.available || saving !== null, toggle };
}

/** The switch's one-line meta: where the email goes, or what is left when it is off. */
export function notificationEmailMeta(checked: boolean, email: string | null | undefined, t: (key: string) => string): string {
  if (!checked) return t("notify.settings.emailOff");
  const address = typeof email === "string" ? email.trim() : "";
  return address ? fmt(t("notify.settings.emailTo"), { email: address }) : t("notify.settings.emailOn");
}

/** What gets emailed, in plain words (Settings → Notifications on /manager). */
export function NotificationEmailExplainer({ manager }: { manager: boolean }) {
  const t = useT();
  return (
    <Callout tone="neutral" icon={Mail} title={t("notify.settings.whatTitle")}>
      <ul className="list-disc space-y-1 ps-4">
        <li>{t("notify.settings.whatChannels")}</li>
        <li>{t("notify.settings.whatOther")}</li>
        {manager && <li>{t("notify.settings.whatManagers")}</li>}
        <li>{t("notify.settings.whatPacing")}</li>
        <li>{t("notify.settings.everyDevice")}</li>
      </ul>
    </Callout>
  );
}
