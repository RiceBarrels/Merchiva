// notificationFeature (lib/notifications/features.ts) and deviceDotTarget
// (lib/notifications/device-tiles.ts) over every producer's real row: its
// `type` and the link the module writes (spacetimedb/src/notify/producers.ts,
// chat/notify.ts, device/pin-guard.ts, forms/responses.ts, index.ts docLink, the
// store-ai reply), on /manager and on both device surfaces.

import { describe, expect, test } from "bun:test";
import { listNavSections } from "@/lib/browser-shell/access";
import type { AccessContext } from "@/lib/browser-shell/types";
import { deviceDotApp, deviceDotTarget, type DeviceDotTarget } from "@/lib/notifications/device-tiles";
import { notificationFeature, type NotificationFeatureKind } from "@/lib/notifications/features";
import { placeUrl } from "@/lib/presence/rows";

const OWNER: AccessContext = {
  isOwner: true,
  can: () => true,
  installedApps: new Set(["sales", "products", "tasks", "training", "pay", "bookings", "docs", "sheets", "slides", "forms"]),
  appsReady: true,
  appMode: "admin",
  personalMode: false,
  isCapacitor: false,
};
const SECTIONS = listNavSections(OWNER);
const MANAGER = { canViewTeam: true, sections: SECTIONS };
const STAFF = { canViewTeam: false, sections: SECTIONS };

const CONV = "0f1e2d3c-4b5a-4968-8776-655443322110";
const DOC = "11111111-1111-4111-8111-111111111111";

interface Producer {
  readonly name: string;
  readonly type: string;
  readonly link: string | null;
  readonly kind: NotificationFeatureKind | null;
  readonly href?: string;
  readonly section?: string;
  readonly child?: string | null;
  readonly device: DeviceDotTarget | null;
}

