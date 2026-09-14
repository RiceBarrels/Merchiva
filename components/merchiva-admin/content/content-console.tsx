"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OrgPicker, useSelectedOrg } from "@/components/merchiva-admin/org-picker";
import { PageHeader } from "@/components/merchiva-admin/ui";
import { BlogTab } from "./blog-tab";
import { ChatTab } from "./chat-tab";
import { NotificationsTab } from "./notifications-tab";
import { BriefingsTab } from "./briefings-tab";
import { TodosTab } from "./todos-tab";
import { AiTab } from "./ai-tab";
import { DevicesTab } from "./devices-tab";

const TABS = [
  { id: "blog", label: "Blog", perOrg: false },
  { id: "chat", label: "Chat", perOrg: true },
  { id: "notifications", label: "Notifications", perOrg: true },
  { id: "briefings", label: "Briefings", perOrg: true },
  { id: "todos", label: "Todos", perOrg: true },
  { id: "ai", label: "AI", perOrg: true },
  { id: "devices", label: "Devices", perOrg: true },
] as const;

type TabId = (typeof TABS)[number]["id"];

function isTabId(v: string | null): v is TabId {
  return TABS.some((t) => t.id === v);
}

export function ContentConsole() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { orgId, setOrgId } = useSelectedOrg();

  const fromUrl = params.get("tab");
  const tab: TabId = isTabId(fromUrl) ? fromUrl : "blog";

  const setTab = (next: TabId) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("tab", next);
    router.replace(`${pathname}?${sp.toString()}`);
  };

  const current = TABS.find((t) => t.id === tab) ?? TABS[0];
  const orgKey = orgId ?? "none";

  return (
    <div>
      <PageHeader eyebrow="content & system" title="Content & system">
        {current.perOrg && <OrgPicker orgId={orgId} onChange={setOrgId} />}
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-0 border-b border-stone-200">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${
                active ? "border-stone-900 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Per-org tabs are keyed on the org so filters / selections / forms reset on switch. */}
      {tab === "blog" && <BlogTab />}
      {tab === "chat" && <ChatTab key={orgKey} orgId={orgId} />}
      {tab === "notifications" && <NotificationsTab key={orgKey} orgId={orgId} />}
      {tab === "briefings" && <BriefingsTab key={orgKey} orgId={orgId} />}
      {tab === "todos" && <TodosTab key={orgKey} orgId={orgId} />}
      {tab === "ai" && <AiTab key={orgKey} orgId={orgId} />}
      {tab === "devices" && <DevicesTab key={orgKey} orgId={orgId} />}
    </div>
  );
}
