// Props every "lite" device app receives. Lite apps are the simplified,
// low-literacy versions of Merchiva features shown on /store and /personal
// (see components/device/apps/lite.tsx for the building blocks).

export interface LiteMember {
  /** org_member id. */
  id: string;
  displayName: string;
  /** owner | manager | staff */
  role: string;
  /** Identity hex of the member's user (null when unknown). */
  userIdHex: string | null;
  /** 4-digit punch-in code, when set. */
  punchInCode: string | null;
}

export interface LiteAppProps {
  /** Which device surface the app is open on. */
  surface: "store" | "personal";
  organizationId: string;
  /** The person using the app: the signed-in employee on /personal, the
   *  PIN / QR logged-in operator on /store. */
  member: LiteMember;
  /** True for owner / manager. */
  isManager: boolean;
}
