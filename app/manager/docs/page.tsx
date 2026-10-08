"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PermissionGuard } from "@/components/permission-guard";
import { Spinner } from "@/components/ui/loaders/geometric";
import { docsHomeRedirectHref } from "@/lib/drive/hrefs";
import { useT } from "@/lib/i18n/context";

// The Docs home is folded into Drive: every old /manager/docs link lands on
// Drive's documents view. `?scope=recent|starred|trash` maps to the Drive
// space of the same name (default recent) and `?q` carries over. The route
// is always on (no app owns it in MANAGER_ROUTE_APPS), so old links land on
// Drive whether or not the Docs plugin is installed.
// `useSearchParams` must sit inside a Suspense boundary
// (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md).

function RedirectingSpinner() {
  const t = useT();
  return (
    <div className="flex h-full min-h-[50vh] items-center justify-center">
      <Spinner size={20} className="text-muted-foreground" aria-label={t("common.loading")} />
    </div>
  );
}

function DocsToDrive() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope");
  const q = searchParams.get("q");

  useEffect(() => {
    router.replace(docsHomeRedirectHref(scope, q));
  }, [router, scope, q]);

  return <RedirectingSpinner />;
}

export default function DocsPage() {
  return (
    <PermissionGuard section="dashboard">
      <Suspense fallback={<RedirectingSpinner />}>
        <DocsToDrive />
      </Suspense>
    </PermissionGuard>
  );
}
