"use client";

// Settings → Notifications: the desktop/push switch plus the per-topic toggles.
//
// Split out of app/manager/settings/page.tsx. Web and the Tauri desktop shell
// take different paths to the same switch — a browser push subscription vs. the
// native permission — so the row reads whichever applies.

import { useState } from "react";
import { Bell, Clock, Package } from "lucide-react";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { SToggleRow } from "@/components/settings/rows";
import { useT } from "@/lib/i18n/context";
import { useIsNativeShell } from "@/lib/native-shell";
import { usePushNotifications } from "@/lib/spacetimedb/hooks/usePushNotifications";
import {
  requestTauriNotificationPermission,
  tauriNotificationsPref,
} from "@/lib/spacetimedb/hooks/useTauriNotifications";

export function NotificationsPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const push = usePushNotifications();
  const isTauri = useIsNativeShell();
  // Read straight out of the stored preference. `isEnabled()` returns false on
  // the server, and `useIsNativeShell()` is false until it mounts, so the value
  // is never rendered before the browser has it — no effect, no extra render.
  const [tauriPushEnabled, setTauriPushEnabled] = useState(() => tauriNotificationsPref.isEnabled());
  const [shiftReminders, setShiftReminders] = useState(true);
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(false);

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
        <div>
          <SToggleRow
            icon={<Bell className="h-4 w-4 text-foreground" />}
            title={t("settings.desktopNotifications")}
            meta={desktopMeta}
            checked={isTauri ? tauriPushEnabled : push.isSubscribed}
            onChange={toggleDesktop}
            isFirst
          />
          <SToggleRow
            icon={<Clock className="h-4 w-4 text-foreground" />}
            title={t("settings.shiftReminders")}
            meta={t("settings.beforeShift")}
            checked={shiftReminders}
            onChange={() => setShiftReminders(!shiftReminders)}
          />
          <SToggleRow
            icon={<Package className="h-4 w-4 text-foreground" />}
            title={t("settings.lowStockAlerts")}
            meta={t("settings.belowThreshold")}
            checked={lowStockAlerts}
            onChange={() => setLowStockAlerts(!lowStockAlerts)}
          />
          <SToggleRow
            icon={<Bell className="h-4 w-4 text-foreground" />}
            title={t("settings.weeklySummary")}
            meta={t("settings.performanceDigest")}
            checked={weeklySummary}
            onChange={() => setWeeklySummary(!weeklySummary)}
          />
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
