import type { SiteElement } from "@/lib/types";

export interface ComponentDragPayload {
  id: string;
  name: string;
  data: SiteElement;
}

export const componentDragState: {
  payload: ComponentDragPayload | null;
} = { payload: null };
