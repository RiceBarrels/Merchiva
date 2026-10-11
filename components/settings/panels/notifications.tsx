"use client";

// Settings → Notifications: the "Email me" switch and this device's alert switch.
//
// Split out of app/manager/settings/page.tsx. Notifications are built in: a dot on
// the feature that has something new, an alert, and an email. A person has two
// switches. Email follows the account (components/settings/notification-email.tsx).
// Alerts are this device's: web and the Tauri desktop shell take different paths to
// the same switch — a browser push subscription vs. the native permission — so the
// row reads whichever applies. A shared store screen gets neither (the switches would
// be the tablet account's), and a store tablet never subscribes to push.

import { useState } from "react";
import { Bell, Mail } from "lucide-react";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { SToggleRow } from "@/components/settings/rows";
import {
  NotificationEmailExplainer,
  notificationEmailMeta,
  useNotificationEmailSwitch,
} from "@/components/settings/notification-email";
import { useAuth } from "@/lib/auth/context";
import { usePermissions } from "@/lib/context/permissions";
import { isOrgAdminRole } from "@/lib/drive/access";
import { useT } from "@/lib/i18n/context";
import { useIsNativeShell } from "@/lib/native-shell";
import { useNotificationViewer } from "@/lib/notifications/viewer";
import { usePushNotifications } from "@/lib/spacetimedb/hooks/usePushNotifications";
import {
  requestTauriNotificationPermission,
  tauriNotificationsPref,
} from "@/lib/spacetimedb/hooks/useTauriNotifications";

export function NotificationsPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const { user } = useAuth();
  const { role } = usePermissions();
  const viewer = useNotificationViewer();
  const email = useNotificationEmailSwitch();
  const push = usePushNotifications();
  const isTauri = useIsNativeShell();
  // Read straight out of the stored preference. `isEnabled()` returns false on
  // the server, and `useIsNativeShell()` is false until it mounts, so the value
  // is never rendered before the browser has it — no effect, no extra render.
  const [tauriPushEnabled, setTauriPushEnabled] = useState(() => tauriNotificationsPref.isEnabled());

  const desktopMeta = isTauri
    ? tauriPushEnabled
      ? t("settings.desktopEnabled")
      : t("settings.desktopDisabled")
    : !push.supported
      ? t("settings.desktopUnsupported")
      : push.permission === "denied"
        ? t("settings.desktopBlocked")
        : push.isSubscribed
          ? t("settings.desktopEnabled")
          : t("settings.desktopDisabled");

  const toggleDesktop = () => {
    if (isTauri) {
      const next = !tauriPushEnabled;
      if (next) {
        void requestTauriNotificationPermission().then((ok) => {
          tauriNotificationsPref.setEnabled(ok);
          setTauriPushEnabled(ok);
        });
      } else {
        tauriNotificationsPref.setEnabled(false);
        setTauriPushEnabled(false);
      }
      return;
    }
    if (push.busy) return;
    if (push.isSubscribed) push.disable().catch(() => {});
    else push.enable().catch(() => {});
  };

  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("settings.groupNotifications")}>{t("settings.groupNotifications")}</DynamicUIElementTitle>
          <DynamicUIElementDescription className="hidden">{t("settings.groupNotifications")}</DynamicUIElementDescription>
        </DynamicUIElementHeader>
        {viewer.shared ? (
          <p className="px-[18px] py-4 text-sm text-muted-foreground">{t("notify.settings.shared")}</p>
        ) : (
          <div>
            <SToggleRow
              icon={<Mail className="h-4 w-4 text-foreground" />}
              title={t("notify.settings.email")}
              meta={notificationEmailMeta(email.checked, user?.email, t)}
              checked={email.checked}
              disabled={email.disabled}
              onChange={email.toggle}
              isFirst
            />
            {viewer.personalDevice && (
              <SToggleRow
                icon={<Bell className="h-4 w-4 text-foreground" />}
                title={t("settings.desktopNotifications")}
                meta={desktopMeta}
                checked={isTauri ? tauriPushEnabled : push.isSubscribed}
                onChange={toggleDesktop}
              />
            )}
            <div className="border-t border-border px-[18px] py-4">
              <NotificationEmailExplainer manager={isOrgAdminRole(role)} />
            </div>
          </div>
        )}
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
