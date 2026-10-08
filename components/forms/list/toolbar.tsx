"use client";

// Search box + filter chips above the Forms list (builder and respondent lists share it).

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/segmented-control";
import { useT } from "@/lib/i18n/context";

export function FormsToolbar<T extends string>({
  query,
  onQuery,
  filter,
  onFilter,
  options,
}: {
  query: string;
  onQuery: (q: string) => void;
  filter: T;
  onFilter: (value: T) => void;
  options: readonly SegmentedOption<T>[];
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[180px] max-w-sm flex-1">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t("forms.list.search")}
          aria-label={t("forms.list.search")}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className="h-8 ps-8 text-sm"
        />
      </div>
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <SegmentedControl<T>
          variant="chips"
          size="sm"
          className="flex-nowrap"
          aria-label={t("forms.title")}
          value={filter}
          onChange={onFilter}
          options={options}
        />
      </div>
    </div>
  );
}
