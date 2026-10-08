"use client";

// Arrange menu (slides.md §7.2): stacking order, align (to each other, or to the slide for one element), distribute,
// rotate and flip, lock. The same items open from the toolbar's arrange button (ArrangeItems).
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter,
  AlignStartHorizontal, AlignStartVertical, AlignVerticalDistributeCenter, ArrowDownToLine, ArrowUpToLine, BringToFront,
  ChevronsDown, ChevronsUp, FlipHorizontal2, FlipVertical2, Lock, LockOpen, RotateCcw, RotateCw,
} from "lucide-react";

import {
  DocMenu, DocMenuContent, DocMenuItem, DocMenuSeparator, DocMenuSub, DocMenuSubContent, DocMenuSubTrigger, DocMenuTrigger,
} from "@/components/docs/ui/doc-menu";
import { MENUBAR_TRIGGER_CLASS } from "@/components/docs/menubar/doc-menubar";
import { useSlidesFinalFocus, useSlidesSelection, useSlidesShortcutLabels } from "@/components/slides/chrome/chrome-hooks";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { useT } from "@/lib/i18n/context";

export function ArrangeItems() {
  const t = useT();
  const label = useSlidesShortcutLabels();
  const { el } = useSlidesEditor();
  const sel = useSlidesSelection();
  const none = !sel.writable || sel.selected.length === 0;
  const movable = !sel.writable || sel.selected.length === 0 || sel.allLocked;
  return (
    <>
      <DocMenuSub>
        <DocMenuSubTrigger icon={BringToFront} disabled={none}>
          {t("slides.arrange.order")}
        </DocMenuSubTrigger>
        <DocMenuSubContent>
          <DocMenuItem icon={ArrowUpToLine} shortcut={label("front")} onClick={() => el.arrange("front")}>
            {t("slides.arrange.bringToFront")}
          </DocMenuItem>
          <DocMenuItem icon={ChevronsUp} shortcut={label("forward")} onClick={() => el.arrange("forward")}>
            {t("slides.arrange.bringForward")}
          </DocMenuItem>
          <DocMenuItem icon={ChevronsDown} shortcut={label("backward")} onClick={() => el.arrange("backward")}>
            {t("slides.arrange.sendBackward")}
          </DocMenuItem>
          <DocMenuItem icon={ArrowDownToLine} shortcut={label("back")} onClick={() => el.arrange("back")}>
            {t("slides.arrange.sendToBack")}
          </DocMenuItem>
        </DocMenuSubContent>
      </DocMenuSub>
      <DocMenuSub>
        <DocMenuSubTrigger icon={AlignStartVertical} disabled={movable}>
          {t("slides.arrange.align")}
        </DocMenuSubTrigger>
        <DocMenuSubContent>
          <DocMenuItem icon={AlignStartVertical} onClick={() => el.align("left")}>
            {t("slides.arrange.alignLeft")}
          </DocMenuItem>
          <DocMenuItem icon={AlignCenterVertical} onClick={() => el.align("center")}>
            {t("slides.arrange.alignCenter")}
          </DocMenuItem>
          <DocMenuItem icon={AlignEndVertical} onClick={() => el.align("right")}>
            {t("slides.arrange.alignRight")}
          </DocMenuItem>
          <DocMenuSeparator />
          <DocMenuItem icon={AlignStartHorizontal} onClick={() => el.align("top")}>
            {t("slides.arrange.alignTop")}
          </DocMenuItem>
          <DocMenuItem icon={AlignCenterHorizontal} onClick={() => el.align("middle")}>
            {t("slides.arrange.alignMiddle")}
          </DocMenuItem>
          <DocMenuItem icon={AlignEndHorizontal} onClick={() => el.align("bottom")}>
            {t("slides.arrange.alignBottom")}
          </DocMenuItem>
        </DocMenuSubContent>
      </DocMenuSub>
      <DocMenuSub>
        <DocMenuSubTrigger icon={AlignHorizontalDistributeCenter} disabled={movable || sel.selected.length < 3}>
          {t("slides.arrange.distribute")}
        </DocMenuSubTrigger>
        <DocMenuSubContent>
          <DocMenuItem icon={AlignHorizontalDistributeCenter} onClick={() => el.distribute("h")}>
            {t("slides.arrange.distributeH")}
          </DocMenuItem>
          <DocMenuItem icon={AlignVerticalDistributeCenter} onClick={() => el.distribute("v")}>
            {t("slides.arrange.distributeV")}
          </DocMenuItem>
        </DocMenuSubContent>
      </DocMenuSub>
      <DocMenuSub>
        <DocMenuSubTrigger icon={RotateCw} disabled={movable}>
          {t("slides.arrange.rotate")}
        </DocMenuSubTrigger>
        <DocMenuSubContent>
          <DocMenuItem icon={RotateCw} onClick={() => el.rotate(90)}>
            {t("slides.arrange.rotateCw")}
          </DocMenuItem>
          <DocMenuItem icon={RotateCcw} onClick={() => el.rotate(-90)}>
            {t("slides.arrange.rotateCcw")}
          </DocMenuItem>
          <DocMenuSeparator />
          <DocMenuItem icon={FlipHorizontal2} onClick={() => el.flip("h")}>
            {t("slides.arrange.flipH")}
          </DocMenuItem>
          <DocMenuItem icon={FlipVertical2} onClick={() => el.flip("v")}>
            {t("slides.arrange.flipV")}
          </DocMenuItem>
        </DocMenuSubContent>
      </DocMenuSub>
      <DocMenuSeparator />
      {sel.allLocked ? (
        <DocMenuItem icon={LockOpen} disabled={none} onClick={() => el.setLocked(false)}>
          {t("slides.arrange.unlock")}
        </DocMenuItem>
      ) : (
        <DocMenuItem icon={Lock} disabled={none} onClick={() => el.setLocked(true)}>
          {t("slides.arrange.lock")}
        </DocMenuItem>
      )}
    </>
  );
}

export function ArrangeMenu() {
  const t = useT();
  const finalFocus = useSlidesFinalFocus();
  return (
    <DocMenu>
      <DocMenuTrigger className={MENUBAR_TRIGGER_CLASS}>{t("slides.menubar.arrange")}</DocMenuTrigger>
      <DocMenuContent finalFocus={finalFocus} className="min-w-56">
        <ArrangeItems />
      </DocMenuContent>
    </DocMenu>
  );
}
