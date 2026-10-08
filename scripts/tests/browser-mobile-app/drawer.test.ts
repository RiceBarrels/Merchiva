import { describe, expect, test } from "bun:test";
import {
  DRAWER_CONTENT_RADIUS,
  DRAWER_MAX_WIDTH,
  DRAWER_SIDEBAR_MIN_SCALE,
  SAFARI_EDGE_PX,
  clampProgress,
  contentOffset,
  contentRadius,
  contentShadow,
  drawerProgressAt,
  drawerReleaseOpen,
  drawerWidth,
  inSafariEdge,
  merchivaProgressAt,
  merchivaReleaseCommit,
  pageFootprint,
  pageOwnsCorner,
  pageSwipeAction,
  sidebarScale,
  towardEnd,
} from "@/lib/browser-shell/mobile-app/drawer";
import { SWIPE_COMMIT_SHARE, SWIPE_COMMIT_VELOCITY } from "@/lib/gestures/page-swipe";

describe("drawer width", () => {
  test("85% of the frame, at most 300px", () => {
    expect(drawerWidth(320)).toBe(272);
    expect(drawerWidth(340)).toBe(289);
    expect(drawerWidth(360)).toBe(DRAWER_MAX_WIDTH);
    expect(drawerWidth(390)).toBe(DRAWER_MAX_WIDTH);
    expect(drawerWidth(1000)).toBe(DRAWER_MAX_WIDTH);
  });

  test("an unmeasured frame falls back to the maximum", () => {
    expect(drawerWidth(0)).toBe(DRAWER_MAX_WIDTH);
    expect(drawerWidth(Number.NaN)).toBe(DRAWER_MAX_WIDTH);
  });
});

describe("drag progress, LTR and RTL", () => {
  test("toward the end is rightward in LTR and leftward in RTL", () => {
    expect(towardEnd(40, "ltr")).toBe(40);
    expect(towardEnd(40, "rtl")).toBe(-40);
  });

  test("opening follows the finger from where it took the drawer", () => {
    expect(drawerProgressAt(0, 150, 300, "ltr")).toBe(0.5);
    expect(drawerProgressAt(0, -150, 300, "rtl")).toBe(0.5);
    // Taken mid-animation at 0.25.
    expect(drawerProgressAt(0.25, 75, 300, "ltr")).toBe(0.5);
  });

  test("closing runs the other way and both clamp to 0–1", () => {
    expect(drawerProgressAt(1, -150, 300, "ltr")).toBe(0.5);
    expect(drawerProgressAt(1, 150, 300, "rtl")).toBe(0.5);
    expect(drawerProgressAt(1, 90, 300, "ltr")).toBe(1);
    expect(drawerProgressAt(0, -90, 300, "ltr")).toBe(0);
    expect(drawerProgressAt(0, 900, 300, "ltr")).toBe(1);
  });

  test("a zero width never divides", () => {
    expect(drawerProgressAt(0.4, 100, 0, "ltr")).toBe(0.4);
    expect(clampProgress(Number.NaN)).toBe(0);
  });
});

describe("the pushed page", () => {
  test("moves toward the end by the drawer width × progress, and rests at 0", () => {
    expect(contentOffset(0, 300, "ltr")).toBe(0);
    expect(contentOffset(0.5, 300, "ltr")).toBe(150);
    expect(contentOffset(1, 272, "rtl")).toBe(-272);
    expect(contentOffset(2, 300, "ltr")).toBe(300);
  });

  test("rounds only its leading corners, which are on the right in RTL", () => {
    expect(contentRadius(0, "ltr")).toBe("0px 0px 0px 0px");
    expect(contentRadius(1, "ltr")).toBe(`${DRAWER_CONTENT_RADIUS}px 0px 0px ${DRAWER_CONTENT_RADIUS}px`);
    expect(contentRadius(1, "rtl")).toBe(`0px ${DRAWER_CONTENT_RADIUS}px ${DRAWER_CONTENT_RADIUS}px 0px`);
  });

  test("casts no shadow at rest and a soft one toward the drawer while moved", () => {
    expect(contentShadow(0, "ltr")).toBe("none");
    expect(contentShadow(0.5, "ltr")).toStartWith("-4px 0px 16px rgba(0, 0, 0, ");
    expect(contentShadow(0.5, "rtl")).toStartWith("4px 0px 16px rgba(0, 0, 0, ");
  });

  test("the sidebar beneath grows from 0.94 to full size", () => {
    expect(sidebarScale(0)).toBe(DRAWER_SIDEBAR_MIN_SCALE);
    expect(sidebarScale(1)).toBe(1);
    expect(sidebarScale(0.5)).toBeCloseTo(0.97, 5);
  });
});

