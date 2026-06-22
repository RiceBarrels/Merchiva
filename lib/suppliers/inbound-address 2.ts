const DEFAULT_INBOUND_EMAIL_DOMAIN = "merchiva.com";
const INBOUND_LOCAL_SUFFIX = "inbound";

export function publicInboundEmailDomain(): string {
  return process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN?.trim() || DEFAULT_INBOUND_EMAIL_DOMAIN;
}

export function defaultSupplierInboundPrefix(organizationId: string | null | undefined): string {
  const compact = String(organizationId || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  return `m-${(compact || "store").slice(0, 8)}`;
}

export function normalizeSupplierInboundPrefix(value: string): string {
  const raw = String(value || "").trim().toLowerCase();
  const local = raw.includes("@") ? raw.split("@")[0] : raw;
  const withoutSuffix = local.endsWith(`-${INBOUND_LOCAL_SUFFIX}`)
    ? local.slice(0, -(`-${INBOUND_LOCAL_SUFFIX}`.length))
    : local;
  return withoutSuffix
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isValidSupplierInboundPrefix(prefix: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(prefix);
}

export function supplierInboundPrefixForOrg(
  savedPrefix: string | null | undefined,
  organizationId: string | null | undefined,
): string {
  const normalized = savedPrefix ? normalizeSupplierInboundPrefix(savedPrefix) : "";
  return normalized || defaultSupplierInboundPrefix(organizationId);
}

export function supplierInboundAddressFromPrefix(
  prefix: string,
  domain = publicInboundEmailDomain(),
): string | null {
  const normalized = normalizeSupplierInboundPrefix(prefix);
  if (!isValidSupplierInboundPrefix(normalized)) return null;
  return `${normalized}-${INBOUND_LOCAL_SUFFIX}@${domain}`;
}

export function supplierInboundAddressForOrg(
  savedPrefix: string | null | undefined,
  organizationId: string | null | undefined,
  domain = publicInboundEmailDomain(),
): string | null {
  return supplierInboundAddressFromPrefix(supplierInboundPrefixForOrg(savedPrefix, organizationId), domain);
}

export function supplierInboundPrefixFromRecipient(
  recipient: string | null | undefined,
  domain = publicInboundEmailDomain(),
): string | null {
  if (!recipient) return null;
  const expectedDomain = domain.toLowerCase();
  const candidates = recipient.split(/[,;\s]+/).filter(Boolean);
  for (const raw of candidates) {
    const m = raw.match(/<([^>]+)>/);
    const addr = (m ? m[1] : raw).trim();
    if (!addr.includes("@")) continue;
    const [local, actualDomain] = addr.split("@");
    if (actualDomain?.toLowerCase() !== expectedDomain) continue;
    if (!local.endsWith(`-${INBOUND_LOCAL_SUFFIX}`)) continue;
    const prefix = normalizeSupplierInboundPrefix(local);
    if (isValidSupplierInboundPrefix(prefix)) return prefix;
  }
  return null;
}
