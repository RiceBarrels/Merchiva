// Keeps viewers from starting an edit Univer would refuse anyway (sheets.md §9.8 step 3). The workbook's
// editable permission already blocks every edit command; this capture-phase guard stops the keys, pastes, drops
// and double-clicks that would start one, so the viewer gets our hint (onBlocked → "Select Edit to make
// changes") instead of Univer's permission dialog. Copying, selecting, scrolling and find keep working: text
// fields (the find box) are never guarded. DOM only, no Univer import.

export interface ViewOnlyGuardOptions {
  /** onBlocked fires at most once per this many ms (typing a word shows one hint). Default 1000. */
  throttleMs?: number;
  now?: () => number;
}

const EDIT_KEYS: ReadonlySet<string> = new Set(["Enter", "F2", "Delete", "Backspace", "Process"]);
const EDIT_SHORTCUTS: ReadonlySet<string> = new Set(["v", "x", "z", "y"]);

/** A form field Univer does not use for cell editing (find/replace inputs, dialogs' fields). */
function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest("input, textarea, select") !== null;
}

/** True for a key press that would edit a cell or undo/redo when the grid has focus. */
export function isEditingKey(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">): boolean {
  const { key } = event;
  const mod = event.ctrlKey || event.metaKey;
  if (mod) return EDIT_SHORTCUTS.has(key.toLowerCase());
  if (EDIT_KEYS.has(key)) return true;
  return key.length === 1 && !event.altKey;
}

/** Installs the guard on Univer's container; returns the uninstall. */
export function installViewOnlyGuard(container: HTMLElement, onBlocked: () => void, options: ViewOnlyGuardOptions = {}): () => void {
  const throttleMs = options.throttleMs ?? 1000;
  const now = options.now ?? Date.now;
  let lastBlocked = Number.NEGATIVE_INFINITY;
  const block = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    const at = now();
    if (at - lastBlocked < throttleMs) return;
    lastBlocked = at;
    onBlocked();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (!isTextField(event.target) && isEditingKey(event)) block(event);
  };
  const onOther = (event: Event) => {
    if (!isTextField(event.target)) block(event);
  };
  const others = ["paste", "cut", "drop", "dblclick"] as const;
  container.addEventListener("keydown", onKeyDown, true);
  for (const type of others) container.addEventListener(type, onOther, true);
  return () => {
    container.removeEventListener("keydown", onKeyDown, true);
    for (const type of others) container.removeEventListener(type, onOther, true);
  };
}
