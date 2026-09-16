/**
 * Checklist items that can be ticked while the editor is not editable (plan §E3 #44: mobile reading mode).
 *
 * Tiptap's checkbox listener writes `checked` only while the editor is editable. Otherwise it just asks
 * `onReadOnlyChecked` whether to keep the DOM checkbox ticked and leaves the write to that callback, which receives
 * no position (and a node that goes stale once the item is edited). This node view wraps Tiptap's and, when
 * `checkWhileReadOnly` is on, writes the tick through `getPos` as a normal transaction: Yjs syncs it and the node
 * view's `update` restyles the item. The schema is identical to `TaskItem`.
 */
import { TaskItem, type TaskItemOptions } from "@tiptap/extension-list";
import type { EditorView } from "@tiptap/pm/view";

export interface DocTaskItemOptions extends TaskItemOptions {
  /**
   * Write ticks made while the editor is not editable. Pair it with `onReadOnlyChecked: () => true`, which keeps
   * Tiptap's own listener from resetting the checkbox.
   */
  checkWhileReadOnly: boolean;
}

/**
 * Sets `checked` on the task item at `pos` in the node view's own view (a dispatch applies even when the view is not
 * editable). False, with nothing dispatched, when the view is gone or `pos` is not a task item.
 */
export function setTaskItemChecked(
  view: Pick<EditorView, "state" | "dispatch" | "isDestroyed">,
  pos: number | undefined,
  checked: boolean,
): boolean {
  if (view.isDestroyed || typeof pos !== "number") return false;
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "taskItem") return false;
  if (node.attrs.checked === checked) return true;
  view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked }));
  return true;
}

export const DocTaskItem = TaskItem.extend<DocTaskItemOptions>({
  addOptions() {
    const parent = this.parent?.() as TaskItemOptions;
    return { ...parent, checkWhileReadOnly: false };
  },

  addNodeView() {
    const parent = this.parent?.();
    if (!parent) return null;
    const options = this.options;
    return (props) => {
      const view = parent(props);
      const checkbox =
        view.dom instanceof HTMLElement ? view.dom.querySelector<HTMLInputElement>(':scope > label > input[type="checkbox"]') : null;
      // Runs after Tiptap's listener (registered while `parent` built the view), which already handled editable edits.
      checkbox?.addEventListener("change", () => {
        const { editor, getPos } = props;
        if (editor.isEditable || !options.checkWhileReadOnly) return;
        const checked = checkbox.checked;
        if (!setTaskItemChecked(props.view, getPos(), checked)) checkbox.checked = !checked;
      });
      return view;
    };
  },
});
