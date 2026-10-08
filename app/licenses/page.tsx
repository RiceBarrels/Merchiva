// Open-source notices. A bare root route: public, static, no auth and no locale prefix, so it ships in the
// Capacitor static export as out/licenses/index.html next to out/legal/*. No `metadata` title: a hardcoded title
// would be an untranslated string, so the root title is inherited.
import { LicensesPage } from "@/components/licenses/licenses-page";

export default function Page() {
  return <LicensesPage />;
}
