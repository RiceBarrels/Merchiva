"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Crown, Globe, ChevronRight } from "lucide-react";
import { getSites } from "@/lib/db/sites";
import { usePermissions } from "@/lib/context/permissions";
import type { Site } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function MembershipPage() {
  const { organizationId } = usePermissions();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    getSites(organizationId)
      .then(setSites)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [organizationId]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Crown className="h-5 w-5" /> Membership
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage tiers, perks, customers, orders, and bookings for each of your sites.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sites.length === 0 ? (
        <div className="rounded border border-dashed border-border py-16 text-center">
          <Globe className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No sites yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Create a site in the{" "}
            <Link href="/builder" className="underline">Website Builder</Link>{" "}
            first.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {sites.map((site) => (
            <Link
              key={site.id}
              href={`/builder/${site.id}/membership`}
              className={cn(
                "flex items-center gap-4 rounded border border-border px-4 py-3.5",
                "hover:bg-muted/50 transition-colors group"
              )}
            >
              <div className="h-9 w-9 rounded bg-muted flex items-center justify-center flex-shrink-0">
                <Globe className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{site.name}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">
                  /s/{site.slug}
                  {site.published && (
                    <span className="ml-2 text-green-600 font-sans not-italic">● Live</span>
                  )}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
