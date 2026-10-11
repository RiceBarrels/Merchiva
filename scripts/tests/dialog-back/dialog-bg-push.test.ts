// components/ui/dialog-bg-push.ts: a pushed layer belongs to the dialog that pushed it last. A page closing
// while another was opened over the same layer (reopened during its slide-out) leaves the new push alone, and
// the clean-up a release schedules never strips the transition from a push that came after it.

import { describe, expect, test } from "bun:test";
import { DIALOG_BG_TRANSITION, claimBgTarget, createBgOwner, dialogBgFrame, releaseBgTarget, type BgOwner } from "@/components/ui/dialog-bg-push";

function layer() {
  return { style: { transition: "", transform: "", borderRadius: "", overflow: "" } } as unknown as HTMLElement;
}

function push(el: HTMLElement, owner: BgOwner) {
  if (!claimBgTarget(el, owner)) return;
  el.style.transition = DIALOG_BG_TRANSITION;
  el.style.transform = "translateX(-117px) scale(0.94)";
  el.style.overflow = "hidden";
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("dialog bg push ownership", () => {
  test("the owner's release slides the layer back and then clears it", async () => {
    const el = layer();
    const page = createBgOwner();
    push(el, page);
    releaseBgTarget(el, page);
    expect(el.style.transform).toBe("");
    expect(el.style.transition).toBe(DIALOG_BG_TRANSITION);
    await wait(560);
    expect(el.style.transition).toBe("");
    expect(el.style.overflow).toBe("");
  });

  test("a page reopened during the slide-out keeps its push and its transition", async () => {
    const el = layer();
    const old = createBgOwner();
    const reopened = createBgOwner();
    push(el, old);
    releaseBgTarget(el, old);
    push(el, reopened);
    await wait(560);
    expect(el.style.transform).toBe("translateX(-117px) scale(0.94)");
    expect(el.style.transition).toBe(DIALOG_BG_TRANSITION);
  });

  test("the old page unmounting after the new one pushed lets nothing go", () => {
    const el = layer();
    const old = createBgOwner();
    const reopened = createBgOwner();
    push(el, old);
    push(el, reopened);
    releaseBgTarget(el, old);
    expect(el.style.transform).toBe("translateX(-117px) scale(0.94)");
    expect(el.style.overflow).toBe("hidden");
  });
});

describe("ranks", () => {
  test("an older page's late frames cannot take the layer back from a newer one", () => {
    const el = layer();
    const old = createBgOwner();
    const reopened = createBgOwner();
    push(el, reopened);
    expect(claimBgTarget(el, old)).toBe(false);
    expect(claimBgTarget(el, reopened)).toBe(true);
  });
});

describe("dialogBgFrame", () => {
  test("rest is identity; a page fully over the layer pushes it 30% aside, scaled and rounded", () => {
    expect(dialogBgFrame(0, 400)).toEqual({ shift: -0, scale: 1, radius: 0 });
    expect(dialogBgFrame(1, 400)).toEqual({ shift: -120, scale: 0.94, radius: 12 });
    expect(dialogBgFrame(2, 400)).toEqual(dialogBgFrame(1, 400));
  });
});
