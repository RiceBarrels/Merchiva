const PREFIX = "merchiva_memory_";

export interface MerchivaMemory {
  summary: string;
  storeOverview: string;
  userPreferences: string;
}

function key(orgId: string, doc: string): string {
  return `${PREFIX}${orgId}_${doc}`;
}

export function loadMemory(orgId: string): MerchivaMemory {
  if (typeof window === "undefined") return { summary: "", storeOverview: "", userPreferences: "" };
  return {
    summary: localStorage.getItem(key(orgId, "summary")) ?? "",
    storeOverview: localStorage.getItem(key(orgId, "storeOverview")) ?? "",
    userPreferences: localStorage.getItem(key(orgId, "userPreferences")) ?? "",
  };
}

export function saveMemoryField(orgId: string, field: keyof MerchivaMemory, value: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key(orgId, field), value);
}

export function clearMemory(orgId: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(key(orgId, "summary"));
  localStorage.removeItem(key(orgId, "storeOverview"));
  localStorage.removeItem(key(orgId, "userPreferences"));
}
