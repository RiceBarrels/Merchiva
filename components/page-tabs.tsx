"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { hapticLight } from "@/lib/haptics";

let _skipTransition = false;
let _skipTransitionAt = 0;
/** A skip request older than this is stale: its navigation never changed the pathname. */
const SKIP_TRANSITION_TTL_MS = 1500;
export function shouldSkipTransition() {
  if (!_skipTransition) return false;
  _skipTransition = false;
  return Date.now() - _skipTransitionAt <= SKIP_TRANSITION_TTL_MS;
}
export function skipNextPageTransition(): void { _skipTransition = true; _skipTransitionAt = Date.now(); }

export interface PageTab {
  label: string;
  href: string;
}

export function PageTabs({ tabs }: { tabs: PageTab[] }) {
  const pathname = usePathname();

  return (
    <div className="flex border-b border-border overflow-x-auto shrink-0 bg-background">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        
        // console.log("pathname", pathname, "tab.href", tab.href, "isActive", isActive);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            onClick={() => { hapticLight(); skipNextPageTransition(); }}
            className={cn(
              "px-3.5 py-2 text-[12px] font-medium border-b-2 transition-colors shrink-0 flex justify-center items-center",
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
