"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";

let _skipTransition = false;
export function shouldSkipTransition() {
  if (_skipTransition) { _skipTransition = false; return true; }
  return false;
}

export interface PageTab {
  label: string;
  href: string;
}

export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  const pathname = usePathname();

  return (
    <div className="flex border-b border-border overflow-x-auto shrink-0 bg-background">
      {tabs.map((tab) => {
        const otherHrefs = tabs.filter((t) => t.href !== tab.href).map((t) => t.href);
        const claimedByOther = otherHrefs.some(
          (h) => pathname === h || pathname.startsWith(h + "/")
        );
        const isActive =
          !claimedByOther &&
          (pathname === tab.href || pathname.startsWith(tab.href + "/"));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            onClick={() => { hapticLight(); _skipTransition = true; }}
            className={cn(
              "px-3.5 py-2 text-[12px] font-medium border-b-2 transition-colors shrink-0",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
