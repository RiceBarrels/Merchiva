"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OrgPicker, useSelectedOrg } from "../org-picker";
import { PageHeader } from "../ui";
import { AvailabilityTab } from "./availability-tab";
import { PunchTab } from "./punch-tab";
import { RolesTab } from "./roles-tab";
import { EmptyOrgState } from "./shared";
import { ShiftsTab } from "./shifts-tab";
import { StaffTab } from "./staff-tab";
import { TimeOffTab } from "./time-off-tab";
import { TrainingTab } from "./training-tab";

const TABS = [
  { id: "staff", label: "Staff" },
  { id: "roles", label: "Roles & tasks" },
  { id: "shifts", label: "Shifts" },
  { id: "timeoff", label: "Time off" },
  { id: "availability", label: "Availability" },
  { id: "punch", label: "Punch clock" },
  { id: "training", label: "Training" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTabId(v: string | null): v is TabId {
  return TABS.some((t) => t.id === v);
}

export function StaffingConsole() {
  const { orgId, setOrgId } = useSelectedOrg();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fromUrl = params.get("tab");
  const tab: TabId = isTabId(fromUrl) ? fromUrl : "staff";

  function setTab(next: TabId) {
    const sp = new URLSearchParams(params.toString());
    sp.set("tab", next);
    router.replace(`${pathname}?${sp.toString()}`);
  }

  return (
    <div>
      <PageHeader eyebrow="staffing" title="Staffing">
        <OrgPicker orgId={orgId} onChange={setOrgId} />
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-stone-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${tab === t.id ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!orgId ? (
        <EmptyOrgState />
      ) : tab === "staff" ? (
        <StaffTab key={orgId} orgId={orgId} />
      ) : tab === "roles" ? (
        <RolesTab key={orgId} orgId={orgId} />
      ) : tab === "shifts" ? (
        <ShiftsTab key={orgId} orgId={orgId} />
      ) : tab === "timeoff" ? (
        <TimeOffTab key={orgId} orgId={orgId} />
      ) : tab === "availability" ? (
        <AvailabilityTab key={orgId} orgId={orgId} />
      ) : tab === "punch" ? (
        <PunchTab key={orgId} orgId={orgId} />
      ) : (
        <TrainingTab key={orgId} orgId={orgId} />
      )}
    </div>
  );
}
