import { createClient } from "@/lib/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Site {
  id: string;
  organizationId: string;
  userId: string;
  name: string;
  domain: string | null;
  published: boolean;
  theme: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SitePage {
  id: string;
  siteId: string;
  slug: string;
  title: string;
  elements: SiteElement[];
  isHome: boolean;
  createdAt: string;
}

export interface SiteElement {
  id: string;
  pageId: string;
  type: string;
  props: Record<string, unknown>;
  order: number;
}

export interface SiteBooking {
  id: string;
  siteId: string | null;
  pageId: string | null;
  formData: Record<string, string>;
  status: "pending" | "confirmed" | "cancelled";
  createdAt: string;
}

// ─── site_bookings migration (run in Supabase SQL Editor) ─────────────────────
//
// CREATE TABLE site_bookings (
//   id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   site_id         uuid REFERENCES sites(id) ON DELETE SET NULL,
//   page_id         uuid REFERENCES site_pages(id) ON DELETE SET NULL,
//   organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
//   user_id         uuid REFERENCES auth.users(id),
//   form_data       jsonb NOT NULL DEFAULT '{}',
//   status          text NOT NULL DEFAULT 'pending'
//                     CHECK (status IN ('pending', 'confirmed', 'cancelled')),
//   created_at      timestamptz NOT NULL DEFAULT now()
// );
//
// ALTER TABLE site_bookings ENABLE ROW LEVEL SECURITY;
//
// -- Staff can only view bookings for their org
// CREATE POLICY "org members can view bookings"
//   ON site_bookings FOR SELECT
//   USING (
//     organization_id IN (
//       SELECT organization_id FROM org_members
//       WHERE user_id = auth.uid() AND status = 'active'
//     )
//   );
//
// -- Public (anon) can insert bookings for published sites
// CREATE POLICY "public can create bookings"
//   ON site_bookings FOR INSERT
//   WITH CHECK (true);
//
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bookingFromDb(row: any): SiteBooking {
  return {
    id: row.id,
    siteId: row.site_id ?? null,
    pageId: row.page_id ?? null,
    formData: row.form_data ?? {},
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function getSiteBookings(organizationId: string): Promise<SiteBooking[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("site_bookings")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(bookingFromDb);
}

export async function updateBookingStatus(
  id: string,
  status: SiteBooking["status"]
): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("site_bookings")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}
