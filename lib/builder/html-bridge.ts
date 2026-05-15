// Singleton bridge that lets server-action wrappers reach into the live HTML
// editor state held by `components/builder/html-editor.tsx`. Used by the
// editBuilderHtml action so the find-replace step can validate against the
// actual current HTML and throw clean errors via the standard action toast path.

let getter: (() => string) | null = null;
let setter: ((next: string) => void) | null = null;

export function registerHtmlBridge(
  read: () => string,
  write: (next: string) => void,
): () => void {
  getter = read;
  setter = write;
  return () => {
    if (getter === read) getter = null;
    if (setter === write) setter = null;
  };
}

export function readBuilderHtml(): string {
  if (!getter) {
    throw new Error("No active builder page — open a page before editing HTML.");
  }
  return getter();
}

export function writeBuilderHtml(next: string): void {
  if (!setter) {
    throw new Error("No active builder page — open a page before editing HTML.");
  }
  setter(next);
}

export function hasHtmlBridge(): boolean {
  return getter !== null && setter !== null;
}
