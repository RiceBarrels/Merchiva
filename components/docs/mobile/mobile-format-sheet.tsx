"use client";

/** Mobile "Aa" format sheet (docs-editor-ui spec §7.4): Text / Paragraph tabs. */
import { useState, type ComponentType } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from "lucide-react";

import { useDocEditor } from "@/components/docs/editor/doc-editor-context";
import type { AlignValue, MarkName } from "@/components/docs/editor/use-doc-actions";
import { ColorSwatches } from "@/components/docs/toolbar/color-picker";
import { FontSizeControl } from "@/components/docs/toolbar/font-size-control";
import { useToolbarState } from "@/components/docs/toolbar/use-toolbar-state";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { OptionRow } from "@/components/ui/option-row";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { BLOCK_STYLE_LABEL_KEYS, BLOCK_STYLES, DEFAULT_FONT_VALUE, DOC_FONTS, findDocFont, LINE_SPACINGS, type BlockStyle, type LineSpacing } from "@/lib/docs/fonts";
import { useT } from "@/lib/i18n/context";
import { MobileDrawer } from "./mobile-drawer";

const STYLE_PREVIEW: Readonly<Record<BlockStyle, string>> = {
  normal: "text-[15px]",
  title: "text-[22px] leading-tight",
  subtitle: "text-[17px] text-muted-foreground",
  h1: "text-[20px]",
  h2: "text-[17px]",
  h3: "text-[15px] font-semibold",
};

