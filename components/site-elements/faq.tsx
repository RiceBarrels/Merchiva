"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqProps {
  items?: FaqItem[];
  themeColor?: string;
}

const DEFAULT_ITEMS: FaqItem[] = [
  {
    question: "What are your hours?",
    answer: "We're open Monday through Friday, 8am to 8pm, and weekends from 9am to 6pm.",
  },
  {
    question: "Do you take reservations?",
    answer: "Yes! You can book through our website or call us directly. Walk-ins are always welcome when space is available.",
  },
  {
    question: "What's your cancellation policy?",
    answer: "Please let us know at least 24 hours in advance if you need to cancel or reschedule.",
  },
  {
    question: "Do you offer gift cards?",
    answer: "Yes, gift cards are available in any amount. Ask at the counter or purchase online.",
  },
];

export function Faq({ items = DEFAULT_ITEMS, themeColor = "#0f172a" }: FaqProps) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="border border-stone-200 bg-white divide-y divide-stone-100" style={{ borderRadius: "0.3rem" }}>
      {items.map((item, i) => (
        <div key={i}>
          <button
            className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-stone-50 transition-colors"
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span className="text-sm font-medium text-stone-900">{item.question}</span>
            <ChevronDown
              className="h-4 w-4 flex-shrink-0 text-stone-400 transition-transform"
              style={{ transform: open === i ? "rotate(180deg)" : "rotate(0deg)", color: open === i ? themeColor : undefined }}
            />
          </button>
          {open === i && (
            <div className="px-4 pb-3">
              <p className="text-sm text-stone-600 leading-relaxed">{item.answer}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