/** Every producer, with what a manager (who may open the team page) sees. */
const PRODUCERS: readonly Producer[] = [
  { name: "chat.message / mention / follow / pin", type: "team", link: `/manager/channel?c=${CONV}`, kind: "chat", href: "/manager/channel", section: "/manager/channel", child: null, device: { kind: "channel", conversationId: CONV } },
  { name: "chat.merchiva in a channel", type: "team", link: `/manager/channel?c=${CONV}`, kind: "chat", href: "/manager/channel", section: "/manager/channel", child: null, device: { kind: "channel", conversationId: CONV } },
  { name: "older Mr. Merchiva channel row (no ?c)", type: "team", link: "/manager/channel", kind: "chat", href: "/manager/channel", section: "/manager/channel", child: null, device: { kind: "channel", conversationId: null } },
  { name: "Mr. Merchiva background reply", type: "general", link: "/manager/dashboard?mvsession=s-1", kind: "merchiva", href: "/manager/dashboard", device: null },
  { name: "timeOff.requested / approved / denied / updated", type: "time_off", link: "/manager/personnel", kind: "schedule", href: "/manager/personnel/schedule", section: "/manager/personnel/schedule", child: "/manager/personnel/schedule", device: null },
  { name: "shift.requested / open", type: "shift_trade", link: "/manager/personnel", kind: "schedule", href: "/manager/personnel/schedule", section: "/manager/personnel/schedule", child: "/manager/personnel/schedule", device: null },
  { name: "team.joined", type: "team", link: "/manager/personnel/team", kind: "team", href: "/manager/personnel/team", section: "/manager/personnel/schedule", child: "/manager/personnel/team", device: { kind: "tile", app: "directory" } },
  { name: "inventory.low / waste", type: "inventory_low", link: "/manager/inventory", kind: "inventory", href: "/manager/inventory", section: "/manager/inventory", child: null, device: { kind: "tile", app: "inventory" } },
  { name: "scan cron restock (custom)", type: "order", link: "/manager/inventory", kind: "inventory", href: "/manager/inventory", section: "/manager/inventory", child: null, device: { kind: "tile", app: "inventory" } },
  { name: "supplier.order / issue", type: "order", link: "/manager/suppliers", kind: "supplier", href: "/manager/suppliers", section: "/manager/inventory", child: "/manager/suppliers", device: null },
  { name: "security.* (current link)", type: "security", link: "/manager/personnel/team", kind: "security", href: "/manager/personnel/team", section: "/manager/personnel/schedule", child: "/manager/personnel/team", device: null },
  { name: "security.* (older rows)", type: "security", link: "/manager/personnel", kind: "security", href: "/manager/personnel/team", section: "/manager/personnel/schedule", child: "/manager/personnel/team", device: null },
  { name: "doc.shared (doc)", type: "doc_share", link: `/manager/docs/edit?id=${DOC}`, kind: "drive", href: "/manager/drive", section: "/manager/drive", child: null, device: { kind: "tile", app: "drive" } },
  { name: "doc.shared (sheet)", type: "doc_share", link: `/manager/drive/sheet?id=${DOC}`, kind: "drive", href: "/manager/drive", section: "/manager/drive", child: null, device: { kind: "tile", app: "drive" } },
  { name: "doc.comment (slides)", type: "doc_comment", link: `/manager/drive/slides?id=${DOC}&comment=t1`, kind: "drive", href: "/manager/drive", section: "/manager/drive", child: null, device: { kind: "tile", app: "drive" } },
  { name: "doc.reply (doc)", type: "doc_comment", link: `/manager/docs/edit?id=${DOC}&comment=t1`, kind: "drive", href: "/manager/drive", section: "/manager/drive", child: null, device: { kind: "tile", app: "drive" } },
  { name: "form.response", type: "form_response", link: "/manager/forms/edit?id=f1&view=responses", kind: "forms", href: "/manager/forms", section: "/manager/forms", child: null, device: null },
  { name: "alert.emergency (sendStoreSos)", type: "emergency", link: null, kind: null, device: null },
  { name: "older tablet SOS", type: "emergency", link: "/store", kind: null, device: null },
  { name: "admin console, even with a feature link", type: "admin", link: "/manager/inventory", kind: null, device: null },
  { name: "self alert from Mr. Merchiva (general)", type: "general", link: null, kind: null, device: null },
  { name: "self alert from Mr. Merchiva (urgent)", type: "urgent", link: null, kind: null, device: null },
  { name: "self alert about stock (no link)", type: "inventory_low", link: null, kind: "inventory", href: "/manager/inventory", section: "/manager/inventory", child: null, device: { kind: "tile", app: "inventory" } },
  { name: "self alert about shifts (no link)", type: "shift_trade", link: null, kind: "schedule", href: "/manager/personnel/schedule", section: "/manager/personnel/schedule", child: "/manager/personnel/schedule", device: null },
];

describe("notificationFeature × every producer", () => {
  for (const p of PRODUCERS) {
    test(p.name, () => {
      const feature = notificationFeature({ type: p.type, link: p.link }, MANAGER);
      if (p.kind === null) {
        expect(feature).toBeNull();
        return;
      }
      expect(feature?.kind).toBe(p.kind);
      expect(feature?.href).toBe(p.href!);
      if (p.section === undefined) expect(feature?.placement).toBeNull();
      else expect(feature?.placement).toEqual({ sectionHref: p.section, childHref: p.child ?? null });
      for (const surface of ["store", "personal"] as const) {
        expect([surface, deviceDotTarget(feature!, surface)]).toEqual([surface, p.device]);
      }
    });
  }
});

