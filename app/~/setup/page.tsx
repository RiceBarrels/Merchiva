"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MerchivaLogo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Check, ArrowRight, ArrowLeft, Clock, MapPin, Store, UserPlus, Link2, SkipForward, Send, Plus, X, Mail, CreditCard } from "lucide-react";
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";
import { Spinner } from "@/components/ui/loaders/geometric";

interface InviteRow { email: string; role: string; }

interface GoogleAddressPlace {
  address: string;
  locationLatitude: string | null;
  locationLongitude: string | null;
  googlePlacesId: string | null;
}

interface GooglePlace {
  id?: string;
  formattedAddress?: string;
  location?: unknown;
  fetchFields: (request: { fields: string[] }) => Promise<void>;
}

interface GooglePlacePrediction {
  placeId?: string;
  toPlace: () => GooglePlace;
}

interface GooglePlaceSelectEvent extends Event {
  placePrediction?: GooglePlacePrediction;
  place?: GooglePlace;
}

type PlaceAutocompleteElementInstance = HTMLElement & {
  placeholder?: string;
};

type PlaceAutocompleteElementConstructor = new (options?: Record<string, unknown>) => PlaceAutocompleteElementInstance;

interface GooglePlacesLibrary {
  PlaceAutocompleteElement: PlaceAutocompleteElementConstructor;
}

interface GoogleMapsNamespace {
  maps: {
    importLibrary: (library: "places") => Promise<unknown>;
  };
}

const STEP_KEYS = ["storeInfo", "hours", "team", "pos"] as const;
const GOOGLE_PLACES_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || "";
const GOOGLE_MAPS_SCRIPT_ID = "merchiva-google-maps-js";

let googleMapsPromise: Promise<GoogleMapsNamespace | null> | null = null;

function getGoogleMapsNamespace(): GoogleMapsNamespace | null {
  if (typeof window === "undefined") return null;
  const maybeGoogle = (window as Window & { google?: unknown }).google;
  if (!maybeGoogle || typeof maybeGoogle !== "object") return null;

  const maps = (maybeGoogle as Record<string, unknown>).maps;
  if (!maps || typeof maps !== "object") return null;

  const importLibrary = (maps as Record<string, unknown>).importLibrary;
  if (typeof importLibrary !== "function") return null;

  return {
    maps: {
      importLibrary: (library: "places") => (importLibrary as (library: "places") => Promise<unknown>)(library),
    },
  };
}

function loadGoogleMaps(): Promise<GoogleMapsNamespace | null> {
  if (typeof window === "undefined" || !GOOGLE_PLACES_API_KEY) return Promise.resolve(null);

  const ready = getGoogleMapsNamespace();
  if (ready) return Promise.resolve(ready);
  if (googleMapsPromise) return googleMapsPromise;

  googleMapsPromise = new Promise((resolve) => {
    const finish = () => resolve(getGoogleMapsNamespace());
    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => resolve(null), { once: true });
      return;
    }

    const params = new URLSearchParams({
      key: GOOGLE_PLACES_API_KEY,
      v: "weekly",
      loading: "async",
    });
    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => resolve(null), { once: true });
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

function getPlacesLibrary(value: unknown): GooglePlacesLibrary | null {
  if (!value || typeof value !== "object") return null;
  const placeAutocompleteElement = (value as Record<string, unknown>).PlaceAutocompleteElement;
  if (typeof placeAutocompleteElement !== "function") return null;
  return {
    PlaceAutocompleteElement: placeAutocompleteElement as PlaceAutocompleteElementConstructor,
  };
}

function getCoordinateStrings(location: unknown): Pick<GoogleAddressPlace, "locationLatitude" | "locationLongitude"> {
  if (!location || typeof location !== "object") {
    return { locationLatitude: null, locationLongitude: null };
  }

  const record = location as Record<string, unknown>;
  const lat = record.lat;
  const lng = record.lng;

  if (typeof lat === "function" && typeof lng === "function") {
    const latValue = (lat as (this: unknown) => unknown).call(location);
    const lngValue = (lng as (this: unknown) => unknown).call(location);
    return {
      locationLatitude: typeof latValue === "number" && Number.isFinite(latValue) ? String(latValue) : null,
      locationLongitude: typeof lngValue === "number" && Number.isFinite(lngValue) ? String(lngValue) : null,
    };
  }

  return {
    locationLatitude: typeof lat === "number" && Number.isFinite(lat) ? String(lat) : null,
    locationLongitude: typeof lng === "number" && Number.isFinite(lng) ? String(lng) : null,
  };
}

