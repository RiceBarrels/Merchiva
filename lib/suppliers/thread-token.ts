// Server-side inbound supplier email helpers.
//
// Supplier replies now route to one fixed inbox per store:
//   <prefix>-inbound@<INBOUND_EMAIL_DOMAIN>
// The prefix is stored on the org settings row, with a deterministic org-id
// fallback when the store has not customized it yet. The supplier thread is
// resolved from the sender email inside the store inbox, not from the address.

import "server-only";

import {
  supplierInboundAddressForOrg,
  supplierInboundAddressFromPrefix,
  supplierInboundPrefixFromRecipient,
} from "./inbound-address";

const DEFAULT_INBOUND_EMAIL_DOMAIN = "merchiva.com";

export function inboundDomain(): string {
  return process.env.INBOUND_EMAIL_DOMAIN?.trim() || DEFAULT_INBOUND_EMAIL_DOMAIN;
}

export function inboundConfigured(): boolean {
  return !!inboundDomain();
}

export function inboundAddressForStore(
  organizationId: string,
  supplierInboundPrefix?: string | null,
): string | null {
  return supplierInboundAddressForOrg(supplierInboundPrefix, organizationId, inboundDomain());
}

export function inboundAddressFromPrefix(prefix: string): string | null {
  return supplierInboundAddressFromPrefix(prefix, inboundDomain());
}

export function prefixFromRecipient(recipient: string | null | undefined): string | null {
  return supplierInboundPrefixFromRecipient(recipient, inboundDomain());
}
