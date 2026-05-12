"use client";

import { useState } from "react";
import {
  Star,
  MessageSquareHeart,
  Globe,
  TrendingUp,
  Reply,
  ExternalLink,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PermissionGuard } from "@/components/permission-guard";
import { PageHeader } from "@/components/page-header";
import { PageTabs } from "@/components/page-tabs";
import { useT } from "@/lib/i18n/context";

// ─── Sample data ────────────────────────────────────────────────────────────

const SAMPLE_REVIEWS = [
  {
    id: "1",
    author: "Sarah M.",
    rating: 5,
    date: "2026-04-28",
    text: "Best coffee in town! The staff is always friendly and the lattes are perfectly made every time. Highly recommend the oat milk flat white.",
  },
  {
    id: "2",
    author: "James K.",
    rating: 4,
    date: "2026-04-25",
    text: "Great atmosphere and solid food options. The avocado toast is delicious. Only reason for 4 stars is that it can get quite crowded during peak hours.",
  },
  {
    id: "3",
    author: "Priya R.",
    rating: 3,
    date: "2026-04-20",
    text: "Decent place. Coffee is good but nothing extraordinary. Wait times can be long on weekends. The pastries are fresh though.",
  },
];

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-3.5 w-3.5 ${
            s <= rating
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ReviewsPage() {
  const t = useT();
  const [placesId, setPlacesId] = useState("");

  return (
    <PermissionGuard section="settings">
      <div className="">
        <PageHeader
          title="Reviews & Reputation"
          subtitle="Monitor and manage your online reviews"
        />
        <PageTabs tabs={[
          { label: t("nav.website"), href: "/~/builder" },
          { label: t("nav.membership"), href: "/~/membership" },
          { label: t("nav.bookings"), href: "/~/bookings" },
          { label: t("nav.reviews"), href: "/~/reviews" },
        ]} />

        <div className="px-4 sm:px-6 pb-6 space-y-4">
          {/* Google Reviews Integration */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-[0.3rem] bg-muted flex items-center justify-center">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle className="text-base">Google Reviews Integration</CardTitle>
                  <CardDescription>Coming Soon</CardDescription>
                </div>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  Planned
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Monitor and respond to Google reviews from one place. Connect your Google Business Profile to get started.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Google Places ID</Label>
                <div className="flex gap-2">
                  <Input
                    value={placesId}
                    onChange={(e) => setPlacesId(e.target.value)}
                    placeholder="ChIJ..."
                    className="font-mono text-sm"
                  />
                  <Button disabled className="shrink-0 gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Connect
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Find your Places ID at{" "}
                  <span className="font-mono text-foreground/70">developers.google.com/maps/documentation/places</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Recent Reviews (sample) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Reviews</CardTitle>
              <CardDescription>
                Sample data shown below. Connect Google Reviews to see real reviews.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {SAMPLE_REVIEWS.map((review) => (
                <div
                  key={review.id}
                  className="border border-border rounded-[0.3rem] p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-[0.3rem] bg-muted flex items-center justify-center text-[11px] font-semibold text-muted-foreground shrink-0">
                        {review.author.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium leading-tight">{review.author}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(review.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <StarRating rating={review.rating} />
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {review.text}
                  </p>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled>
                    <Reply className="h-3 w-3" />
                    Reply
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Rating Trend */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Rating Trend</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold font-mono">4.5</span>
                <div className="space-y-0.5">
                  <StarRating rating={4} />
                  <p className="text-xs text-muted-foreground">based on 0 reviews</p>
                </div>
              </div>
              <div className="p-2.5 rounded-[0.3rem] bg-muted/50 border border-border">
                <p className="text-xs text-muted-foreground">
                  This feature will be available when Google Reviews API is connected.
                  Rating data will include historical trends and comparison with competitors.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PermissionGuard>
  );
}