function ToggleButton({
  icon: Icon,
  label,
  active,
  onPress,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onPress(): void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "outline"}
      size="icon"
      aria-label={label}
      aria-pressed={active}
      className="flex-1"
      onClick={onPress}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

export function MobileFormatSheet({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const t = useT();
  const { editor, actions } = useDocEditor();
  const s = useToolbarState(editor);
  const [tab, setTab] = useState<"text" | "paragraph">("text");
  const selectedFont = findDocFont(s.fontFamily)?.css ?? DEFAULT_FONT_VALUE;

  const marks: ReadonlyArray<{ mark: MarkName; icon: ComponentType<{ className?: string }>; key: string; active: boolean }> = [
    { mark: "bold", icon: Bold, key: "docs.format.bold", active: s.bold },
    { mark: "italic", icon: Italic, key: "docs.format.italic", active: s.italic },
    { mark: "underline", icon: Underline, key: "docs.format.underline", active: s.underline },
    { mark: "strike", icon: Strikethrough, key: "docs.format.strike", active: s.strike },
  ];

  return (
    <MobileDrawer open={open} onOpenChange={onOpenChange} title={t("docs.mobile.format")}>
      <div className="px-4 pb-3">
        <SegmentedControl
          fullWidth
          aria-label={t("docs.mobile.format")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "text", label: t("docs.mobile.formatText") },
            { value: "paragraph", label: t("docs.mobile.formatParagraph") },
          ]}
        />
      </div>

      {tab === "text" ? (
        <div className="grid gap-4 px-4 pb-4">
          <div className="flex gap-1.5">
            {marks.map((m) => (
              <ToggleButton key={m.mark} icon={m.icon} label={t(m.key)} active={m.active} onPress={() => actions.toggleMark(m.mark)} />
            ))}
            <ToggleButton icon={Superscript} label={t("docs.format.superscript")} active={false} onPress={() => actions.toggleMark("superscript")} />
            <ToggleButton icon={Subscript} label={t("docs.format.subscript")} active={false} onPress={() => actions.toggleMark("subscript")} />
          </div>
          <section className="grid gap-2">
            <Eyebrow as="h3">{t("docs.toolbar.textColor")}</Eyebrow>
            <ColorSwatches kind="text" variant="compact" value={s.color} onChange={actions.setTextColor} />
          </section>
          <section className="grid gap-2">
            <Eyebrow as="h3">{t("docs.toolbar.highlight")}</Eyebrow>
            <ColorSwatches kind="highlight" variant="compact" value={s.highlight} onChange={actions.setHighlight} />
          </section>
          <section className="grid gap-2">
            <Eyebrow as="h3">{t("docs.toolbar.fontSize")}</Eyebrow>
            <FontSizeControl value={s.fontSizePt} onChange={actions.setFontSize} onStep={actions.stepFontSize} />
          </section>
          <section className="grid gap-2">
            <Eyebrow as="h3">{t("docs.toolbar.font")}</Eyebrow>
            <div role="radiogroup" aria-label={t("docs.toolbar.font")} className="grid gap-1.5">
              <OptionRow
                selected={selectedFont === DEFAULT_FONT_VALUE}
                onSelect={() => actions.setFontFamily(null)}
                title={t("docs.toolbar.fontDefault")}
                className="py-2"
              />
              {DOC_FONTS.map((font) => (
                <OptionRow
                  key={font.css}
                  selected={selectedFont === font.css}
                  onSelect={() => actions.setFontFamily(font.css)}
                  title={<span style={{ fontFamily: font.css }}>{font.label}</span>}
                  className="py-2"
                />
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="grid gap-4 px-4 pb-4">
          <section className="grid gap-2">
            <Eyebrow as="h3">{t("docs.toolbar.styles")}</Eyebrow>
            <div role="radiogroup" aria-label={t("docs.toolbar.styles")} className="grid gap-1.5">
              {BLOCK_STYLES.map((style) => (
                <OptionRow
                  key={style}
                  selected={s.blockStyle === style}
                  onSelect={() => actions.setBlockStyle(style)}
                  title={<span className={STYLE_PREVIEW[style]}>{t(BLOCK_STYLE_LABEL_KEYS[style])}</span>}
                  className="py-2"
                />
              ))}
            </div>
          </section>
          <section className="grid gap-2">
            <Eyebrow as="h3">{t("docs.toolbar.align")}</Eyebrow>
            <SegmentedControl<AlignValue>
              fullWidth
              size="lg"
              aria-label={t("docs.toolbar.align")}
              value={s.align}
              onChange={actions.setAlign}
              options={[
                { value: "left", icon: AlignLeft, label: <span className="sr-only">{t("docs.format.alignLeft")}</span> },
                { value: "center", icon: AlignCenter, label: <span className="sr-only">{t("docs.format.alignCenter")}</span> },
                { value: "right", icon: AlignRight, label: <span className="sr-only">{t("docs.format.alignRight")}</span> },
                { value: "justify", icon: AlignJustify, label: <span className="sr-only">{t("docs.format.alignJustify")}</span> },
              ]}
            />
          </section>
          <section className="grid gap-2">
            <Eyebrow as="h3">{t("docs.mobile.indent")}</Eyebrow>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={actions.outdent}>
                <IndentDecrease className="h-4 w-4" />
                {t("docs.format.indentLess")}
              </Button>
              <Button type="button" variant="outline" className="flex-1" onClick={actions.indent}>
                <IndentIncrease className="h-4 w-4" />
                {t("docs.format.indentMore")}
              </Button>
            </div>
          </section>
          <section className="grid gap-2">
            <Eyebrow as="h3">{t("docs.format.lineSpacing")}</Eyebrow>
            <SegmentedControl<LineSpacing>
              fullWidth
              size="lg"
              aria-label={t("docs.format.lineSpacing")}
              value={s.lineSpacing ?? "1.15"}
              onChange={actions.setLineSpacing}
              options={LINE_SPACINGS.map((value) => ({ value, label: <span className="font-mono tabular-nums">{value}</span> }))}
            />
          </section>
          <section className="grid gap-2">
            <Eyebrow as="h3">{t("docs.format.lists")}</Eyebrow>
            <div className="flex gap-1.5">
              <ToggleButton icon={List} label={t("docs.format.bulletList")} active={s.bulletList} onPress={() => actions.toggleList("bullet")} />
              <ToggleButton icon={ListOrdered} label={t("docs.format.numberedList")} active={s.orderedList} onPress={() => actions.toggleList("ordered")} />
              <ToggleButton icon={ListChecks} label={t("docs.insert.checklist")} active={s.taskList} onPress={() => actions.toggleList("task")} />
            </div>
          </section>
        </div>
      )}
    </MobileDrawer>
  );
}
