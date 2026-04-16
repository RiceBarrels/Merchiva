"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useNode, useEditor, type UserComponent } from "@craftjs/core";
import { TextSettings } from "../craft-settings/text-settings";

type TextTag = "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "span";

interface CraftTextProps {
  content: string;
  tag: TextTag;
  align: string;
  color: string;
  fontSize: string;
  fontWeight: string;
  padding: string;
}

const headingFont = "var(--sr-font-heading, inherit)";
const bodyFont = "var(--sr-font-body, inherit)";

const fontFamilyMap: Record<TextTag, string> = {
  h1: headingFont, h2: headingFont, h3: headingFont,
  h4: headingFont, h5: headingFont, h6: headingFont,
  p: bodyFont, span: bodyFont,
};

export const CraftText: UserComponent<CraftTextProps> = ({
  content,
  tag,
  align,
  color,
  fontSize,
  fontWeight,
  padding,
}) => {
  // Read style directly from the node — don't rely on Craft.js passing it as a prop
  const {
    connectors: { connect, drag },
    actions: { setProp },
    selected,
    nodeStyle,
  } = useNode((node) => ({
    selected: node.events.selected,
    nodeStyle: (node.data.props?.style as Record<string, string>) || null,
  }));

  const { enabled } = useEditor((state) => ({
    enabled: state.options.enabled,
  }));

  const [editing, setEditing] = useState(false);
  const editRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!selected && editing) {
      if (editRef.current) {
        const newContent = editRef.current.innerText;
        if (newContent !== content) {
          setProp((p: Record<string, unknown>) => { p.content = newContent; });
        }
      }
      setEditing(false);
    }
  }, [selected, editing, content, setProp]);

  const handleDoubleClick = useCallback(() => {
    if (!enabled) return;
    setEditing(true);
    requestAnimationFrame(() => {
      if (!editRef.current) return;
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editRef.current);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  }, [enabled]);

  const handleBlur = useCallback(() => {
    if (!editRef.current) return;
    const newContent = editRef.current.innerText;
    if (newContent !== content) {
      setProp((p: Record<string, unknown>) => { p.content = newContent; });
    }
    setEditing(false);
  }, [setProp, content]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setEditing(false);
        if (editRef.current) editRef.current.innerText = content;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        (e.target as HTMLElement).blur();
      }
    },
    [content]
  );

  const Tag = tag;

  return (
    <Tag
      ref={(ref: HTMLElement | null) => {
        editRef.current = ref;
        if (ref) connect(drag(ref));
      }}
      contentEditable={editing}
      suppressContentEditableWarning
      onDoubleClick={handleDoubleClick}
      onBlur={handleBlur}
      onKeyDown={editing ? handleKeyDown : undefined}
      style={{
        textAlign: (nodeStyle?.textAlign || align) as React.CSSProperties["textAlign"],
        color: nodeStyle?.color || color || undefined,
        fontSize: nodeStyle?.fontSize || fontSize,
        fontWeight: nodeStyle?.fontWeight || fontWeight,
        fontFamily: nodeStyle?.fontFamily || fontFamilyMap[tag],
        lineHeight: nodeStyle?.lineHeight || 1.6,
        letterSpacing: nodeStyle?.letterSpacing || undefined,
        padding,
        margin: 0,
        outline: editing ? "none" : undefined,
        cursor: editing ? "text" : undefined,
        minHeight: editing ? "1em" : undefined,
      }}
    >
      {content}
    </Tag>
  );
};

CraftText.craft = {
  displayName: "Text",
  props: {
    content: "Your text here",
    tag: "p",
    align: "left",
    fontSize: "1rem",
    fontWeight: "normal",
    color: "",
    padding: "0",
  },
  related: { settings: TextSettings },
};