describe("notificationFeature rules", () => {
  test("the type decides before the link for security, SOS, console and self rows", () => {
    expect(notificationFeature({ type: "security", link: "/manager/inventory" }, MANAGER)?.kind).toBe("security");
    expect(notificationFeature({ type: "emergency", link: `/manager/channel?c=${CONV}` }, MANAGER)).toBeNull();
    expect(notificationFeature({ type: "admin", link: `/manager/docs/edit?id=${DOC}` }, MANAGER)).toBeNull();
    expect(notificationFeature({ type: "general", link: "/manager/dashboard?mvsession=x" }, MANAGER)?.kind).toBe("merchiva");
  });

  test("an unsafe or unknown link falls back to the type", () => {
    expect(notificationFeature({ type: "time_off", link: "https://evil.com/manager/inventory" }, MANAGER)?.kind).toBe("schedule");
    expect(notificationFeature({ type: "doc_share", link: "//evil.com" }, MANAGER)?.link).toBeNull();
    expect(notificationFeature({ type: "doc_share", link: "/manager/sales" }, MANAGER)?.kind).toBe("drive");
    expect(notificationFeature({ type: "something_new", link: "/manager/sales" }, MANAGER)).toBeNull();
    expect(notificationFeature({ type: "something_new", link: "/manager/forms" }, MANAGER)?.kind).toBe("forms");
  });

  test("a legacy /manager/chat link is a channel link", () => {
    const feature = notificationFeature({ type: "team", link: `/manager/chat?c=${CONV}` }, MANAGER);
    expect(feature?.kind).toBe("chat");
    expect(feature?.conversationId).toBe(CONV);
  });

  test("a team join is alert-only for someone who cannot open the team page", () => {
    expect(notificationFeature({ type: "team", link: "/manager/personnel/team" }, STAFF)).toBeNull();
    expect(notificationFeature({ type: "team", link: null }, STAFF)).toBeNull();
    // Chat rows share the type and stay chat for everyone.
    expect(notificationFeature({ type: "team", link: `/manager/channel?c=${CONV}` }, STAFF)?.kind).toBe("chat");
  });

  test("without sections nothing is placed, and Mr. Merchiva never is", () => {
    expect(notificationFeature({ type: "inventory_low", link: "/manager/inventory" }, { canViewTeam: true })?.placement).toBeNull();
    expect(notificationFeature({ type: "general", link: "/manager/dashboard?mvsession=x" }, MANAGER)?.placement).toBeNull();
  });

  test("a section this person does not see places nothing", () => {
    const noInventory = listNavSections({ ...OWNER, isOwner: false, can: (s) => s !== "inventory" });
    const feature = notificationFeature({ type: "inventory_low", link: "/manager/inventory" }, { canViewTeam: true, sections: noInventory });
    expect(feature?.kind).toBe("inventory");
    expect(feature?.placement).toBeNull();
  });

  test("placement is placeUrl of the feature's entry", () => {
    for (const p of PRODUCERS) {
      const feature = notificationFeature({ type: p.type, link: p.link }, MANAGER);
      if (!feature || feature.kind === "merchiva") continue;
      expect(feature.placement).toEqual(placeUrl(feature.href, SECTIONS));
    }
  });
});

describe("device dot targets", () => {
  test("only drive, inventory, the directory and the channel header ever carry a device dot", () => {
    const apps = new Set<string>();
    for (const p of PRODUCERS) {
      const feature = notificationFeature({ type: p.type, link: p.link }, MANAGER);
      if (!feature) continue;
      for (const surface of ["store", "personal"] as const) {
        const target = deviceDotTarget(feature, surface);
        if (target) apps.add(deviceDotApp(target));
      }
    }
    expect([...apps].sort()).toEqual(["channel", "directory", "drive", "inventory"]);
  });

  test("security, supplier, forms, schedule and Mr. Merchiva have no device dot (they stay unread for /manager)", () => {
    for (const [type, link] of [
      ["security", "/manager/personnel/team"],
      ["order", "/manager/suppliers"],
      ["form_response", "/manager/forms/edit?id=f1&view=responses"],
      ["time_off", "/manager/personnel"],
      ["shift_trade", "/manager/personnel"],
      ["general", "/manager/dashboard?mvsession=x"],
    ] as const) {
      const feature = notificationFeature({ type, link }, MANAGER)!;
      expect([type, deviceDotTarget(feature, "store"), deviceDotTarget(feature, "personal")]).toEqual([type, null, null]);
    }
  });
});
