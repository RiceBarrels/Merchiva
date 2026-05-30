"use client";

import { useMemo, useState } from "react";
import {
  TrainingRoleSwitcher,
  type TrainingRole,
} from "@/components/training/role-switcher";
import { TrainingManagerView } from "@/components/training/manager-view";
import { TrainingTrainerView } from "@/components/training/trainer-view";
import { TrainingInternView } from "@/components/training/intern-view";
import { usePersonnelHub } from "@/components/personnel/hub-context";
import { PersonnelLoading } from "@/components/personnel/hub-nav";

const TRAINING_ROLE_STORAGE_KEY = "bz_personnel_training_role";

export default function PersonnelTrainingPage() {
  const { organizationId, myMemberId, canManage, canGrade } = usePersonnelHub();

  const [role, setRole] = useState<TrainingRole>(() => {
    if (typeof window === "undefined") return "intern";
    try {
      const stored = window.localStorage.getItem(
        TRAINING_ROLE_STORAGE_KEY,
      ) as TrainingRole | null;
      if (stored === "manager" || stored === "trainer" || stored === "intern")
        return stored;
    } catch {}
    return "intern";
  });

  const effectiveRole: TrainingRole = useMemo(() => {
    if (role === "manager" && !canManage) return canGrade ? "trainer" : "intern";
    if (role === "trainer" && !canGrade) return "intern";
    return role;
  }, [role, canManage, canGrade]);

  const handleRoleChange = (next: TrainingRole) => {
    setRole(next);
    try {
      window.localStorage.setItem(TRAINING_ROLE_STORAGE_KEY, next);
    } catch {}
  };

  if (!organizationId) return <PersonnelLoading />;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <TrainingRoleSwitcher
        role={effectiveRole}
        onChange={handleRoleChange}
        canManage={canManage}
        canGrade={canGrade}
      />
      {effectiveRole === "manager" ? (
        <TrainingManagerView orgId={organizationId} />
      ) : effectiveRole === "trainer" ? (
        <TrainingTrainerView orgId={organizationId} />
      ) : (
        <TrainingInternView orgId={organizationId} userId={myMemberId} />
      )}
    </div>
  );
}
