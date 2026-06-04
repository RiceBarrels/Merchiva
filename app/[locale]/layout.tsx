import { notFound } from "next/navigation";
import { LOCALES, isLocale } from "@/lib/i18n/config";

// Pre-render all supported locales; reject anything else (e.g. /de/pricing → 404).
export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export const dynamicParams = false;

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  // <html lang>/dir is set by the root layout from the x-locale header; the
  // client i18n provider is seeded with the same locale. This layer only
  // validates the segment and groups the localized routes.
  return <>{children}</>;
}
