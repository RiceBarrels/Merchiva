"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { IconTile } from "@/components/ui/icon-tile";
import { Input } from "@/components/ui/input";
import { OptionRow } from "@/components/ui/option-row";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { MerchivaLogo } from "@/components/logo";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Check, ArrowRight, ArrowLeft, Clock, MapPin, Store, UserPlus, Link2, SkipForward, Send, Plus, X, Mail, CreditCard, CalendarClock } from "lucide-react";
import { getConnection, getActiveOrgId } from "@/lib/spacetimedb/client";
import { Spinner } from "@/components/ui/loaders/geometric";
import { SCHEDULE_PROVIDERS, type ScheduleProviderId } from "@/lib/schedule-integrations";

interface InviteRow { email: string; role: string; }

type SetupHours = { open: string; close: string; days: boolean[] };

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

const STEP_KEYS = ["storeInfo", "hours", "team", "schedule", "pos"] as const;
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
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
                "w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-semibold font-mono tabular-nums",
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

function ScheduleProviderCard({
  provider,
  selected,
  onSelect,
}: {
  provider: (typeof SCHEDULE_PROVIDERS)[number];
  selected: boolean;
  onSelect: (provider: ScheduleProviderId) => void;
}) {
  const t = useT();
  const comingSoon = provider.status !== "available";

  return (
    <OptionRow
      selected={selected}
      onSelect={() => onSelect(provider.id)}
      leading={
        <IconTile
          icon={CalendarClock}
          className={cn(selected && "border-foreground bg-foreground text-background")}
        />
      }
      title={
        <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
          {provider.label}
          {provider.id === "built_in" && (
            <Badge variant="default" className="h-4 px-1.5 text-[9.5px] uppercase tracking-wider">
              {t("setup.schedule.recommended")}
            </Badge>
          )}
          {comingSoon && (
            <StatusBadge tone="warning" size="xs">
              {t("settings.comingSoon")}
            </StatusBadge>
          )}
        </span>
      }
      description={
        <>
          <span className="block leading-relaxed">{provider.description}</span>
          {provider.id === "7shifts" && (
            <span className="mt-1.5 inline-flex items-center gap-1.5 text-[10.5px] font-medium">
              <Link2 className="h-3 w-3" />
              {t("setup.schedule.connectAfterSetup")}
            </span>
          )}
        </>
      }
    />
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
        <Field label={t("setup.storeInfo.storeNameLabel")} htmlFor="setup-store-name">
          <Input id="setup-store-name" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder={t("setup.storeInfo.storeNamePlaceholder")} className="h-11" autoFocus />
        </Field>
        <Field label={t("setup.storeInfo.addressLabel")}>
          <GoogleAddressInput
            value={address}
            onChange={setAddress}
            onPlaceSelect={onAddressPlaceSelect}
            placeholder={t("setup.storeInfo.addressPlaceholder")}
          />
        </Field>
        <Field label={t("setup.storeInfo.businessTypeLabel")}>
          <SegmentedControl
            variant="chips"
            size="lg"
            fullWidth
            className="grid grid-cols-2 gap-2"
            aria-label={t("setup.storeInfo.businessTypeLabel")}
            value={businessType}
            onChange={setBusinessType}
            options={types.map((type) => ({ value: type.id, label: type.label }))}
          />
        </Field>
      </div>
      <div className="flex justify-end mt-6">
        <Button size="lg" className="gap-2" onClick={onNext} disabled={!storeName.trim()}>{t("common.next")} <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function HoursStep({ hours, setHours, onNext, onBack }: {
  hours: SetupHours;
  setHours: (v: SetupHours) => void;
  onNext: () => void; onBack: () => void;
}) {
  const t = useT();
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
          <Field label={t("setup.hours.openLabel")} htmlFor="setup-hours-open">
            <Input id="setup-hours-open" type="time" value={hours.open} onChange={(e) => setHours({ ...hours, open: e.target.value })} className="h-11 font-mono tabular-nums" />
          </Field>
          <Field label={t("setup.hours.closeLabel")} htmlFor="setup-hours-close">
            <Input id="setup-hours-close" type="time" value={hours.close} onChange={(e) => setHours({ ...hours, close: e.target.value })} className="h-11 font-mono tabular-nums" />
          </Field>
        </div>
        <Field label={t("setup.hours.openDaysLabel")}>
          <div className="flex gap-1.5">
            {DAY_KEYS.map((dayKey, i) => (
              <button key={dayKey} type="button" aria-pressed={hours.days[i]} onClick={() => { const nd = [...hours.days]; nd[i] = !nd[i]; setHours({ ...hours, days: nd }); }}
                className={cn("flex-1 h-10 rounded-lg border text-[12px] font-medium transition-colors",
                  hours.days[i] ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                )}>{t(`setup.hours.days.${dayKey}`)}</button>
            ))}
          </div>
        </Field>
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
            <Select value={row.role} onValueChange={(v) => { const n = [...invites]; n[i] = { ...n[i], role: String(v) }; setInvites(n); }}>
              <SelectTrigger className="data-[size=default]:h-10 text-[12px] font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">{t("setup.team.roleManager")}</SelectItem>
                <SelectItem value="staff">{t("setup.team.roleStaff")}</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="icon" className="text-muted-foreground" aria-label={t("common.delete")} onClick={() => setInvites(invites.filter((_, idx) => idx !== i))}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="lg" className="w-full border-dashed text-[12px] text-muted-foreground" onClick={() => setInvites([...invites, { email: "", role: "staff" }])}>
          <Plus className="h-3.5 w-3.5" /> {t("setup.team.addAnother")}
        </Button>
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

function ScheduleStep({
  selectedProvider,
  setSelectedProvider,
  onNext,
  onBack,
}: {
  selectedProvider: ScheduleProviderId;
  setSelectedProvider: (provider: ScheduleProviderId) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const selected = SCHEDULE_PROVIDERS.find((provider) => provider.id === selectedProvider) ?? SCHEDULE_PROVIDERS[0];
  return (
    <div className="w-full max-w-md mx-auto">
      <Stepper step={3} />
      <div className="flex items-center gap-3 mb-2">
        <CalendarClock className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-[22px] font-semibold tracking-tight">{t("setup.schedule.title")}</h1>
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">{t("setup.schedule.subtitle")}</p>

      <div className="space-y-2">
        {SCHEDULE_PROVIDERS.map((provider) => (
          <ScheduleProviderCard
            key={provider.id}
            provider={provider}
            selected={selectedProvider === provider.id}
            onSelect={setSelectedProvider}
          />
        ))}
      </div>

      {selectedProvider === "7shifts" && (
        <Callout tone="neutral" className="mt-3">
          {t("setup.schedule.oauthNote")}
        </Callout>
      )}

      <div className="flex items-center justify-between mt-6">
        <Button variant="outline" size="lg" className="gap-2" onClick={onBack}><ArrowLeft className="h-4 w-4" /> {t("common.back")}</Button>
        <Button size="lg" className="gap-2" onClick={onNext}>
          {selected.status === "available" ? t("common.next") : t("setup.schedule.saveChoice")} <ArrowRight className="h-4 w-4" />
        </Button>
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
      <Stepper step={4} />
      <div className="flex items-center gap-3 mb-2">
        <CreditCard className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-[22px] font-semibold tracking-tight">{t("setup.pos.title")}</h1>
      </div>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-6">{t("setup.pos.subtitle")}</p>
      <div className="space-y-2">
        {posOptions.map((pos) => (
          <OptionRow
            key={pos.id}
            selected={selected === pos.id}
            onSelect={() => setSelected(pos.id)}
            icon={pos.id === "none" ? SkipForward : Link2}
            title={pos.label}
            description={pos.desc}
          />
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
  const [hours, setHours] = useState<SetupHours>({ open: "07:00", close: "21:00", days: [true, true, true, true, true, true, false] });
  const [invites, setInvites] = useState<InviteRow[]>([{ email: "", role: "staff" }]);
  const [scheduleProvider, setScheduleProvider] = useState<ScheduleProviderId>("built_in");

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
        try {
          await r.setScheduleIntegration({
            organizationId: orgId,
            provider: scheduleProvider,
          });
        } catch {}
        for (const inv of invites.filter((r) => r.email.includes("@"))) {
          try { await r.inviteToOrg({ organizationId: orgId, email: inv.email.trim(), role: inv.role }); } catch {}
        }
        if (cleanAddress) {
          try { await r.addLocation({ organizationId: orgId, name: storeName.trim() || "Main", address: cleanAddress, phone: null, isDefault: true, sortOrder: 0 }); } catch {}
        }
        if (scheduleProvider === "7shifts") {
          toast.success(t("setup.toast.complete"));
          window.location.href = `/api/schedule/connect?provider=7shifts&orgId=${encodeURIComponent(orgId)}`;
          return;
        }
      }
      toast.success(t("setup.toast.complete"));
      router.replace("/manager/");
    } catch {
      // The setup signal lives in SpacetimeDB (settings.updatedAt > createdAt
      // after updateSettings runs). If we got here, that reducer either
      // succeeded or threw — the layout will retry the gate on next mount.
      toast.error(t("setup.toast.error"));
      router.replace("/manager/");
    }
  }, [storeName, address, addressPlace, businessType, invites, scheduleProvider, router, t]);

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
    <div className="flex min-h-[100dvh] flex-col bg-background lg:h-[100dvh] lg:overflow-hidden">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <MerchivaLogo size={24} fg="var(--background)" bg="var(--foreground)" rounded />
          <span className="truncate text-[13px] font-semibold tracking-tight">Merchiva</span>
        </div>
        <span className="hidden font-mono text-[11px] tabular-nums text-muted-foreground sm:block">
          {t("setup.footer.step").replace("{current}", String(step + 1)).replace("{total}", String(STEP_KEYS.length))}
        </span>
      </div>
      <div className="flex flex-1 overflow-y-auto lg:min-h-0 lg:overflow-hidden">
        <section className="flex min-h-[560px] flex-1 items-center justify-center px-5 py-8 sm:px-10 lg:min-h-0 lg:overflow-y-auto">
          {step === 0 && <StoreInfoStep storeName={storeName} setStoreName={setStoreName} address={address} setAddress={handleAddressChange} onAddressPlaceSelect={handleAddressPlaceSelect} businessType={businessType} setBusinessType={setBusinessType} onNext={() => setStep(1)} />}
          {step === 1 && <HoursStep hours={hours} setHours={setHours} onNext={() => setStep(2)} onBack={() => setStep(0)} />}
          {step === 2 && <InviteStep invites={invites} setInvites={setInvites} onNext={() => setStep(3)} onBack={() => setStep(1)} onSkip={() => setStep(3)} />}
          {step === 3 && <ScheduleStep selectedProvider={scheduleProvider} setSelectedProvider={setScheduleProvider} onNext={() => setStep(4)} onBack={() => setStep(2)} />}
          {step === 4 && <PosStep onFinish={saveAndFinish} onBack={() => setStep(3)} onSkip={saveAndFinish} finishing={finishing} />}
        </section>
      </div>
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-t border-border px-4 text-[11px] text-muted-foreground sm:px-6">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{storeName || t("setup.footer.yourStore")}</span>
        </span>
        <span className="font-mono tabular-nums sm:hidden">{t("setup.footer.step").replace("{current}", String(step + 1)).replace("{total}", String(STEP_KEYS.length))}</span>
      </div>
    </div>
  );
}
