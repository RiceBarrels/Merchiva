import type { Metadata } from "next";
import { cache } from "react";
import { publicFormHandlers } from "@/lib/forms/server/public-deps";
import type { PublicFormPayload } from "@/lib/forms/server/public-handlers";
import { PublicFormView } from "./public-form-view";

// /f/<token>: an anyone-with-the-link form. Web only — listed in
// ignoreInStatic.json and absent from the Capacitor export. The form is read
// on the server with the service token (the browser never sees form or store
// ids), together with a signed render stamp the submit must carry back.

export const dynamic = "force-dynamic";

const loadForm = cache(async (token: string) => publicFormHandlers().load(token));

function payloadOf(result: Awaited<ReturnType<typeof loadForm>>): PublicFormPayload | null {
  return result.status === 200 && "open" in result.body ? result.body : null;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const form = payloadOf(await loadForm(token));
  return {
    title: form ? `${form.title} · ${form.storeName}` : "Merchiva",
    robots: { index: false, follow: false },
    // The token is the whole secret: never send it to another site in a Referer.
    referrer: "no-referrer",
  };
}

export default async function PublicFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await loadForm(token);
  const form = payloadOf(result);
  const loadError = form ? null : "error" in result.body ? result.body.error : "unavailable";
  return <PublicFormView token={token} form={form} loadError={loadError} />;
}
