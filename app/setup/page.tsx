import { redirect } from "next/navigation";

/**
 * Legacy onboarding URL.
 *
 * This used to be a second, parallel setup wizard. It advertised features that
 * had been removed (POS, online storefront, kitchen display, loyalty), and it
 * threw away everything the user typed: the feature toggles and the teammate
 * invitations were both taken and discarded, and the only thing it wrote was a
 * `merchiva_setup_done` localStorage flag that nothing read. The real wizard —
 * the one app/manager/layout.tsx sends new accounts to — is /manager/setup.
 */
export default function SetupLegacyRedirect() {
  redirect("/manager/setup");
}
