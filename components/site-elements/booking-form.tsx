"use client";

import { useState } from "react";
import { CalendarDays, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface BookingField {
  id: string;
  label: string;
  type: "text" | "email" | "tel" | "date" | "time" | "number" | "textarea" | "select";
  placeholder?: string;
  required?: boolean;
  options?: string[]; // for select type
}

interface BookingFormProps {
  siteId?: string;
  pageId?: string;
  title?: string;
  fields?: BookingField[];
  submitLabel?: string;
  successMessage?: string;
  isEditor?: boolean;
  themeColor?: string;
}

const DEFAULT_FIELDS: BookingField[] = [
  { id: "name", label: "Name", type: "text", placeholder: "Your full name", required: true },
  { id: "phone", label: "Phone", type: "tel", placeholder: "+1 (555) 000-0000", required: true },
  { id: "date", label: "Date", type: "date", required: true },
  { id: "time", label: "Time", type: "time", required: true },
  { id: "party_size", label: "Party Size", type: "number", placeholder: "2", required: false },
  { id: "notes", label: "Notes", type: "textarea", placeholder: "Any special requests?", required: false },
];

export function BookingForm({
  siteId,
  pageId,
  title = "Make a Reservation",
  fields = DEFAULT_FIELDS,
  submitLabel = "Book Now",
  successMessage = "Your reservation has been confirmed! We'll be in touch shortly.",
  isEditor = false,
  themeColor = "#0f172a",
}: BookingFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEditor) return;
    setSubmitting(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: dbError } = await supabase.from("site_bookings").insert({
        site_id: siteId ?? null,
        page_id: pageId ?? null,
        form_data: values,
        status: "pending",
      });
      if (dbError) throw dbError;
      setSubmitted(true);
    } catch (err) {
      console.error("Booking submit failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div
        className="border border-stone-200 bg-white p-6 flex flex-col items-center gap-3 text-center"
        style={{ borderRadius: "0.3rem" }}
      >
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <p className="font-medium text-stone-900">{successMessage}</p>
      </div>
    );
  }

  return (
    <div className="border border-stone-200 bg-white p-5" style={{ borderRadius: "0.3rem" }}>
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="h-4 w-4 text-stone-500" />
        <h3 className="font-semibold text-stone-900 text-sm">{title}</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {fields.map((field) => (
          <div key={field.id}>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              {field.label}
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
            </label>

            {field.type === "textarea" ? (
              <textarea
                placeholder={field.placeholder}
                required={field.required}
                rows={3}
                value={values[field.id] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
                className="w-full border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400 resize-none"
                style={{ borderRadius: "0.3rem" }}
                disabled={isEditor}
              />
            ) : field.type === "select" ? (
              <select
                required={field.required}
                value={values[field.id] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
                className="w-full border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400"
                style={{ borderRadius: "0.3rem" }}
                disabled={isEditor}
              >
                <option value="">Select…</option>
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                placeholder={field.placeholder}
                required={field.required}
                value={values[field.id] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [field.id]: e.target.value }))}
                className="w-full border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-400"
                style={{ borderRadius: "0.3rem" }}
                disabled={isEditor}
              />
            )}
          </div>
        ))}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2" style={{ borderRadius: "0.3rem" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || isEditor}
          className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: themeColor, borderRadius: "0.3rem" }}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel}
        </button>
      </form>
    </div>
  );
}
