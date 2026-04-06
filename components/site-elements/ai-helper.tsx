"use client";

import { useState } from "react";
import { Sparkles, X, ChevronRight, RotateCcw } from "lucide-react";

type ContentAction = "headline" | "description" | "cta" | "rewrite";
type BusinessType = "restaurant" | "retail" | "service" | "generic";

interface AiHelperProps {
  onInsert?: (text: string) => void;
  selectedText?: string;
  businessType?: BusinessType;
}

const TEMPLATES: Record<BusinessType, Record<ContentAction, string[]>> = {
  restaurant: {
    headline: [
      "Fresh Ingredients. Bold Flavors. Unforgettable Meals.",
      "Where Every Bite Tells a Story",
      "Handcrafted Daily. Served with Heart.",
    ],
    description: [
      "We source locally, cook seasonally, and pour our passion into every dish. Come hungry, leave happy.",
      "From our kitchen to your table — real food made the way it should be.",
    ],
    cta: ["Reserve Your Table", "View Today's Menu", "Order Online Now"],
    rewrite: ["Discover a dining experience that brings people together.", "Taste the difference that fresh, quality ingredients make."],
  },
  retail: {
    headline: [
      "Curated for You. Crafted to Last.",
      "Quality Finds, Locally Loved",
      "Shop Smarter. Live Better.",
    ],
    description: [
      "We hand-pick every product so you don't have to. Quality you can see, value you can feel.",
      "Your go-to shop for everyday essentials and hidden gems.",
    ],
    cta: ["Shop Now", "Browse the Collection", "See What's New"],
    rewrite: ["Find exactly what you need — without the hassle.", "Great products, honestly priced."],
  },
  service: {
    headline: [
      "Expert Service. Guaranteed Results.",
      "We Handle It. You Relax.",
      "Professional. Reliable. On Time.",
    ],
    description: [
      "Years of expertise, delivered with care. We treat your business like our own.",
      "We show up, do the work, and get it right the first time.",
    ],
    cta: ["Book a Consultation", "Get a Free Quote", "Schedule Service"],
    rewrite: ["Trusted by hundreds of local businesses.", "We make it simple so you can focus on what matters."],
  },
  generic: {
    headline: [
      "Built for the Way You Work",
      "Simple. Powerful. Yours.",
      "The Best Choice for Your Needs",
    ],
    description: [
      "We make it easy to get started and even easier to keep going.",
      "Everything you need, none of what you don't.",
    ],
    cta: ["Get Started", "Learn More", "Contact Us Today"],
    rewrite: ["Here's a cleaner way to say it.", "Try this more compelling version."],
  },
};

const ACTION_LABELS: Record<ContentAction, string> = {
  headline: "Write a headline",
  description: "Write a description",
  cta: "Write a call to action",
  rewrite: "Rewrite this text",
};

export function AiHelper({ onInsert, selectedText, businessType = "generic" }: AiHelperProps) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<ContentAction | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [resultIndex, setResultIndex] = useState(0);

  function pickAction(a: ContentAction) {
    setAction(a);
    setResultIndex(0);
    const options = TEMPLATES[businessType][a];
    setResult(options[0]);
  }

  function regenerate() {
    if (!action) return;
    const options = TEMPLATES[businessType][action];
    const next = (resultIndex + 1) % options.length;
    setResultIndex(next);
    setResult(options[next]);
  }

  function handleInsert() {
    if (result && onInsert) {
      onInsert(result);
    }
    setOpen(false);
    setAction(null);
    setResult(null);
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium shadow-lg transition-colors"
        style={{ borderRadius: "0.3rem" }}
        title="AI Content Helper"
      >
        <Sparkles className="h-4 w-4" />
        AI Helper
      </button>

      {/* Dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-6 pointer-events-none">
          <div
            className="pointer-events-auto w-72 border border-stone-200 bg-white shadow-xl flex flex-col"
            style={{ borderRadius: "0.3rem" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                <span className="text-sm font-semibold text-stone-900">AI Content Helper</span>
              </div>
              <button
                onClick={() => { setOpen(false); setAction(null); setResult(null); }}
                className="text-stone-400 hover:text-stone-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 flex flex-col gap-3">
              {!action ? (
                <>
                  <p className="text-xs text-stone-500">
                    {selectedText
                      ? `Selected: "${selectedText.slice(0, 40)}${selectedText.length > 40 ? "…" : ""}"`
                      : "What kind of text do you want?"}
                  </p>
                  <div className="space-y-1.5">
                    {(Object.entries(ACTION_LABELS) as [ContentAction, string][]).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => pickAction(key)}
                        className="w-full flex items-center justify-between px-3 py-2 border border-stone-200 hover:border-stone-400 hover:bg-stone-50 text-left transition-colors"
                        style={{ borderRadius: "0.3rem" }}
                      >
                        <span className="text-sm text-stone-800">{label}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => { setAction(null); setResult(null); }}
                      className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1"
                    >
                      <ChevronRight className="h-3 w-3 rotate-180" />
                      Back
                    </button>
                    <span className="text-xs font-medium text-stone-600">{ACTION_LABELS[action]}</span>
                  </div>

                  <div
                    className="bg-stone-50 border border-stone-200 p-3 text-sm text-stone-800 leading-relaxed min-h-[64px]"
                    style={{ borderRadius: "0.3rem" }}
                  >
                    {result}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={regenerate}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-stone-200 hover:border-stone-400 text-xs text-stone-600 transition-colors"
                      style={{ borderRadius: "0.3rem" }}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Try another
                    </button>
                    <button
                      onClick={handleInsert}
                      className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors"
                      style={{ borderRadius: "0.3rem" }}
                    >
                      Use this text
                    </button>
                  </div>

                  <p className="text-[10px] text-stone-400 text-center">
                    AI integration coming soon — using templates for now
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
