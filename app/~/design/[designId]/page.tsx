"use client";

import { use, useEffect, useState } from "react";

import { useTable } from "spacetimedb/react";
import { tables } from "@/lib/spacetimedb/generated";
import { DesignEditor } from "@/components/design/design-editor";
import { getDesignById } from "@/lib/db/designs";
import { usePermissions } from "@/lib/context/permissions";
import type { Design } from "@/lib/types";
import { useT } from "@/lib/i18n/context";
import { Spinner } from "@/components/ui/loaders/geometric";

export default function DesignEditorPage({
  params,
}: {
  params: Promise<{ designId: string }>;
}) {
  const t = useT();
  const { designId } = use(params);
  const { organizationId } = usePermissions();

  const [, designReady] = useTable(tables.design);

  const [design, setDesign] = useState<Design | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!designId || !organizationId || !designReady) return;
    let cancelled = false;
    getDesignById(designId)
      .then((d) => { if (!cancelled) setDesign(d); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [designId, organizationId, designReady]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size={24} className="text-muted-foreground" />
      </div>
    );
  }

  if (!design) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        {t("design.editor.notFound")}
      </div>
    );
  }

  return <DesignEditor design={design} />;
}
