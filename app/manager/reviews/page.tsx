"use client";

import { useState } from "react";
import {
  Star,
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
import { IconTile } from "@/components/ui/icon-tile";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Num } from "@/components/ui/num";
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
          title={t("reviews.pageTitle")}
          subtitle={t("reviews.pageSubtitle")}
        />
        <PageTabs tabs={[
          { label: t("nav.bookings"), href: "/manager/bookings" },
          { label: t("nav.reviews"), href: "/manager/reviews" },
        ]} />

        <div className="px-4 sm:px-6 pb-6 space-y-4">
          {/* Google Reviews Integration */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <IconTile icon={Globe} />
                <div>
                  <CardTitle className="text-base">{t("reviews.googleIntegrationTitle")}</CardTitle>
                  <CardDescription>{t("reviews.comingSoon")}</CardDescription>
                </div>
                <Badge variant="outline" className="ml-auto text-[10px]">
                  {t("reviews.plannedBadge")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("reviews.googleIntegrationDesc")}
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("reviews.placesIdLabel")}</Label>
                <div className="flex gap-2">
                  <Input
                    value={placesId}
                    onChange={(e) => setPlacesId(e.target.value)}
                    placeholder="ChIJ..."
                    className="font-mono text-sm"
                  />
                  <Button disabled className="shrink-0 gap-1.5">
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t("reviews.connectButton")}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("reviews.findPlacesIdAt")}{" "}
                  <span className="font-mono text-foreground/70">developers.google.com/maps/documentation/places</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Recent Reviews (sample) */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("reviews.recentReviewsTitle")}</CardTitle>
              <CardDescription>
                {t("reviews.recentReviewsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {SAMPLE_REVIEWS.map((review) => (
                <Card key={review.id} size="sm">
                  <CardContent className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <IconTile size="sm">{review.author.charAt(0)}</IconTile>
                      <div>
                        <p className="text-sm font-medium leading-tight">{review.author}</p>
                        <Num
                          size="xs"
                          muted
                          className="block"
                          value={new Date(review.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        />
                      </div>
                    </div>
                    <StarRating rating={review.rating} />
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {review.text}
                  </p>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled>
                    <Reply className="h-3 w-3" />
                    {t("chat.reply")}
                  </Button>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>

          {/* Rating Trend */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{t("reviews.ratingTrendTitle")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Num size="lg" className="text-3xl font-bold" value="4.5" />
                <div className="space-y-0.5">
                  <StarRating rating={4} />
                  <p className="text-xs text-muted-foreground">{t("reviews.basedOnReviews").replace("{count}", String(0))}</p>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-muted/50 border border-border">
                <p className="text-xs text-muted-foreground">
                  {t("reviews.ratingTrendUnavailable")}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PermissionGuard>
  );
}