function Stepper({ step }: { step: number }) {
  const t = useT();
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {STEP_KEYS.map((stepKey, i, arr) => {
        const label = t(`setup.steps.${stepKey}`);
        const done = i < step;
        const active = i === step;
        return (
          <div key={stepKey} className="contents">
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-semibold font-mono",
                active || done ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              )}>
                {done ? <Check className="h-[11px] w-[11px]" strokeWidth={3} /> : i + 1}
              </div>
              <span className={cn(
                "text-[11.5px]",
                active ? "font-semibold text-foreground" : "font-medium text-muted-foreground/60"
              )}>{label}</span>
            </div>
            {i < arr.length - 1 && <div className={cn("flex-1 h-px mx-0.5", i < step ? "bg-muted-foreground/40" : "bg-border")} />}
          </div>
        );
      })}
    </div>
  );
}

function GoogleAddressInput({
  value,
  onChange,
  onPlaceSelect,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: GoogleAddressPlace) => void;
  placeholder: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">(
    GOOGLE_PLACES_API_KEY ? "loading" : "fallback"
  );

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!GOOGLE_PLACES_API_KEY) return;

    let disposed = false;
    let element: PlaceAutocompleteElementInstance | null = null;
    let selectListener: EventListener | null = null;

    loadGoogleMaps()
      .then(async (google) => {
        if (disposed) return;

        const library = google ? getPlacesLibrary(await google.maps.importLibrary("places")) : null;
        const host = hostRef.current;
        if (!library || !host) {
          setStatus("fallback");
          return;
        }

        if (valueRef.current.trim()) {
          setStatus("fallback");
          return;
        }

        element = new library.PlaceAutocompleteElement();
        element.placeholder = placeholder;
        element.style.display = "block";
        element.style.width = "100%";

        selectListener = (event: Event) => {
          const { placePrediction, place: selectedPlace } = event as GooglePlaceSelectEvent;
          const place = placePrediction?.toPlace() ?? selectedPlace;
          if (!place) return;

          void place.fetchFields({ fields: ["id", "formattedAddress", "location"] }).then(() => {
            if (disposed) return;

            const nextAddress = place.formattedAddress?.trim();
            if (!nextAddress) return;

            const coordinates = getCoordinateStrings(place.location);
            onChange(nextAddress);
            onPlaceSelect({
              address: nextAddress,
              googlePlacesId: place.id ?? placePrediction?.placeId ?? null,
              locationLatitude: coordinates.locationLatitude,
              locationLongitude: coordinates.locationLongitude,
            });
          }).catch(() => {
            if (!disposed) setStatus("fallback");
          });
        };

        element.addEventListener("gmp-select", selectListener);
        element.addEventListener("gmp-placeselect", selectListener);
        host.replaceChildren(element);
        setStatus("ready");
      })
      .catch(() => {
        if (!disposed) setStatus("fallback");
      });

    return () => {
      disposed = true;
      if (element && selectListener) {
        element.removeEventListener("gmp-select", selectListener);
        element.removeEventListener("gmp-placeselect", selectListener);
      }
      element?.remove();
    };
  }, [onChange, onPlaceSelect, placeholder]);

  if (status === "fallback") {
    return (
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11"
      />
    );
  }

  return (
    <div className="relative">
      {status === "loading" && (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-11"
        />
      )}
      <div ref={hostRef} className={cn("min-h-11", status === "loading" && "hidden")} />
    </div>
  );
}