describe("routing a locked swipe", () => {
  test("drawer closed: toward the end opens it, toward the start is Mr. Merchiva when available", () => {
    expect(pageSwipeAction({ drawerOpen: false, direction: "toEnd", merchivaAvailable: true })).toBe("openDrawer");
    expect(pageSwipeAction({ drawerOpen: false, direction: "toStart", merchivaAvailable: true })).toBe("merchiva");
    expect(pageSwipeAction({ drawerOpen: false, direction: "toStart", merchivaAvailable: false })).toBe("none");
  });

  test("drawer open: toward the start closes it and never reaches Mr. Merchiva; toward the end does nothing", () => {
    expect(pageSwipeAction({ drawerOpen: true, direction: "toStart", merchivaAvailable: true })).toBe("closeDrawer");
    expect(pageSwipeAction({ drawerOpen: true, direction: "toEnd", merchivaAvailable: true })).toBe("none");
  });
});

describe("release", () => {
  const fast = SWIPE_COMMIT_VELOCITY + 0.1;

  test("opening commits past the commit share or on a flick toward the end", () => {
    expect(drawerReleaseOpen("openDrawer", SWIPE_COMMIT_SHARE + 0.01, 0, "ltr")).toBe(true);
    expect(drawerReleaseOpen("openDrawer", 0.1, 0, "ltr")).toBe(false);
    expect(drawerReleaseOpen("openDrawer", 0.1, fast, "ltr")).toBe(true);
    // RTL: toward the end is leftward, so a positive velocity is a flick back.
    expect(drawerReleaseOpen("openDrawer", 0.1, -fast, "rtl")).toBe(true);
    expect(drawerReleaseOpen("openDrawer", 0.9, fast, "rtl")).toBe(false);
  });

  test("closing commits past the share toward closed or on a flick toward the start", () => {
    expect(drawerReleaseOpen("closeDrawer", 0.9, 0, "ltr")).toBe(true);
    expect(drawerReleaseOpen("closeDrawer", 1 - SWIPE_COMMIT_SHARE - 0.01, 0, "ltr")).toBe(false);
    expect(drawerReleaseOpen("closeDrawer", 0.95, -fast, "ltr")).toBe(false);
    expect(drawerReleaseOpen("closeDrawer", 0.95, fast, "rtl")).toBe(false);
    // A fast flick back toward open keeps it open even far along.
    expect(drawerReleaseOpen("closeDrawer", 0.2, fast, "ltr")).toBe(true);
  });

  test("Mr. Merchiva follows a swipe toward the start and commits like the drawer", () => {
    expect(merchivaProgressAt(-195, 390, "ltr")).toBe(0.5);
    expect(merchivaProgressAt(195, 390, "rtl")).toBe(0.5);
    expect(merchivaProgressAt(60, 390, "ltr")).toBe(0);
    expect(merchivaProgressAt(-60, 0, "ltr")).toBe(0);
    expect(merchivaReleaseCommit(0.5, 0, "ltr")).toBe(true);
    expect(merchivaReleaseCommit(0.1, -fast, "ltr")).toBe(true);
    expect(merchivaReleaseCommit(0.9, fast, "ltr")).toBe(false);
    expect(merchivaReleaseCommit(0.1, fast, "rtl")).toBe(true);
  });
});

describe("page footprint at the bottom of the viewport", () => {
  const typing = { immersive: false, docked: true, keyboardOpen: true, keyboardInset: 336, bottomInset: 34 };

  test("docked routes end at the top of the keyboard where the webview keeps its height", () => {
    expect(pageFootprint(typing)).toBe(336);
    // Android native: the webview itself shrinks.
    expect(pageFootprint({ ...typing, keyboardInset: 0 })).toBe(0);
    expect(pageFootprint({ ...typing, keyboardInset: -5 })).toBe(0);
  });

  test("otherwise the page ends above the home indicator, typing or not", () => {
    expect(pageFootprint({ ...typing, docked: false })).toBe(34);
    expect(pageFootprint({ ...typing, keyboardOpen: false })).toBe(34);
    expect(pageFootprint({ ...typing, keyboardOpen: false, bottomInset: 0 })).toBe(0);
  });

  test("immersive pages take the whole viewport", () => {
    expect(pageFootprint({ ...typing, immersive: true })).toBe(0);
    expect(pageFootprint({ ...typing, immersive: true, keyboardOpen: false })).toBe(0);
  });
});

describe("screen edges and the corner", () => {
  test("Safari's edge zones on both sides", () => {
    expect(inSafariEdge(SAFARI_EDGE_PX - 1, 390)).toBe(true);
    expect(inSafariEdge(390 - SAFARI_EDGE_PX + 1, 390)).toBe(true);
    expect(inSafariEdge(SAFARI_EDGE_PX, 390)).toBe(false);
    expect(inSafariEdge(195, 390)).toBe(false);
  });

  test("the office editors own the top start corner; their homes and other pages do not", () => {
    for (const path of ["/manager/docs/edit", "/manager/docs/edit/", "/manager/drive/sheet", "/manager/drive/slides"]) {
      expect(pageOwnsCorner(path)).toBe(true);
    }
    for (const path of ["/manager/docs", "/manager/drive", "/manager/drive/sheets-guide", "/manager/personnel/schedule", "/manager/channel"]) {
      expect(pageOwnsCorner(path)).toBe(false);
    }
  });
});
