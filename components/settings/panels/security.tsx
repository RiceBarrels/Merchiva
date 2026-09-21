"use client";

// Settings → Security: passkeys, magic auth and password rules.
//
// Split out of app/manager/settings/page.tsx. The passkey row starts a WorkOS
// OAuth round trip through /api/auth/oauth and comes back to this page; the
// panel reads the signed-in email itself so the page hands it nothing.

import { toast } from "sonner";
import { ChevronRight, Fingerprint, KeyRound, Sparkles } from "lucide-react";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { SRow } from "@/components/settings/rows";
import { useAuth } from "@/lib/auth/context";
import { useT } from "@/lib/i18n/context";

export function SecurityPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const { user: authUser } = useAuth();

  const startPasskeyEnrolment = async () => {
    try {
      const res = await fetch("/api/auth/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "passkey",
          redirectTo: "/manager/settings",
          client: "web",
          ...(authUser?.email ? { loginHint: authUser.email } : {}),
          screenHint: "sign-in",
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? t("settings.passkeysError"));
      }
    } catch {
      toast.error(t("settings.passkeysError"));
    }
  };

  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent className="max-w-md lg:max-w-xl" noPadding>
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("settings.groupSecurity")}>{t("settings.groupSecurity")}</DynamicUIElementTitle>
          <DynamicUIElementDescription className="hidden">{t("settings.groupSecurity")}</DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div>
          <SRow
            icon={<Fingerprint className="h-4 w-4 text-foreground" />}
            title={t("settings.passkeysTitle")}
            meta={t("settings.passkeysMeta")}
            isFirst
            onClick={startPasskeyEnrolment}
            right={<ChevronRight className="h-4 w-4 text-muted-foreground" />}
          />
          <SRow
            icon={<Sparkles className="h-4 w-4 text-foreground" />}
            title={t("settings.magicAuthTitle")}
            meta={t("settings.magicAuthMeta")}
          />
          <SRow
            icon={<KeyRound className="h-4 w-4 text-foreground" />}
            title={t("settings.passwordRulesTitle")}
            meta={t("settings.passwordRulesMeta")}
          />
        </div>
        <p className="px-[18px] pt-3 pb-4 text-[11.5px] leading-relaxed text-muted-foreground">
          {t("settings.passkeysNote")}
        </p>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
