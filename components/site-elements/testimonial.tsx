"use client";

import { Quote } from "lucide-react";

interface TestimonialProps {
  quote?: string;
  author?: string;
  role?: string;
  avatarUrl?: string;
  rating?: number; // 1-5
  themeColor?: string;
}

function StarRating({ rating, color }: { rating: number; color: string }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className="h-3.5 w-3.5"
          fill={star <= rating ? color : "none"}
          stroke={star <= rating ? color : "#d6d3d1"}
          viewBox="0 0 24 24"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
          />
        </svg>
      ))}
    </div>
  );
}

export function Testimonial({
  quote = "This has completely transformed how we run our business. The team management features alone are worth it — we've cut scheduling time in half.",
  author = "Sarah M.",
  role = "Owner, The Corner Café",
  avatarUrl,
  rating = 5,
  themeColor = "#0f172a",
}: TestimonialProps) {
  return (
    <div className="border border-stone-200 bg-white p-5" style={{ borderRadius: "0.3rem" }}>
      <div className="flex items-start gap-3">
        <Quote className="h-5 w-5 flex-shrink-0 mt-0.5 opacity-20" style={{ color: themeColor }} />
        <div>
          {rating > 0 && (
            <div className="mb-2">
              <StarRating rating={rating} color={themeColor} />
            </div>
          )}
          <p className="text-sm text-stone-700 leading-relaxed italic">&ldquo;{quote}&rdquo;</p>
          <div className="mt-3 flex items-center gap-2.5">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={author}
                className="h-8 w-8 object-cover flex-shrink-0"
                style={{ borderRadius: "50%" }}
              />
            ) : (
              <div
                className="h-8 w-8 flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
                style={{ backgroundColor: themeColor, borderRadius: "50%" }}
              >
                {author.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-stone-900">{author}</p>
              {role && <p className="text-xs text-stone-500">{role}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
