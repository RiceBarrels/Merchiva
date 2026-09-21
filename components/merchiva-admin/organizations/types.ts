/**
 * Row shapes for the tables the Organizations area reads. Keys are the
 * camelCase names adminSql() returns (see lib/spacetimedb/generated/*_table.ts
 * for the canonical column list). Timestamps are unix ms, identities are
 * 64-char hex strings, option none is null.
 */

export interface OrganizationRow {
  id: string;
  ownerId: string;
  name: string;
  createdAt: number;
  stripeCustomerId: string | null;
  subscriptionStatus: string | null;
  subscriptionPriceId: string | null;
  subscriptionInterval: string | null;
  currentPeriodEnd: number | null;
  logoUrl: string | null;
}

export interface UserRow {
  identity: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  lastActiveOrgId: string | null;
  createdAt: number;
  isAdmin: boolean | null;
}

export interface OrgMemberRow {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  displayName: string;
  email: string;
  permissions: string;
  status: string;
  joinedAt: number;
  punchInCode: string | null;
  hourlyRate: number | null;
}

export interface OrgInvitationRow {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  permissions: string;
  token: string;
  expiresAt: number;
  acceptedAt: number | null;
  createdAt: number;
}

export interface SettingsRow {
  id: string;
  organizationId: string;
  businessName: string | null;
  businessType: string | null;
  timezone: string;
  squareConnected: boolean;
  squareMerchantId: string | null;
  squareLocationId: string | null;
  squareLastSyncedAt: number | null;
  paymentTaxRate: number;
  paymentCurrency: string;
  locationLatitude: string | null;
  locationLongitude: string | null;
  googlePlacesId: string | null;
  createdAt: number;
  updatedAt: number;
  autoCommitSchedules: boolean | null;
  openingHours: string | null;
  countryCode: string | null;
  assistantConfig: string | null;
  betaFeatures: string | null;
  scheduleProvider: string | null;
  scheduleConnected: boolean | null;
  scheduleLastSyncedAt: number | null;
  scheduleLastSyncStatus: string | null;
  supplierInboundPrefix: string | null;
  deviceApps: string | null;
}

export interface LocationRow {
  id: string;
  organizationId: string;
  name: string;
  address: string | null;
  phone: string | null;
  isDefault: boolean;
  sortOrder: number;
  createdAt: number;
}

export interface StoreDeviceRow {
  id: string;
  organizationId: string;
  deviceId: string;
  name: string;
  enabled: boolean;
  lastSeenAt: number;
  registeredBy: string;
  createdAt: number;
}

/** Same shape the app uses (lib/types.ts Permissions + lib/db/team.ts defaults). */
export const ROLE_PERMISSION_DEFAULTS: Record<string, Record<string, Record<string, boolean>>> = {
  staff: {
    dashboard: { view: true },
    inventory: { view: true, edit: false },
    sales: { view: true },
    staffing: { view: true, edit: false },
    products: { view: true, edit: false },
    settings: { view: true },
    pos: { view: true, edit: false },
    team: { view: false, invite: false, edit: false },
    website: { view: false, edit: false },
    training_grading: { view: false, edit: false },
    merchiva: { view: true },
  },
  manager: {
    dashboard: { view: true },
    inventory: { view: true, edit: true },
    sales: { view: true },
    staffing: { view: true, edit: true },
    products: { view: true, edit: true },
    settings: { view: true },
    pos: { view: true, edit: true },
    team: { view: true, invite: true, edit: true },
    website: { view: true, edit: true },
    training_grading: { view: true, edit: true },
    merchiva: { view: true },
  },
};

export const SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due", "canceled", "incomplete", "none"] as const;

export function subscriptionTone(status: string | null): "neutral" | "ok" | "warn" | "danger" {
  switch (status) {
    case "active":
    case "trialing":
      return "ok";
    case "past_due":
    case "incomplete":
      return "warn";
    case "canceled":
      return "danger";
    default:
      return "neutral";
  }
}

export function userLabel(user: UserRow | undefined, fallback: string): string {
  if (!user) return fallback;
  return user.displayName ? `${user.displayName} <${user.email}>` : user.email;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** datetime-local value ↔ unix ms helpers. */
export function msToLocalInput(ms: number | null | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms === 0) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function localInputToMs(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}
