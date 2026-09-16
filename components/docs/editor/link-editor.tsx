"use client";

/**
 * Desktop link editor (Mod+K, toolbar, Insert ▸ Link, bubble Edit): a popover anchored at the selection.
 */
import type { Editor } from "@tiptap/core";

import { Popover, PopoverContent } from "@/components/ui/popover";
import { useDocEditor } from "./doc-editor-context";
import { LinkFields, readLinkSelection } from "./link-fields";

function selectionAnchor(editor: Editor) {
  return {
    getBoundingClientRect: () => {
      if (editor.isDestroyed) return new DOMRect();
      const { from, to } = editor.state.selection;
      const start = editor.view.coordsAtPos(from);
      const end = editor.view.coordsAtPos(to);
      const left = Math.min(start.left, end.left);
      return new DOMRect(left, start.top, Math.max(1, Math.abs(end.right - start.left)), Math.max(1, end.bottom - start.top));
    },
  };
}

export function LinkEditorPopover({ editor }: { editor: Editor }) {
  const { ui, dispatch, actions } = useDocEditor();
  const open = ui.linkEditorOpen;

  const close = () => {
    dispatch({ type: "setLinkEditor", open: false });
    if (!editor.isDestroyed) editor.commands.focus();
  };

  const initial = open ? readLinkSelection(editor) : null;

  return (
    <Popover open={open} onOpenChange={(next) => (next ? undefined : close())}>
      {open && initial && (
        <PopoverContent anchor={selectionAnchor(editor)} side="bottom" align="start" sideOffset={6} className="w-80">
          <LinkFields
            initialHref={initial.href}
            initialText={initial.text}
            hasLink={initial.hasLink}
            onApply={(href, text) => {
              const ok = actions.applyLink(href, text);
              if (ok) dispatch({ type: "setLinkEditor", open: false });
              return ok;
            }}
            onRemove={() => {
              actions.unsetLink();
              dispatch({ type: "setLinkEditor", open: false });
            }}
          />
        </PopoverContent>
      )}
    </Popover>
  );
}
