import React from "react";
import { Dashboard } from "./Dashboard.tsx";
import { Inventory } from "./Inventory.tsx";
import { Sales } from "./Sales.tsx";
import { Products } from "./Products.tsx";
import { Personnel } from "./Personnel.tsx";
import { Customers } from "./Customers.tsx";
import { Chat } from "./Chat.tsx";
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

// page key → renderer. Anything not listed falls back to <Placeholder>, which
// keeps the same header/tabs frame so navigation always feels complete.
const REGISTRY: Record<string, (p: PageProps) => React.ReactElement> = {
  dashboard: () => <Dashboard />,
  inventory: (p) => <Inventory height={p.height} focused={p.focused} setCapturing={p.setCapturing} />,
  sales: (p) => <Sales height={p.height} />,
  products: (p) => <Products height={p.height} focused={p.focused} setCapturing={p.setCapturing} />,
  personnel: (p) => <Personnel height={p.height} />,
  customers: (p) => <Customers height={p.height} />,
  chat: (p) => <Chat focused={p.focused} height={p.height} />,
};

export function renderPage(props: PageProps): React.ReactElement {
  const r = REGISTRY[props.page];
  return r ? r(props) : <Placeholder page={props.page} />;
}
