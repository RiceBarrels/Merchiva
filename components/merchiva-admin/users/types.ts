/** Row shapes for the tables the Users console reads (camelCase keys from adminSql). */

export interface UserRow {
  identity: string;
  email: string;
  passwordHash: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  lastActiveOrgId: string | null;
  createdAt: number;
  isAdmin: boolean | null;
}

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
  parentOrgId: string | null;
  logoUrl: string | null;
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

export interface PushSubscriptionRow {
  id: string;
  organizationId: string;
  targetId: string;
  endpoint: string;
  p256Dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: number;
}

export interface DeviceLoginRequestRow {
  id: string;
  organizationId: string;
  deviceId: string;
  nonce: string;
  status: string;
  memberId: string | null;
  intent: string | null;
  createdAt: number;
  expiresAt: number;
}

export const MEMBER_ROLES = ["owner", "manager", "staff"] as const;

/** Identities come back as hex strings; normalise so `user.identity` and `org_member.user_id` compare. */
export function normIdentity(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^0x/, "");
}
