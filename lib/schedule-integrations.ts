export const SCHEDULE_PROVIDER_IDS = [
  "built_in",
  "7shifts",
  "homebase",
  "deputy",
  "when_i_work",
] as const;

export type ScheduleProviderId = (typeof SCHEDULE_PROVIDER_IDS)[number];

export type ScheduleProvider = {
  id: ScheduleProviderId;
  label: string;
  description: string;
  status: "available" | "coming_soon";
};

export const SCHEDULE_PROVIDERS: ScheduleProvider[] = [
  {
    id: "built_in",
    label: "Built-in",
    description: "Use Merchiva's native schedule, availability and shift tools.",
    status: "available",
  },
  {
    id: "7shifts",
    label: "7shifts",
    description: "Restaurant scheduling, time clock, labor and availability.",
    status: "available",
  },
  {
    id: "homebase",
    label: "Homebase",
    description: "Schedules, time clocks, payroll prep and team messaging.",
    status: "coming_soon",
  },
  {
    id: "deputy",
    label: "Deputy",
    description: "Workforce scheduling, timesheets and labor compliance.",
    status: "coming_soon",
  },
  {
    id: "when_i_work",
    label: "When I Work",
    description: "Shift planning, availability and team attendance.",
    status: "coming_soon",
  },
];

export function normalizeScheduleProvider(value: string | null | undefined): ScheduleProviderId | null {
  return SCHEDULE_PROVIDER_IDS.includes(value as ScheduleProviderId)
    ? (value as ScheduleProviderId)
    : null;
}

export function scheduleProviderLabel(value: string | null | undefined): string {
  const id = normalizeScheduleProvider(value);
  return SCHEDULE_PROVIDERS.find((p) => p.id === id)?.label ?? "Schedule software";
}
