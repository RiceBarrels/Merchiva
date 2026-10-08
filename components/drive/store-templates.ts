"use client";

// The Docs store templates Drive offers under New ▸ From a template (lib/docs/templates.ts, all but blank, which is
// New ▸ Doc), and the store and author names a template fills in. Shared by the manager New menu and the lite New
// drawer, so it holds no menu UI: the device apps never load the manager's menu primitives.

import { useMemo } from "react";
import { useAuth } from "@/lib/auth/context";
import { usePermissions } from "@/lib/context/permissions";
import { DOC_TEMPLATE_IDS, type DocTemplateId } from "@/lib/docs/templates";

export type StoreTemplateId = Exclude<DocTemplateId, "blank">;

/** The templates New ▸ From a template offers, in the Docs display order. */
export const STORE_TEMPLATE_IDS: readonly StoreTemplateId[] = DOC_TEMPLATE_IDS.filter(
  (id): id is StoreTemplateId => id !== "blank",
);

export interface DocTemplateNames {
  storeName: string | null;
  authorName: string | null;
}

/** The store's name and the creator's (their member name, else their account name or email) for a template. */
export function useDocTemplateNames(memberNames: ReadonlyMap<string, string>, memberId: string | null): DocTemplateNames {
  const { currentOrg } = usePermissions();
  const { user } = useAuth();
  const storeName = currentOrg?.name ?? null;
  const authorName = useMemo(() => {
    const fromMember = memberId ? memberNames.get(memberId) : undefined;
    if (fromMember) return fromMember;
    if (!user) return null;
    return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || null;
  }, [memberId, memberNames, user]);
  return useMemo(() => ({ storeName, authorName }), [storeName, authorName]);
}
