"use client";

// Lite "Bookings today" app for /store + /personal. Shows today's or
// tomorrow's reservations in time order; tapping one opens a sheet with the
// details large and the same status moves the manager bookings page allows
// (pending → confirmed, pending/confirmed → cancelled) plus "Done" for a
// confirmed booking. No creating, no calendar, no settings.

import { useMemo, useState } from "react";
import { useTable } from "spacetimedb/react";
import { toast } from "sonner";
import {
  CalendarCheck,
  CalendarDays,
  CalendarX,
  Check,
  CheckCircle2,
  Clock,
  Phone,
  StickyNote,
  Sun,
  Sunrise,
  User,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { tables } from "@/lib/spacetimedb/generated";
import { updateBookingStatus } from "@/lib/spacetimedb/actions";
import { useI18n, useT } from "@/lib/i18n/context";
import { hapticError, hapticSuccess } from "@/lib/haptics";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { LiteSubPage } from "./lite-page";
import { LiteButton, LiteChoice, LiteEmpty, LiteLoading, LiteRow, LiteScreen, LiteSection } from "./lite";
import type { LiteAppProps } from "./types";
import { dateKeyOffset } from "@/lib/date-key";

// ─── Row shapes (cast from generated rows) ─────────────────────────────────

interface BookingRow {
  id: { toString(): string };
  siteId: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  time: string;
  partySize: number;
  name: string;
  phone?: string | null;
  notes?: string | null;
  status: string;
}

interface SiteRow {
  id: { toString(): string };
  organizationId: string;
}

type Day = "today" | "tomorrow";

/** Local calendar date as YYYY-MM-DD (the store's own day, not UTC). */
const localDateStr = (offsetDays: number): string => dateKeyOffset(offsetDays);

/** "HH:MM" → locale time ("2:30 PM", "14:30"). Falls back to the raw string. */
function formatTime(time: string, locale: string): string {
  const [h, m] = time.split(":").map((s) => parseInt(s, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  try {
    return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  } catch {
    return time;
  }
}

const STATUS_TONE: Record<string, StatusTone> = {
  pending: "warning",
  confirmed: "info",
  completed: "success",
  cancelled: "danger",
};

const STATUS_ICON: Record<string, { icon: LucideIcon; tone: "muted" | "primary" | "success" | "warning" | "destructive" }> = {
  pending: { icon: Clock, tone: "warning" },
  confirmed: { icon: CalendarCheck, tone: "primary" },
  completed: { icon: CheckCircle2, tone: "success" },
  cancelled: { icon: XCircle, tone: "destructive" },
};

export function BookingsLite({ organizationId, surface }: LiteAppProps) {
  const t = useT();
  const { locale } = useI18n();
  const [day, setDay] = useState<Day>("today");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [bookingRows, bookingsReady] = useTable(tables.siteBooking);
  const [siteRows, sitesReady] = useTable(tables.site);

  const orgSiteIds = useMemo(() => {
    const sites = siteRows as unknown as SiteRow[];
    return new Set(sites.filter((s) => s.organizationId === organizationId).map((s) => s.id.toString()));
  }, [siteRows, organizationId]);

  const dateStr = localDateStr(day === "today" ? 0 : 1);

  const bookings = useMemo(() => {
    const rows = bookingRows as unknown as BookingRow[];
    return rows
      .filter((b) => orgSiteIds.has(b.siteId) && b.date === dateStr)
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [bookingRows, orgSiteIds, dateStr]);

  const statusLabel = (status: string) => {
    const key = `device.lite.bookings.status_${status}`;
    const label = t(key);
    return label === key ? status : label;
  };

  const open = openId ? bookings.find((b) => b.id.toString() === openId) ?? null : null;

  const setStatus = async (bookingId: string, status: string) => {
    setBusy(status);
    try {
      await updateBookingStatus(bookingId, status);
      await hapticSuccess();
      toast.success(t("device.lite.bookings.updated"));
      setOpenId(null);
    } catch (err) {
      console.error("Failed to update booking status:", err);
      await hapticError();
      toast.error(t("device.lite.bookings.updateFailed"));
    } finally {
      setBusy(null);
    }
  };

  if (!bookingsReady || !sitesReady) {
    return (
      <LiteScreen>
        <LiteLoading />
      </LiteScreen>
    );
  }

  return (
    <LiteScreen>
      <LiteChoice<Day>
        value={day}
        onChange={setDay}
        options={[
          { value: "today", label: t("device.lite.bookings.today"), icon: Sun },
          { value: "tomorrow", label: t("device.lite.bookings.tomorrow"), icon: Sunrise },
        ]}
      />

      <LiteSection
        title={t("device.lite.bookings.list")}
        right={<span className="font-mono text-[12px] tabular-nums text-muted-foreground">{bookings.length}</span>}
      >
        {bookings.length === 0 ? (
          <LiteEmpty
            icon={CalendarDays}
            title={t("device.lite.bookings.empty")}
            description={t(day === "today" ? "device.lite.bookings.emptyToday" : "device.lite.bookings.emptyTomorrow")}
          />
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => {
              const meta = STATUS_ICON[b.status] ?? { icon: CalendarDays, tone: "muted" as const };
              return (
                <LiteRow
                  key={b.id.toString()}
                  icon={meta.icon}
                  iconTone={meta.tone}
                  title={b.name}
                  sub={
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {b.partySize}
                      </span>
                      <StatusBadge tone={STATUS_TONE[b.status] ?? "neutral"} size="xs">
                        {statusLabel(b.status)}
                      </StatusBadge>
                    </span>
                  }
                  right={<span className="text-[17px] font-semibold">{formatTime(b.time, locale)}</span>}
                  chevron
                  onClick={() => setOpenId(b.id.toString())}
                />
              );
            })}
          </div>
        )}
      </LiteSection>

      <LiteSubPage
        surface={surface}
        open={!!open}
        onClose={() => setOpenId(null)}
        title={t("device.lite.bookings.details")}
        cancelLabel={t("device.lite.bookings.close")}
        maxWidth={480}
      >
        {open && (
          <BookingDetails
            booking={open}
            locale={locale}
            busy={busy}
            statusLabel={statusLabel}
            onStatus={(s) => setStatus(open.id.toString(), s)}
          />
        )}
      </LiteSubPage>
    </LiteScreen>
  );
}

// ─── Detail pane ────────────────────────────────────────────────────────────

function BookingDetails({ booking, locale, busy, statusLabel, onStatus }: {
  booking: BookingRow;
  locale: string;
  busy: string | null;
  statusLabel: (s: string) => string;
  onStatus: (status: string) => void;
}) {
  const t = useT();
  const status = booking.status;
  const canConfirm = status === "pending";
  const canComplete = status === "confirmed";
  const canCancel = status === "pending" || status === "confirmed";
  const phone = booking.phone?.trim() ?? "";
  const notes = booking.notes?.trim() ?? "";

  return (
    <div className="space-y-4 pb-2">
      <div className="rounded-lg border border-border bg-card px-4 py-4">
        <div className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
          <Clock className="h-4 w-4" />
          {t("device.lite.bookings.time")}
        </div>
        <div className="mt-1.5 font-mono text-[36px] font-semibold leading-none tabular-nums tracking-tight">
          {formatTime(booking.time, locale)}
        </div>
        <div className="mt-3">
          <StatusBadge tone={STATUS_TONE[status] ?? "neutral"}>{statusLabel(status)}</StatusBadge>
        </div>
      </div>

      <div className="space-y-2">
        <LiteRow icon={User} title={booking.name} sub={t("device.lite.bookings.customer")} />
        <LiteRow
          icon={Users}
          title={`${booking.partySize}`}
          sub={t("device.lite.bookings.partySize")}
        />
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="flex min-h-16 w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-left active:bg-muted"
          >
            <span className="grid h-10 w-10 flex-none place-items-center rounded bg-primary text-primary-foreground">
              <Phone className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[15px] font-semibold tabular-nums">{phone}</span>
              <span className="block truncate text-[13px] text-muted-foreground">{t("device.lite.bookings.tapToCall")}</span>
            </span>
          </a>
        ) : (
          <LiteRow icon={Phone} title={t("device.lite.bookings.noPhone")} sub={t("device.lite.bookings.phone")} />
        )}
        {notes && (
          <div className="flex w-full items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
            <span className="grid h-10 w-10 flex-none place-items-center rounded bg-muted text-foreground">
              <StickyNote className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-muted-foreground">{t("device.lite.bookings.notes")}</span>
              <span className="block whitespace-pre-wrap text-[15px] font-medium">{notes}</span>
            </span>
          </div>
        )}
      </div>

      {(canConfirm || canComplete || canCancel) ? (
        <div className="space-y-2">
          {canConfirm && (
            <LiteButton
              icon={Check}
              label={t("device.lite.bookings.confirm")}
              onClick={() => onStatus("confirmed")}
              busy={busy === "confirmed"}
              disabled={busy !== null}
            />
          )}
          {canComplete && (
            <LiteButton
              icon={CheckCircle2}
              label={t("device.lite.bookings.done")}
              onClick={() => onStatus("completed")}
              busy={busy === "completed"}
              disabled={busy !== null}
            />
          )}
          {canCancel && (
            <LiteButton
              icon={CalendarX}
              label={t("device.lite.bookings.cancel")}
              tone="danger"
              onClick={() => onStatus("cancelled")}
              busy={busy === "cancelled"}
              disabled={busy !== null}
            />
          )}
        </div>
      ) : (
        <p className="text-center text-[13px] text-muted-foreground">{t("device.lite.bookings.noActions")}</p>
      )}
    </div>
  );
}
