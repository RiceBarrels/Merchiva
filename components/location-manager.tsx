"use client";

import { useState, useMemo } from "react";
import { MapPin, Plus, Pencil, Trash2, Star, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogActions } from "@/components/ui/dialog-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useLocations } from "@/lib/spacetimedb/hooks";
import {
  addLocation,
  updateLocation,
  deleteLocation,
} from "@/lib/spacetimedb/actions";
import { useT } from "@/lib/i18n/context";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/loaders/geometric";

interface LocationManagerProps {
  organizationId: string;
}

interface LocationForm {
  name: string;
  address: string;
  phone: string;
  isDefault: boolean;
}

const emptyForm: LocationForm = {
  name: "",
  address: "",
  phone: "",
  isDefault: false,
};

export function LocationManager({ organizationId }: LocationManagerProps) {
  const t = useT();
  const [locationRows] = useLocations();

  // Filter locations by organization and sort
  const locations = useMemo(() => {
    if (!locationRows) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (locationRows as unknown as any[])
      .filter((loc) => loc.organizationId === organizationId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [locationRows, organizationId]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LocationForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const openAddForm = () => {
    setEditingId(null);
    setForm({ ...emptyForm, isDefault: locations.length === 0 });
    setShowForm(true);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openEditForm = (loc: any) => {
    setEditingId(loc.id.toString());
    setForm({
      name: loc.name ?? "",
      address: loc.address ?? "",
      phone: loc.phone ?? "",
      isDefault: loc.isDefault ?? false,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t("locations.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateLocation(editingId, {
          name: form.name.trim(),
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          isDefault: form.isDefault,
        });
        toast.success(t("locations.updated"));
      } else {
        await addLocation({
          name: form.name.trim(),
          address: form.address.trim() || null,
          phone: form.phone.trim() || null,
          isDefault: form.isDefault || locations.length === 0,
          sortOrder: locations.length,
        });
        toast.success(t("locations.added"));
      }
      closeForm();
    } catch (err) {
      console.error("Failed to save location:", err);
      toast.error(t("locations.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSetDefault = async (loc: any) => {
    try {
      await updateLocation(loc.id.toString(), { isDefault: true });
      toast.success(t("locations.defaultSet"));
    } catch (err) {
      console.error("Failed to set default:", err);
      toast.error(t("locations.saveFailed"));
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDelete = async (loc: any) => {
    if (loc.isDefault) {
      toast.error(t("locations.cannotDeleteDefault"));
      return;
    }
    setDeletingId(loc.id.toString());
    try {
      await deleteLocation(loc.id.toString());
      toast.success(t("locations.deleted"));
      setConfirmDeleteId(null);
    } catch (err) {
      console.error("Failed to delete location:", err);
      toast.error(t("locations.deleteFailed"));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">
              {t("locations.title")}
            </CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={openAddForm}
          >
            <Plus className="h-3 w-3 mr-1" />
            {t("locations.addLocation")}
          </Button>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="pt-3">
        {/* Empty state */}
        {locations.length === 0 && !showForm && (
          <EmptyState
            icon={MapPin}
            title={t("locations.empty")}
            description={t("locations.emptyDesc")}
          />
        )}

        {/* Location list */}
        {locations.length > 0 && (
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {locations.map((loc: any) => {
              const locId = loc.id.toString();
              const isConfirming = confirmDeleteId === locId;

              return (
                <div
                  key={locId}
                  className={cn(
                    "flex items-start gap-3 p-3 border border-border rounded-lg bg-background",
                    "hover:border-muted-foreground/30 transition-colors"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {loc.name}
                      </span>
                      {loc.isDefault && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] h-4 px-1.5 shrink-0"
                        >
                          <Star className="h-2.5 w-2.5 mr-0.5" />
                          {t("locations.default")}
                        </Badge>
                      )}
                    </div>
                    {loc.address && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {loc.address}
                      </p>
                    )}
                    {loc.phone && (
                      <p className="text-xs text-muted-foreground mt-0.5 font-mono tabular-nums">
                        {loc.phone}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!loc.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[11px] px-2"
                        onClick={() => handleSetDefault(loc)}
                      >
                        <Star className="h-3 w-3 mr-1" />
                        {t("locations.setDefault")}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEditForm(loc)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    {!loc.isDefault && (
                      <>
                        {isConfirming ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              className="text-[11px] px-2"
                              onClick={() => handleDelete(loc)}
                              disabled={deletingId === locId}
                            >
                              {deletingId === locId ? (
                                <Spinner size={12} />
                              ) : (
                                t("locations.confirmYes")
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setConfirmDeleteId(locId)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add / Edit form */}
        {showForm && (
          <div
            className={cn(
              "border border-border rounded-lg p-4 bg-muted/30",
              locations.length > 0 && "mt-3"
            )}
          >
            <Eyebrow className="mb-3">
              {editingId
                ? t("locations.editLocation")
                : t("locations.addLocation")}
            </Eyebrow>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">{t("locations.name")}</Label>
                <Input
                  placeholder={t("locations.namePlaceholder")}
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("locations.address")}</Label>
                <Input
                  placeholder={t("locations.addressPlaceholder")}
                  value={form.address}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, address: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("locations.phone")}</Label>
                <Input
                  placeholder={t("locations.phonePlaceholder")}
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: e.target.value }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={form.isDefault}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, isDefault: checked === true }))
                  }
                />
                <span className="text-xs text-foreground">
                  {t("locations.setAsDefault")}
                </span>
              </label>

              <DialogActions
                divider={false}
                className="pt-1"
                onCancel={closeForm}
                onConfirm={handleSave}
                saving={saving}
                cancelLabel={t("locations.cancel")}
                confirmLabel={editingId ? t("locations.save") : t("locations.add")}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
