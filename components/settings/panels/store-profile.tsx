"use client";

// Settings → Store image: the logo shown wherever the user picks a store.
//
// Split out of app/manager/settings/page.tsx, which had grown past 3500 lines.
// The panel owns everything it needs: the org comes from `usePermissions()` and
// the logo from the organization row, so the page hands it nothing but its open
// state.

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DynamicUIElement,
  DynamicUIElementContent,
  DynamicUIElementDescription,
  DynamicUIElementHeader,
  DynamicUIElementTitle,
} from "@/components/ui/dynamic-ui-element";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/loaders/geometric";
import { StoreLogo } from "@/components/store-picker";
import { usePermissions } from "@/lib/context/permissions";
import { hapticSuccess } from "@/lib/haptics";
import { useT } from "@/lib/i18n/context";
import { updateOrgLogo } from "@/lib/spacetimedb/actions";
import { useOrganizations } from "@/lib/spacetimedb/hooks";
import { uploadFiles } from "@/lib/uploadthing";

export interface StoreProfilePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StoreProfilePanel({ open, onOpenChange }: StoreProfilePanelProps) {
  const t = useT();
  const { role, organizationId, currentOrg } = usePermissions();
  const [orgRows] = useOrganizations();
  const [uploading, setUploading] = useState(false);

  const storeLogoUrl =
    orgRows.find((o) => o.id.toString() === organizationId)?.logoUrl ?? null;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so re-picking the same file fires onChange again.
    e.target.value = "";
    if (!file || !organizationId) return;

    if (!file.type.startsWith("image/")) {
      toast.error(t("components.imageUpload.unsupportedType"));
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error(t("components.imageUpload.fileTooLarge"));
      return;
    }

    setUploading(true);
    try {
      const [res] = await uploadFiles("avatar", { files: [file] });
      await updateOrgLogo(organizationId, res.ufsUrl);
      hapticSuccess();
      toast.success(t("settings.storeImageSaved"));
    } catch (err) {
      console.error("Store image upload failed:", err);
      toast.error(t("settings.storeImageFailed"));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!organizationId) return;
    setUploading(true);
    try {
      await updateOrgLogo(organizationId, null);
      hapticSuccess();
      toast.success(t("settings.storeImageSaved"));
    } catch (err) {
      console.error("Store image remove failed:", err);
      toast.error(t("settings.storeImageFailed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <DynamicUIElement open={open} onOpenChange={onOpenChange}>
      <DynamicUIElementContent className="max-w-md lg:max-w-2xl" noPadding>
        <DynamicUIElementHeader>
          <DynamicUIElementTitle mobileTitle={t("settings.storeImage")}>
            {t("settings.storeImage")}
          </DynamicUIElementTitle>
          <DynamicUIElementDescription className="hidden">
            {t("settings.storeImageHint")}
          </DynamicUIElementDescription>
        </DynamicUIElementHeader>
        <div className="px-[18px] py-4 space-y-5">
          <div className="space-y-2">
            <Eyebrow>{t("settings.storeImage")}</Eyebrow>
            <div className="rounded-lg border border-border bg-card p-3 flex items-center gap-3">
              <StoreLogo
                name={currentOrg?.name ?? ""}
                logoUrl={storeLogoUrl}
                className="h-14 w-14 text-lg"
              />
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {t("settings.storeImageHint")}
                </p>
                {role === "owner" && (
                  <div className="flex items-center gap-1.5">
                    <label className="flex cursor-pointer items-center gap-1.5 rounded border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors">
                      {uploading ? <Spinner size={12} /> : null}
                      {t("settings.storeImageUpload")}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploading}
                        onChange={handleUpload}
                      />
                    </label>
                    {storeLogoUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        className="text-muted-foreground"
                        disabled={uploading}
                        onClick={handleRemove}
                      >
                        {t("settings.storeImageRemove")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </DynamicUIElementContent>
    </DynamicUIElement>
  );
}
