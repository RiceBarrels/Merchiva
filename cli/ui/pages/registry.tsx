import React from "react";
import { Dashboard } from "./Dashboard.tsx";
import { Inventory } from "./Inventory.tsx";
import { Sales } from "./Sales.tsx";
import { Products } from "./Products.tsx";
import { Pricing } from "./Pricing.tsx";
import { Personnel } from "./Personnel.tsx";
import { Chat } from "./Chat.tsx";
import { Schedule } from "./Schedule.tsx";
import { Suppliers } from "./Suppliers.tsx";
import { Waste } from "./Waste.tsx";
import { Finances } from "./Finances.tsx";
import { Reports } from "./Reports.tsx";
import { Roles } from "./Roles.tsx";
import { Training } from "./Training.tsx";
import { Settings } from "./Settings.tsx";
import { Placeholder } from "./Placeholder.tsx";

export interface PageProps {
  page: string;
  focused: boolean;
  width: number;
  height: number;
  /** Pages call this when a text-entry form opens/closes so the shell can
   *  suspend global shortcuts (q/x/c/o) while the user is typing. */
  setCapturing: (b: boolean) => void;
}

// Pages that take the standard interactive props (list + forms + selection).
type FullPage = (p: { height: number; focused: boolean; setCapturing: (b: boolean) => void }) => React.ReactElement;
const full =
  (C: FullPage) =>
  (p: PageProps): React.ReactElement =>
    C({ height: p.height, focused: p.focused, setCapturing: p.setCapturing });

// page key → renderer. Anything not listed falls back to <Placeholder>, which
// keeps the same header/tabs frame so navigation always feels complete.
const REGISTRY: Record<string, (p: PageProps) => React.ReactElement> = {
  dashboard: (p) => <Dashboard focused={p.focused} />,
  inventory: full(Inventory),
  suppliers: full(Suppliers),
  waste: full(Waste),
  products: full(Products),
  pricing: full(Pricing),
  sales: (p) => <Sales height={p.height} />,
  reports: full(Reports),
  finances: full(Finances),
  personnel: (p) => <Personnel height={p.height} />,
  schedule: full(Schedule),
  roles: full(Roles),
  training: full(Training),
  chat: (p) => <Chat focused={p.focused} height={p.height} />,
  settings: () => <Settings />,
};

export function renderPage(props: PageProps): React.ReactElement {
  const r = REGISTRY[props.page];
  return r ? r(props) : <Placeholder page={props.page} />;
}
