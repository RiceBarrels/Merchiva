export const BETA_FEATURES = [
  {
    key: "pos",
    labelKey: "settings.betaFeaturePOS",
    descriptionKey: "settings.betaFeaturePOSDesc",
    href: "/~/pos",
  },
  {
    key: "website",
    labelKey: "settings.betaFeatureWebsite",
    descriptionKey: "settings.betaFeatureWebsiteDesc",
    href: "/~/builder",
  },
  {
    key: "design",
    labelKey: "settings.betaFeatureDesign",
    descriptionKey: "settings.betaFeatureDesignDesc",
    href: "/~/design",
  },
] as const;

export type BetaFeatureKey = (typeof BETA_FEATURES)[number]["key"];
export type BetaFeaturesConfig = Record<BetaFeatureKey, boolean>;

export const DEFAULT_BETA_FEATURES: BetaFeaturesConfig = {
  pos: false,
  website: false,
  design: false,
};

const LOCAL_STORAGE_PREFIX = "merchiva_beta_features:";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseBetaFeatures(raw: unknown): BetaFeaturesConfig {
  let value = raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      value = JSON.parse(raw);
    } catch {
      value = null;
    }
  }

  const next: BetaFeaturesConfig = { ...DEFAULT_BETA_FEATURES };
  if (!isObject(value)) return next;

  for (const feature of BETA_FEATURES) {
    next[feature.key] = value[feature.key] === true;
  }

  return next;
}

export function betaFeatureForPath(pathname: string | null | undefined): BetaFeatureKey | null {
  if (!pathname) return null;
  if (pathname === "/~/pos" || pathname.startsWith("/~/pos/")) return "pos";
  if (pathname === "/~/customers" || pathname.startsWith("/~/customers/")) return "website";
  if (pathname === "/~/marketing" || pathname.startsWith("/~/marketing/")) return "website";
  if (pathname === "/~/builder" || pathname.startsWith("/~/builder/")) return "website";
  if (pathname === "/~/design" || pathname.startsWith("/~/design/")) return "design";
  return null;
}

function localStorageKey(organizationId: string): string {
  return `${LOCAL_STORAGE_PREFIX}${organizationId}`;
}

export function readLocalBetaFeatures(organizationId: string | null | undefined): BetaFeaturesConfig {
  if (!organizationId || typeof window === "undefined") return { ...DEFAULT_BETA_FEATURES };
  try {
    return parseBetaFeatures(window.localStorage.getItem(localStorageKey(organizationId)));
  } catch {
    return { ...DEFAULT_BETA_FEATURES };
  }
}

export function writeLocalBetaFeatures(
  organizationId: string | null | undefined,
  config: BetaFeaturesConfig,
): void {
  if (!organizationId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(localStorageKey(organizationId), JSON.stringify(config));
  } catch {}
}

export function betaFeaturesFromSettingsRow(
  row: unknown,
  organizationId: string | null | undefined,
): BetaFeaturesConfig {
  if (isObject(row) && Object.prototype.hasOwnProperty.call(row, "betaFeatures")) {
    return parseBetaFeatures(row.betaFeatures);
  }
  return readLocalBetaFeatures(organizationId);
}
