"use client";

// The loading state every preview renderer shows while its file (or signed URL) arrives.

import { LoaderCircle } from "lucide-react";
import { useT } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

export function PreviewLoading({ className }: { className?: string }) {
  const t = useT();
  return (
    <div role="status" className={cn("flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground", className)}>
      <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
      <span>{t("drive.preview.loading")}</span>
    </div>
  );
}
