"use client";

/**
 * Keyboard-anchored format bar (docs-editor-ui spec §7.4, plan D30 `useVirtualKeyboard`). Buttons prevent pointer-down
 * default so taps never blur the editor or dismiss the keyboard.
 */
import type { ComponentType } from "react";
import {
  Bold,
  ChevronDown,
  ImagePlus,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Plus,
  Underline,
} from "lucide-react";

import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import { useToolbarState } from "@/components/docs/toolbar/use-toolbar-state";
import { Button } from "@/components/ui/button";
import { useVirtualKeyboard } from "@/lib/browser-shell";
import { useT } from "@/lib/i18n/context";

export const MOBILE_FORMAT_BAR_HEIGHT = 44;

function BarButton({
  icon: Icon,
  label,
  active,
  onPress,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onPress(): void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      data-active={active ? "" : undefined}
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

export function MobileFormatBar() {
  const t = useT();
  const { editor, actions, dispatch } = useDocEditor();
  const s = useToolbarState(editor);
  const keyboard = useVirtualKeyboard();

  return (
    <div
      role="toolbar"
      aria-label={t("docs.toolbar.label")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md"
      style={{ transform: `translateY(-${keyboard.inset}px)`, paddingBottom: keyboard.open ? 0 : "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex h-11 items-center gap-0.5 overflow-x-auto px-1 no-scrollbar">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("docs.mobile.format")}
          className="shrink-0"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => dispatch({ type: "openMobileSheet", sheet: "format" })}
        >
          <span aria-hidden className="text-[15px] font-semibold">
            Aa
          </span>
        </Button>
        <BarButton icon={Bold} label={t("docs.format.bold")} active={s.bold} onPress={() => actions.toggleMark("bold")} />
        <BarButton icon={Italic} label={t("docs.format.italic")} active={s.italic} onPress={() => actions.toggleMark("italic")} />
        <BarButton icon={Underline} label={t("docs.format.underline")} active={s.underline} onPress={() => actions.toggleMark("underline")} />
        <Divider />
        <BarButton icon={ListChecks} label={t("docs.insert.checklist")} active={s.taskList} onPress={() => actions.toggleList("task")} />
        <BarButton icon={List} label={t("docs.format.bulletList")} active={s.bulletList} onPress={() => actions.toggleList("bullet")} />
        <BarButton icon={ListOrdered} label={t("docs.format.numberedList")} active={s.orderedList} onPress={() => actions.toggleList("ordered")} />
        <BarButton icon={IndentDecrease} label={t("docs.format.indentLess")} onPress={actions.outdent} />
        <BarButton icon={IndentIncrease} label={t("docs.format.indentMore")} onPress={actions.indent} />
        <Divider />
        <BarButton icon={ImagePlus} label={t("docs.insert.image")} onPress={actions.pickImageFile} />
        <BarButton icon={LinkIcon} label={t("docs.insert.link")} active={s.link} onPress={actions.openLinkEditor} />
        <Divider />
        <BarButton icon={Plus} label={t("docs.mobile.insert")} onPress={() => dispatch({ type: "openMobileSheet", sheet: "insert" })} />
        <BarButton
          icon={ChevronDown}
          label={t("docs.mobile.hideKeyboard")}
          onPress={() => {
            if (editor && !editor.isDestroyed) editor.commands.blur();
          }}
        />
      </div>
    </div>
  );
}