function StoreInfoStep({ storeName, setStoreName, address, setAddress, onAddressPlaceSelect, businessType, setBusinessType, onNext }: {
  storeName: string; setStoreName: (v: string) => void;
  address: string; setAddress: (v: string) => void;
  onAddressPlaceSelect: (place: GoogleAddressPlace) => void;
  businessType: string; setBusinessType: (v: string) => void;
  onNext: () => void;
}) {
  const t = useT();
  const types = [
    { id: "cafe", label: t("setup.storeInfo.types.cafe") },
    { id: "restaurant", label: t("setup.storeInfo.types.restaurant") },
    { id: "retail", label: t("setup.storeInfo.types.retail") },
    { id: "service", label: t("setup.storeInfo.types.service") },
    { id: "other", label: t("setup.storeInfo.types.other") },
  ];
  return (
    <div className="w-full max-w-md mx-auto">
      <Stepper step={0} />
      <div className="flex items-center gap-3 mb-2">
        <Store className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-[22px] font-semibold tracking-tight">{t("setup.storeInfo.title")}</h1>
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">{t("setup.storeInfo.subtitle")}</p>
      <div className="space-y-4">
        <div>
          <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">{t("setup.storeInfo.storeNameLabel")}</label>
          <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder={t("setup.storeInfo.storeNamePlaceholder")} className="h-11" autoFocus />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">{t("setup.storeInfo.addressLabel")}</label>
          <GoogleAddressInput
            value={address}
            onChange={setAddress}
            onPlaceSelect={onAddressPlaceSelect}
            placeholder={t("setup.storeInfo.addressPlaceholder")}
          />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">{t("setup.storeInfo.businessTypeLabel")}</label>
          <div className="grid grid-cols-2 gap-2">
            {types.map((type) => (
              <button key={type.id} onClick={() => setBusinessType(type.id)}
                className={cn("h-10 px-3 rounded-[0.3rem] border text-[13px] font-medium text-left transition-colors",
                  businessType === type.id ? "bg-foreground text-background border-foreground" : "bg-background text-foreground border-border hover:bg-muted"
                )}>{type.label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end mt-6">
        <Button size="lg" className="gap-2" onClick={onNext} disabled={!storeName.trim()}>{t("common.next")} <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function HoursStep({ hours, setHours, onNext, onBack }: {
  hours: { open: string; close: string; days: boolean[] };
  setHours: (v: { open: string; close: string; days: boolean[] }) => void;
  onNext: () => void; onBack: () => void;
}) {
  const t = useT();
  const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return (
    <div className="w-full max-w-md mx-auto">
      <Stepper step={1} />
      <div className="flex items-center gap-3 mb-2">
        <Clock className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-[22px] font-semibold tracking-tight">{t("setup.hours.title")}</h1>
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">{t("setup.hours.subtitle")}</p>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">{t("setup.hours.openLabel")}</label>
            <Input type="time" value={hours.open} onChange={(e) => setHours({ ...hours, open: e.target.value })} className="h-11 font-mono" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">{t("setup.hours.closeLabel")}</label>
            <Input type="time" value={hours.close} onChange={(e) => setHours({ ...hours, close: e.target.value })} className="h-11 font-mono" />
          </div>
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted-foreground mb-2 block">{t("setup.hours.openDaysLabel")}</label>
          <div className="flex gap-1.5">
            {dayKeys.map((dayKey, i) => (
              <button key={dayKey} onClick={() => { const nd = [...hours.days]; nd[i] = !nd[i]; setHours({ ...hours, days: nd }); }}
                className={cn("flex-1 h-10 rounded-[0.3rem] border text-[12px] font-medium transition-colors",
                  hours.days[i] ? "bg-foreground text-background border-foreground" : "bg-background text-muted-foreground border-border hover:bg-muted"
                )}>{t(`setup.hours.days.${dayKey}`)}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-6">
        <Button variant="outline" size="lg" className="gap-2" onClick={onBack}><ArrowLeft className="h-4 w-4" /> {t("common.back")}</Button>
        <Button size="lg" className="gap-2" onClick={onNext}>{t("common.next")} <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function InviteStep({ invites, setInvites, onNext, onBack, onSkip }: {
  invites: InviteRow[]; setInvites: (v: InviteRow[]) => void;
  onNext: () => void; onBack: () => void; onSkip: () => void;
}) {
  const t = useT();
  const filled = invites.filter((r) => r.email.includes("@")).length;
  const sendLabel = filled === 1
    ? t("setup.team.sendInvite").replace("{count}", String(filled))
    : t("setup.team.sendInvites").replace("{count}", String(filled));
  return (
    <div className="w-full max-w-md mx-auto">
      <Stepper step={2} />
      <div className="flex items-center gap-3 mb-2">
        <UserPlus className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-[22px] font-semibold tracking-tight">{t("setup.team.title")}</h1>
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">{t("setup.team.subtitle")}</p>
      <div className="space-y-2">
        {invites.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input value={row.email} onChange={(e) => { const n = [...invites]; n[i] = { ...n[i], email: e.target.value }; setInvites(n); }}
              placeholder="name@email.com" type="email" className="h-10 flex-1" />
            <select value={row.role} onChange={(e) => { const n = [...invites]; n[i] = { ...n[i], role: e.target.value }; setInvites(n); }}
              className="h-10 rounded-[0.3rem] border border-border bg-background px-2 text-[12px] font-medium">
              <option value="manager">{t("setup.team.roleManager")}</option>
              <option value="staff">{t("setup.team.roleStaff")}</option>
            </select>
            <button onClick={() => setInvites(invites.filter((_, idx) => idx !== i))}
              className="h-8 w-8 rounded-[0.3rem] text-muted-foreground hover:bg-muted inline-flex items-center justify-center">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button onClick={() => setInvites([...invites, { email: "", role: "staff" }])}
          className="h-9 px-3 rounded-[0.3rem] border border-dashed border-border text-[12px] text-muted-foreground hover:bg-muted inline-flex items-center gap-1.5 w-full justify-center">
          <Plus className="h-3.5 w-3.5" /> {t("setup.team.addAnother")}
        </button>
      </div>
      <div className="flex items-center justify-between mt-6">
        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="gap-2" onClick={onBack}><ArrowLeft className="h-4 w-4" /> {t("common.back")}</Button>
          <Button variant="ghost" size="lg" className="gap-1.5 text-muted-foreground" onClick={onSkip}><SkipForward className="h-[13px] w-[13px]" /> {t("setup.skip")}</Button>
        </div>
        <Button size="lg" className="gap-2" onClick={onNext}>{filled > 0 ? sendLabel : t("common.next")} <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function PosStep({ onFinish, onBack, onSkip, finishing }: {
  onFinish: () => void; onBack: () => void; onSkip: () => void; finishing: boolean;
}) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const posOptions = [
    { id: "square", label: "Square", desc: t("setup.pos.connectOAuth") },
    { id: "clover", label: "Clover", desc: t("setup.pos.connectOAuth") },
    { id: "none", label: t("setup.pos.noPos"), desc: t("setup.pos.setupLater") },
  ];
  return (
    <div className="w-full max-w-md mx-auto">
      <Stepper step={3} />
      <div className="flex items-center gap-3 mb-2">
        <CreditCard className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-[22px] font-semibold tracking-tight">{t("setup.pos.title")}</h1>
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">{t("setup.pos.subtitle")}</p>
      <div className="space-y-2">
        {posOptions.map((pos) => (
          <button key={pos.id} onClick={() => setSelected(pos.id)}
            className={cn("w-full h-14 px-4 rounded-[0.3rem] border flex items-center gap-3 text-left transition-colors",
              selected === pos.id ? "bg-foreground text-background border-foreground" : "bg-background text-foreground border-border hover:bg-muted"
            )}>
            {pos.id === "none" ? <SkipForward className="h-4 w-4 shrink-0" /> : <Link2 className="h-4 w-4 shrink-0" />}
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium">{pos.label}</div>
              <div className={cn("text-[11px]", selected === pos.id ? "text-background/70" : "text-muted-foreground")}>{pos.desc}</div>
            </div>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between mt-6">
        <div className="flex gap-2">
          <Button variant="outline" size="lg" className="gap-2" onClick={onBack}><ArrowLeft className="h-4 w-4" /> {t("common.back")}</Button>
          <Button variant="ghost" size="lg" className="gap-1.5 text-muted-foreground" onClick={onSkip}><SkipForward className="h-[13px] w-[13px]" /> {t("setup.skip")}</Button>
        </div>
        <Button size="lg" className="gap-2" onClick={onFinish} disabled={finishing}>
          {finishing ? <Spinner size={16} /> : <><Send className="h-3.5 w-3.5" /> {t("setup.pos.finishSetup")}</>}
        </Button>
      </div>
    </div>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const t = useT();
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [address, setAddress] = useState("");
  const [addressPlace, setAddressPlace] = useState<GoogleAddressPlace | null>(null);
  const [businessType, setBusinessType] = useState("cafe");
  const [hours, setHours] = useState({ open: "07:00", close: "21:00", days: [true, true, true, true, true, true, false] });
  const [invites, setInvites] = useState<InviteRow[]>([{ email: "", role: "staff" }]);

  useEffect(() => {
    const token = localStorage.getItem("stdb_token");
    if (!token) { router.replace("/login"); return; }
    let storeNameTimer: number | null = null;
    try {
      const raw = localStorage.getItem("merchiva_setup_org");
      if (raw) storeNameTimer = window.setTimeout(() => setStoreName(raw), 0);
    } catch {}
    return () => {
      if (storeNameTimer !== null) window.clearTimeout(storeNameTimer);
    };
  }, [router]);

  const handleAddressChange = useCallback((nextAddress: string) => {
    setAddress(nextAddress);
    setAddressPlace((place) => (place?.address === nextAddress ? place : null));
  }, []);

  const handleAddressPlaceSelect = useCallback((place: GoogleAddressPlace) => {
    setAddress(place.address);
    setAddressPlace(place);
  }, []);

  const saveAndFinish = useCallback(async () => {
    setFinishing(true);
    try {
      const conn = getConnection();
      if (conn) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = (conn as any).reducers;
        const orgId = getActiveOrgId();
        const cleanAddress = address.trim();
        const selectedAddressPlace = addressPlace?.address.trim() === cleanAddress ? addressPlace : null;
        if (storeName.trim()) { try { await r.updateOrg({ organizationId: orgId, name: storeName.trim() }); } catch {} }
        try {
          await r.updateSettings({
            organizationId: orgId, businessName: storeName.trim() || null, businessType: businessType || null,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, paymentTaxRate: 0, paymentCurrency: "USD",
            locationLatitude: selectedAddressPlace?.locationLatitude ?? null,
            locationLongitude: selectedAddressPlace?.locationLongitude ?? null,
            googlePlacesId: selectedAddressPlace?.googlePlacesId ?? null,
          });
        } catch {}
        for (const inv of invites.filter((r) => r.email.includes("@"))) {
          try { await r.inviteToOrg({ organizationId: orgId, email: inv.email.trim(), role: inv.role }); } catch {}
        }
        if (cleanAddress) {
          try { await r.addLocation({ organizationId: orgId, name: storeName.trim() || "Main", address: cleanAddress, phone: null, isDefault: true, sortOrder: 0 }); } catch {}
        }
      }
      toast.success(t("setup.toast.complete"));
      router.replace("/~/");
    } catch {
      // The setup signal lives in SpacetimeDB (settings.updatedAt > createdAt
      // after updateSettings runs). If we got here, that reducer either
      // succeeded or threw — the layout will retry the gate on next mount.
      toast.error(t("setup.toast.error"));
      router.replace("/~/");
    }
  }, [storeName, address, addressPlace, businessType, invites, router, t]);

  if (finishing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Spinner size={20} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("setup.settingUp")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="h-14 border-b border-border flex items-center px-5 gap-2.5 shrink-0">
        <MerchivaLogo size={24} fg="var(--background)" bg="var(--foreground)" rounded />
        <span className="text-[13px] font-semibold tracking-tight">Merchiva</span>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
        {step === 0 && <StoreInfoStep storeName={storeName} setStoreName={setStoreName} address={address} setAddress={handleAddressChange} onAddressPlaceSelect={handleAddressPlaceSelect} businessType={businessType} setBusinessType={setBusinessType} onNext={() => setStep(1)} />}
        {step === 1 && <HoursStep hours={hours} setHours={setHours} onNext={() => setStep(2)} onBack={() => setStep(0)} />}
        {step === 2 && <InviteStep invites={invites} setInvites={setInvites} onNext={() => setStep(3)} onBack={() => setStep(1)} onSkip={() => setStep(3)} />}
        {step === 3 && <PosStep onFinish={saveAndFinish} onBack={() => setStep(2)} onSkip={saveAndFinish} finishing={finishing} />}
      </div>
      <div className="h-10 border-t border-border flex items-center justify-between px-6 text-[11px] text-muted-foreground shrink-0">
        <span className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3" />{storeName || t("setup.footer.yourStore")}</span>
        <span className="font-mono">{t("setup.footer.step").replace("{current}", String(step + 1)).replace("{total}", String(STEP_KEYS.length))}</span>
      </div>
    </div>
  );
}
