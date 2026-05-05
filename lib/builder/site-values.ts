import type { SiteCustomer } from "@/lib/types";

export interface ValueDefinition {
  key: string;
  label: string;
  description: string;
  category: "user" | "site" | "date";
  sampleValue: string;
}

export const SYSTEM_VALUES: ValueDefinition[] = [
  { key: "userName",     label: "User Name",     description: "Customer's display name",  category: "user", sampleValue: "Jane Doe" },
  { key: "userEmail",    label: "User Email",    description: "Customer's email address",  category: "user", sampleValue: "jane@example.com" },
  { key: "userImageUrl", label: "User Avatar",   description: "Customer's avatar URL",     category: "user", sampleValue: "" },
  { key: "userPhone",    label: "User Phone",    description: "Customer's phone number",   category: "user", sampleValue: "+1 555-0100" },
  { key: "siteName",     label: "Site Name",     description: "The site name",             category: "site", sampleValue: "My Store" },
  { key: "currentYear",  label: "Current Year",  description: "Current calendar year",     category: "date", sampleValue: String(new Date().getFullYear()) },
  { key: "currentDate",  label: "Current Date",  description: "Today's date",              category: "date", sampleValue: new Date().toLocaleDateString() },
];

export const SYSTEM_VALUE_KEYS = new Set(SYSTEM_VALUES.map((v) => v.key));

export interface ValueContext {
  customer?: Pick<SiteCustomer, "name" | "email" | "phone"> | null;
  siteName?: string;
}

export function getSystemValues(ctx: ValueContext): Record<string, string> {
  const now = new Date();
  return {
    userName: ctx.customer?.name || "",
    userEmail: ctx.customer?.email || "",
    userImageUrl: "",
    userPhone: ctx.customer?.phone || "",
    siteName: ctx.siteName || "",
    currentYear: String(now.getFullYear()),
    currentDate: now.toLocaleDateString(),
  };
}

const VALUE_RE = /\{(\w+)\}/g;

export function resolveValues(
  text: string,
  customValues?: Record<string, string>,
  systemValues?: Record<string, string>,
): string {
  if (!text || !text.includes("{")) return text;
  return text.replace(VALUE_RE, (match, key: string) => {
    if (systemValues && key in systemValues) return systemValues[key];
    if (customValues && key in customValues) return customValues[key];
    return match;
  });
}

export function resolveValuesPreview(
  text: string,
  customValues?: Record<string, string>,
): string {
  const sample: Record<string, string> = {};
  for (const def of SYSTEM_VALUES) sample[def.key] = def.sampleValue;
  return resolveValues(text, customValues, sample);
}
