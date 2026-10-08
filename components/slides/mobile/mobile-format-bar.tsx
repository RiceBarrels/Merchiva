"use client";

// The phone's text bar (slides.md §11): shown while a text box, shape or table cell is being typed in, anchored
// above the soft keyboard (useVirtualKeyboard). Bold, italic, underline, text size down / up, colour, alignment
// (tap to cycle), bulleted and numbered list, and done typing. Every button prevents the pointer-down default, so a
// tap never takes focus from the text (the keyboard stays up); commands go through el.formatText, which drives the
// live editor. The colour choice opens a drawer with the toolbar's swatches.
import { useState, type ComponentType } from "react";
import { Baseline, Bold, ChevronDown, Italic, List, ListOrdered, Minus, Plus, Underline } from "lucide-react";

import { MobileDrawer } from "@/components/docs/mobile/mobile-drawer";
import { useEditingEditor, useSlidesSelection } from "@/components/slides/chrome/chrome-hooks";
import { SlidesColorSwatches } from "@/components/slides/chrome/color-picker";
import { ALIGN_ICONS } from "@/components/slides/chrome/paragraph-controls";
import { markToggle } from "@/components/slides/chrome/text-state";
import { useTextFormatState } from "@/components/slides/chrome/use-text-format";
import { useSlidesEditor } from "@/components/slides/editor/slides-context";
import { Button } from "@/components/ui/button";
import { useVirtualKeyboard } from "@/lib/browser-shell";
import { useT } from "@/lib/i18n/context";
import type { TextDefaults } from "@/lib/slides/model/types";
import { resolveColor } from "@/lib/slides/themes/themes";

export const MOBILE_SLIDE_FORMAT_BAR_HEIGHT = 44;

const NEXT_ALIGN: Readonly<Record<TextDefaults["align"], TextDefaults["align"]>> = { left: "center", center: "right", right: "justify", justify: "left" };
const ALIGN_KEYS: Readonly<Record<TextDefaults["align"], string>> = {
  left: "slides.format.alignLeft",
  center: "slides.format.alignCenter",
  right: "slides.format.alignRight",
  justify: "slides.format.alignJustify",
};

function BarButton({ icon: Icon, label, active, disabled, onPress }: { icon: ComponentType<{ className?: string }>; label: string; active?: boolean; disabled?: boolean; onPress(): void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      data-active={active ? "" : undefined}
      disabled={disabled}
      className="shrink-0 text-muted-foreground data-[active]:bg-muted data-[active]:text-foreground"
      onPointerDown={(event) => event.preventDefault()}
      onClick={onPress}
    >
      <Icon className="h-[18px] w-[18px]" />
    </Button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

/** A stable key per TipTap editor object. */
const editorIds = new WeakMap<object, number>();
let nextEditorId = 1;
function editorKey(editor: object | null): string {
  if (!editor) return "none";
  let id = editorIds.get(editor);
  if (id === undefined) {
    id = nextEditorId++;
    editorIds.set(editor, id);
  }
  return String(id);
}

export function MobileSlideFormatBar() {
  // The text state comes from TipTap's useEditorState, whose snapshot keeps the editor it was created with until the
  // next transaction; the editor that typing starts in usually appears a moment after the bar. One bar per editor
  // reads the state at once instead of showing disabled controls until the first keystroke.
  const editor = useEditingEditor();
  return <FormatBar key={editorKey(editor)} />;
}

function FormatBar() {
  const t = useT();
  const { el, deck, dispatch } = useSlidesEditor();
  const sel = useSlidesSelection();
  const state = useTextFormatState(sel);
  const keyboard = useVirtualKeyboard();
  const [colorOpen, setColorOpen] = useState(false);
  const off = !sel.writable || state === null;
  const align = state?.align ?? "left";
  const AlignIcon = ALIGN_ICONS[align];

  return (
    <>
      <div
        role="toolbar"
        aria-label={t("slides.panel.format")}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md"
        style={{ transform: `translateY(-${keyboard.inset}px)`, paddingBottom: keyboard.open ? 0 : "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex h-11 items-center gap-0.5 overflow-x-auto px-1 no-scrollbar">
          <BarButton icon={Bold} label={t("slides.format.bold")} active={state?.bold ?? false} disabled={off} onPress={() => state && el.formatText(markToggle(state, "bold"))} />
          <BarButton icon={Italic} label={t("slides.format.italic")} active={state?.italic ?? false} disabled={off} onPress={() => state && el.formatText(markToggle(state, "italic"))} />
          <BarButton icon={Underline} label={t("slides.format.underline")} active={state?.underline ?? false} disabled={off} onPress={() => state && el.formatText(markToggle(state, "underline"))} />
          <Divider />
          <BarButton icon={Minus} label={t("slides.mobile.decreaseSize")} disabled={off} onPress={() => el.formatText({ kind: "sizeStep", dir: -1 })} />
          <span className="min-w-7 shrink-0 text-center font-mono text-[13px] tabular-nums text-muted-foreground" aria-label={t("slides.format.fontSize")}>
            {state ? Math.round(state.size) : ""}
          </span>
          <BarButton icon={Plus} label={t("slides.mobile.increaseSize")} disabled={off} onPress={() => el.formatText({ kind: "sizeStep", dir: 1 })} />
          <Divider />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("slides.format.textColor")}
            disabled={off}
            className="shrink-0 flex-col gap-0 text-muted-foreground"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => setColorOpen(true)}
          >
            <Baseline className="h-4 w-4" />
            <span aria-hidden className="h-[3px] w-4 rounded-[1px] border border-border/60" style={{ backgroundColor: state ? resolveColor(state.color, deck.meta.theme) : "transparent" }} />
          </Button>
          <BarButton
            icon={AlignIcon}
            label={`${t("slides.format.align")}: ${t(ALIGN_KEYS[align])}`}
            disabled={off}
            onPress={() => el.formatText({ kind: "align", align: NEXT_ALIGN[align] })}
          />
          <BarButton
            icon={List}
            label={t("slides.format.bulletList")}
            active={state?.list === "bullet"}
            disabled={off}
            onPress={() => el.formatText({ kind: "list", list: state?.list === "bullet" ? "none" : "bullet" })}
          />
          <BarButton
            icon={ListOrdered}
            label={t("slides.format.numberedList")}
            active={state?.list === "ordered"}
            disabled={off}
            onPress={() => el.formatText({ kind: "list", list: state?.list === "ordered" ? "none" : "ordered" })}
          />
          <Divider />
          <BarButton icon={ChevronDown} label={t("slides.mobile.hideKeyboard")} onPress={() => dispatch({ type: "endEdit" })} />
        </div>
      </div>
      <MobileDrawer open={colorOpen} onOpenChange={setColorOpen} title={t("slides.format.textColor")}>
        <div className="flex justify-center px-4 pb-2">
          {state ? (
            <SlidesColorSwatches
              label={t("slides.format.textColor")}
              value={state.color}
              theme={deck.meta.theme}
              onPick={(color) => {
                setColorOpen(false);
                el.formatText({ kind: "color", color });
              }}
            />
          ) : null}
        </div>
      </MobileDrawer>
    </>
  );
}
