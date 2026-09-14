"use client";

import { useEffect, useState } from "react";

/** Truncated monospace identity/uuid with a copy-to-clipboard button. */
export function IdentityCell({
  value,
  head = 8,
  tail = 6,
}: {
  value: string;
  head?: number;
  tail?: number;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1200);
    return () => window.clearTimeout(t);
  }, [copied]);

  if (!value) return <span className="text-stone-300">—</span>;
  const short =
    value.length > head + tail + 1
      ? `${value.slice(0, head)}…${value.slice(-tail)}`
      : value;

  const copy = () => {
    navigator.clipboard
      .writeText(value)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <code className="font-mono text-[11.5px] text-stone-700" title={value}>
        {short}
      </code>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          copy();
        }}
        className="rounded-[0.15rem] border border-stone-200 px-1 py-px font-mono text-[10px] uppercase text-stone-500 hover:bg-stone-100"
        title="Copy full value"
      >
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}
