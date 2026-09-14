/**
 * Navigation for the /merchivaAdmin platform console. Add a page here and it
 * shows up in the shell header. Keep labels short; group is used for the
 * header row layout.
 */
export interface AdminNavItem {
  href: string;
  label: string;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/merchivaAdmin", label: "Overview" },
  { href: "/merchivaAdmin/organizations", label: "Organizations" },
  { href: "/merchivaAdmin/users", label: "Users" },
  { href: "/merchivaAdmin/inventory", label: "Inventory" },
  { href: "/merchivaAdmin/staffing", label: "Staffing" },
  { href: "/merchivaAdmin/sales", label: "Sales" },
  { href: "/merchivaAdmin/content", label: "Content & system" },
  { href: "/merchivaAdmin/data", label: "Data" },
  { href: "/merchivaAdmin/admins", label: "Admins" },
];
